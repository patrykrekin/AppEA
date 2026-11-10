import {writeFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {adaptFrame,fingerprint} from '../stage15h/adapter.mjs';
import {KOSZYK} from '../../scraper/lib/indeks.mjs';
import {readPrevious} from './state.mjs';
const receipts={},goAttempts=[];
const cycle=Number(process.env.STAGE15J_CYCLE);
const selected=bands=>Object.fromEntries(Object.entries(bands).filter(([r])=>KOSZYK.includes(Number(r))));
const clone=x=>structuredClone(x);
const output=()=>{
 const dir=realpathSync(process.env.STAGE15J_DIR??'');
 const workspace=realpathSync(process.env.GITHUB_WORKSPACE??'');
 assert.ok(path.isAbsolute(dir)&&path.relative(workspace,dir).startsWith('..'),'output must be outside checkout');
 const dataDir=realpathSync(path.dirname(path.resolve(process.env.FUT_DATA??'')));
 assert.ok(path.relative(workspace,dataDir).startsWith('..'),'isolated data must be outside checkout');
 assert.equal(path.basename(process.env.FUT_DATA??''),'data.json');
 return dir;
};
function save(name,obj,limit=1048576){
 const body=JSON.stringify(obj,null,2)+'\n';assert.ok(Buffer.byteLength(body)<=limit,'artifact byte cap: '+name);
 writeFileSync(path.join(output(),name),body,{flag:'wx'});
}
export function recordGoAttempt(url){
 const u=new URL(url);assert.ok(!/^\/players\/\d+/.test(u.pathname),'no individual card navigation');
 goAttempts.push({host:u.hostname,path:u.pathname});
 assert.ok(goAttempts.length<=24,'navigation attempt cap');
}
export function recordRead(side,bands,observedAtMs,monoNs,cookie){
 assert.ok(cycle===1||cycle===2,'exactly two bounded cycles');
 assert.ok(['ps','pc'].includes(side)&&!receipts[side],'one bundle per platform');
 assert.ok(Number.isSafeInteger(observedAtMs)&&observedAtMs>0);
 const normalized=side==='ps'&&!cookie?'ps5':cookie;
 assert.equal(normalized,side==='ps'?'ps5':'pc','platform cookie evidence');
 receipts[side]={platform:side,sequence:cycle,observedAt:Math.floor(observedAtMs/1000),observedAtMs,
   monotonicNs:String(monoNs),cookie:normalized,fullBandsDigest:fingerprint(bands),
   selectedBandsDigest:fingerprint(selected(bands)),bands:clone(selected(bands))};
}
export function captureContext({cycleAt,bands,preFast,preSlow,persistenceAfter,decisions,levelsAfter}){
 const input={cycleAt,bands,preFast,preSlow,persistenceAfter,decisions,levelsAfter};
 const before=fingerprint(input),started=process.hrtime.bigint();
 assert.ok(receipts.ps&&receipts.pc,'both actual receipts required');
 assert.ok(BigInt(receipts.pc.monotonicNs)>=BigInt(receipts.ps.monotonicNs));
 for(const side of ['ps','pc']){
   assert.equal(fingerprint(bands[side]),receipts[side].fullBandsDigest);
   assert.equal(fingerprint(selected(bands[side])),receipts[side].selectedBandsDigest);
 }
 const completedAtMs=Date.now(),completedMonoNs=process.hrtime.bigint();
 assert.ok(completedAtMs>=receipts.pc.observedAtMs&&completedMonoNs>=BigInt(receipts.pc.monotonicNs));
 const frame={schema:1,mode:'captured',cycleId:`stage15j-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${cycle}`,
   cycleAt,completedAt:Math.floor(completedAtMs/1000),reads:{},preFast:clone(preFast),preSlow:clone(preSlow),
   persistenceAfter:clone(persistenceAfter),decisions:clone(decisions),levelsAfter:clone(levelsAfter)};
 for(const side of ['ps','pc'])frame.reads[side]={platform:side,sequence:cycle,observedAt:receipts[side].observedAt,bands:clone(receipts[side].bands)};
 const stateFile=process.env.STAGE15J_STATE;
 assert.ok(stateFile&&path.isAbsolute(stateFile));
 assert.ok(path.relative(realpathSync(process.env.GITHUB_WORKSPACE),realpathSync(path.dirname(stateFile))).startsWith('..'));
 const previous=readPrevious(stateFile,cycle);
 const shadow=adaptFrame(previous.adapter,frame);
 assert.equal(fingerprint(input),before,'original decision context mutated');
 save('frame.json',frame,524288);
 save('shadow.json',shadow);
 save('capture.json',{mode:'captured',cycle,processId:process.pid,previousCycle:previous.cycle,previousStateDigest:previous.digest,
   completedAtMs,completedMonotonicNs:String(completedMonoNs),
   receipts:Object.fromEntries(['ps','pc'].map(side=>{const {bands,...meta}=receipts[side];return [side,meta];})),
   adapterDurationMs:Number(process.hrtime.bigint()-started)/1e6,inputUnchanged:true,
   summary:shadow.diagnostics,statistics:shadow.statistics});
 console.log('STAGE15J_CAPTURE '+JSON.stringify({mode:'captured',cycle,processId:process.pid,summary:shadow.diagnostics,inputUnchanged:true}));
}
export function finishCapture(){
 save('navigation.json',{goAttempts:goAttempts.length,attempts:goAttempts,individualCardNavigation:0});
}
