import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {aktualizujPoziomyD,policzInwestycje} from '../../scraper/lib/okazje.mjs';
import {identity} from '../stage15g/ledger-v2.mjs';
import {adaptFrame,fingerprint} from './adapter.mjs';
export const origin=1794000000;
export function fixture(cycleAt=origin,{sequence=1,price=11000,mode='fixture'}={}){
  const frame={schema:1,cycleId:'cycle-'+cycleAt,cycleAt,completedAt:cycleAt+5,mode,reads:{},preFast:{},preSlow:{},persistenceAfter:{},decisions:{},levelsAfter:{}};
  for(const [i,side] of ['ps','pc'].entries()){
    const model={id:'900001',v:3,p:15500,n:80,t:cycleAt-300,od:cycleAt-20000};
    frame.reads[side]={platform:side,sequence,observedAt:cycleAt+1+i,bands:{88:[{id:'900001',name:'Audit',price}]}};
    frame.preFast[side]={'Audit 88':{...model}};frame.preSlow[side]={'Audit 88':{...model}};
    frame.persistenceAfter[side]={'Audit 88':{id:'900001',n:10,od:cycleAt-2000,t:cycleAt}};
  }
  return compute(frame);
}
export function compute(frame){
  for(const side of ['ps','pc']){
    frame.decisions[side]=policzInwestycje(frame.reads[side].bands,frame.preSlow[side],frame.persistenceAfter[side],frame.cycleAt);
    frame.levelsAfter[side]=aktualizujPoziomyD(frame.preSlow[side],frame.preFast[side],frame.reads[side].bands,frame.cycleAt);
  }
  return frame;
}
const tests=[];
const test=(name,fn)=>{fn();tests.push({name,result:'PASS'});};
const step=(s,f,options)=>{
  const before=fingerprint({s,f,options});const x=adaptFrame(s,f,options);
  assert.equal(fingerprint({s,f,options}),before);return x;
};
test('adapts both platforms with exact recommendation and post-model parity',()=>{
 const f=fixture(),s=step(null,f);for(const side of ['ps','pc']){assert.equal(s.diagnostics[side].decisionParity,true);assert.equal(s.diagnostics[side].postModelParity,true);assert.equal(s.statistics[side].open,1);}
});
test('preserves acquisition time, raw model clock and separate derived frame time',()=>{
 const f=fixture(),s=step(null,f),key=identity('ps',88,'900001','Audit');
 assert.equal(s.states.ps.otwarte[key].ostatnio,origin+1);assert.equal(s.modelEvidence.ps[key].modelAt,origin);
 assert.equal(s.modelEvidence.ps[key].t,origin+5);assert.equal(s.modelEvidence.ps[key].observedAt,origin+1);
 assert.equal(s.states.ps.otwarte[key].poziom,f.levelsAfter.ps['Audit 88'].p);
 assert.equal(s.states.ps.otwarte[key].cel0,f.decisions.ps[0].cel);
});
test('correct derived models may update an existing row without moving its frozen target',()=>{
 let s=step(null,fixture()),key=identity('ps',88,'900001','Audit'),target=s.states.ps.otwarte[key].cel0;
 const f=fixture(origin+120,{sequence:2,price:12000});s=step(s,f);
 assert.equal(s.states.ps.otwarte[key].poziom,f.levelsAfter.ps['Audit 88'].p);assert.equal(s.states.ps.otwarte[key].cel0,target);
});
test('two distinct source receipts confirm correct target with original source time',()=>{
 let s=step(null,fixture());s=step(s,fixture(origin+120,{sequence:2,price:16000}));s=step(s,fixture(origin+240,{sequence:3,price:16000}));
 assert.equal(s.statistics.ps.cel,1);assert.equal(s.statistics.pc.cel,1);
 assert.equal(s.states.ps.wyniki[0].targetFirstObservedAt,origin+121);
 assert.equal(s.states.ps.wyniki[0].evidence[0].processedAt,origin+125);
});
test('archived or published data without explicit frame receipts is rejected',()=>{
 assert.throws(()=>adaptFrame(null,{at:origin,data:{}}),/EXPLICIT_FRAME/);
 const f=fixture();delete f.reads.ps.observedAt;assert.throws(()=>adaptFrame(null,f),/INVALID_READ/);
});
test('future and pre-cycle receipts are rejected',()=>{
 for(const observedAt of [origin-1,origin+6]){const f=fixture();f.reads.ps.observedAt=observedAt;assert.throws(()=>adaptFrame(null,f),/INVALID_READ/);}
});
test('processing completion cannot precede cycle start',()=>{
 const f=fixture();f.completedAt=origin-1;assert.throws(()=>adaptFrame(null,f),/EXPLICIT_FRAME/);
});
test('freshness remains bounded when processing is delayed',()=>{
 const f=fixture();f.completedAt=origin+602;assert.throws(()=>adaptFrame(null,f),/QUOTES_REJECTED/);
});
test('cached read cannot be restamped into a new sequence-less cycle',()=>{
 const s=step(null,fixture()),f=fixture(origin+120,{sequence:1});assert.throws(()=>step(s,f),/READ_RECEIPT_REUSED/);
});
test('same source timestamp cannot be presented as a newer read',()=>{
 const s=step(null,fixture()),f=fixture(origin+120,{sequence:2});f.reads.ps.observedAt=origin+1;
 assert.throws(()=>step(s,f),/INVALID_READ/);
});
test('an identical serialized retry is idempotent even with reordered object keys',()=>{
 const f=fixture(),s=step(null,f),retry=JSON.parse(JSON.stringify(f));
 const reordered={...retry,reads:{pc:retry.reads.pc,ps:retry.reads.ps}};
 assert.deepEqual(step(JSON.parse(JSON.stringify(s)),reordered),s);
});
test('changed payload under reused cycle ID is rejected',()=>{
 const f=fixture(),s=step(null,f),next=fixture(origin+120,{sequence:2});next.cycleId=f.cycleId;
 assert.throws(()=>step(s,next),/FRAME_ID_REUSED/);
});
test('two different frames cannot silently share the engine processing timestamp',()=>{
 const s=step(null,fixture()),f=fixture(origin+1,{sequence:2});f.completedAt=origin+5;
 assert.throws(()=>step(s,f),/FRAME_TIME_COLLISION/);
});
test('backwards cycle is rejected',()=>{
 const s=step(null,fixture()),f=fixture(origin-120,{sequence:2});assert.throws(()=>step(s,f),/BACKWARDS/);
});
test('fixture outputs cannot later be mixed with a captured stream',()=>{
 const s=step(null,fixture()),f=fixture(origin+120,{sequence:2,mode:'captured'});assert.throws(()=>step(s,f),/MIGRATION/);
});
test('cross-platform receipt cannot be relabeled by adapter',()=>{
 const f=fixture();f.reads.ps.platform='pc';assert.throws(()=>adaptFrame(null,f),/INVALID_READ/);
});
test('mutated recommendation fails exact parity rather than adjusting it',()=>{
 const f=fixture();f.decisions.ps[0].cel+=250;assert.throws(()=>adaptFrame(null,f),/DECISION_PARITY/);
});
test('post-update EMA must match unchanged production function',()=>{
 const f=fixture();f.levelsAfter.ps['Audit 88'].p+=100;assert.throws(()=>adaptFrame(null,f),/POST_MODEL_PARITY/);
});
test('post-update model supplied as pre-update input is rejected',()=>{
 const f=fixture();f.preSlow.ps['Audit 88'].t=f.cycleAt;assert.throws(()=>adaptFrame(null,f),/NOT_PRE_UPDATE/);
});
test('unobserved retained models keep raw clock and do not become new model evidence',()=>{
 const f=fixture();f.preSlow.ps['Gone 89']={id:'900002',v:3,p:20000,n:80,t:origin-300,od:origin-20000};compute(f);
 const s=step(null,f);assert.equal(s.diagnostics.ps.retainedModelsNotRestamped,1);assert.equal(Object.keys(s.modelEvidence.ps).length,1);
});
test('ambiguous name+rating from two IDs is rejected before model routing',()=>{
 const f=fixture();f.reads.ps.bands[88].push({name:'Audit',id:'900002',price:11000});compute(f);
 assert.throws(()=>adaptFrame(null,f),/AMBIGUOUS_OR_INVALID/);
});
test('bad second platform cannot commit first platform or mutate previous state',()=>{
 const s=step(null,fixture()),before=fingerprint(s),f=fixture(origin+120,{sequence:2});f.levelsAfter.pc['Audit 88'].p+=100;
 assert.throws(()=>step(s,f),/POST_MODEL_PARITY_pc/);assert.equal(fingerprint(s),before);
});
test('legacy closed and open rows remain unchanged and excluded',()=>{
 const legacy={ps:{at:origin-1,def:'old',otwarte:{a:{x:1}},wyniki:[{werdykt:'cel',doCelu:2}]},pc:{at:origin-1,otwarte:{},wyniki:[]}};
 const s=step(null,fixture(),{legacy});assert.deepEqual(s.states.ps.legacy.original,legacy.ps);assert.equal(s.statistics.ps.closed,0);
 assert.throws(()=>step(s,fixture(origin+120,{sequence:2}),{legacy}),/LEGACY_ALREADY/);
});
test('future legacy snapshot cannot leak into a historical replay',()=>{
 assert.throws(()=>adaptFrame(null,fixture(),{legacy:{ps:{at:origin+1000}}}),/FUTURE_LEGACY/);
});
writeFileSync(new URL('./adapter-tests-result.json',import.meta.url),JSON.stringify({passed:tests.length,tests},null,2)+'\n');
console.log(JSON.stringify({passed:tests.length,tests},null,2));
