import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {advance,buildQuotes,identity,median,start,stats,signature} from './ledger-v2.mjs';
import {HORYZONT,LUKA} from '../../scraper/lib/rejestr.mjs';
const t=1794000000;
const card={klucz:'Audit 88',id:'900001',rating:88,nazwa:'Audit',cena:11000,poziom:15500,cel:15000,kupnoDo:13500};
const key=identity('ps',88,card.id,'Audit');
const batch=(at,price,{observedAt=at,platform='ps',other=[],momentum=null}={})=>buildQuotes({platform,at,
  bands:price===null?null:{platform,observedAt,byRating:{88:[{id:card.id,name:'Audit',price}],...Object.fromEntries(other)}},momentum});
function step(s,at,b,candidates=[],levels={}){
 const before=JSON.stringify(s),inputs=JSON.stringify({b,candidates,levels});
 const result=advance(s,{platform:b.platform,at,candidates,batch:b,levels});
 assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify({b,candidates,levels}),inputs);
 return result;
}
const seed=(w=card,platform='ps')=>step(null,t,batch(t,w.cena,{platform}),[w]);
const tests=[];
const test=(name,fn)=>{fn();tests.push({name,result:'PASS'});};
test('valid two distinct source observations preserve target evidence',()=>{
 let s=step(seed(),t+120,batch(t+120,15000));assert.equal(s.wyniki.length,0);
 s=step(s,t+240,batch(t+240,15000));assert.equal(s.wyniki[0].werdykt,'cel');
 assert.equal(s.wyniki[0].doCelu,2);assert.equal(s.wyniki[0].evidence.length,2);assert.equal(stats(s).cel,1);
});
test('15F: same ID under 89 cannot confirm 88 target',()=>{
 const options={other:[[89,[{id:card.id,name:'Audit',price:30000}]]]};
 let s=step(seed(),t+120,batch(t+120,12000,options));s=step(s,t+240,batch(t+240,12000,options));
 assert.equal(s.wyniki.length,0);assert.equal(s.otwarte[key].max,12000);
});
test('a unique ID in the wrong rating is not a safe fallback for a missing card',()=>{
 const b=(at)=>buildQuotes({platform:'ps',at,bands:{platform:'ps',observedAt:at,byRating:{89:[{id:card.id,name:'Audit',price:30000}]}}});
 let s=step(seed(),t+120,b(t+120));s=step(s,t+240,b(t+240));
 assert.equal(s.wyniki.length,0);assert.equal(s.otwarte[key].max,11000);assert.equal(s.otwarte[key].missingCycles,2);
});
test('15F: cached momentum quote cannot count twice or renew last seen',()=>{
 const momentum={platform:'ps',quotes:[{platform:'ps',rating:88,id:card.id,name:'Audit',price:15000,observedAt:t+120}]};
 let s=step(seed(),t+120,batch(t+120,null,{momentum}));
 s=step(s,t+240,batch(t+240,null,{momentum}));
 assert.equal(s.wyniki.length,0);assert.equal(s.otwarte[key].targetCount,1);assert.equal(s.otwarte[key].ostatnio,t+120);
 momentum.quotes[0].observedAt=t+300;
 s=step(s,t+300,batch(t+300,null,{momentum}));assert.equal(s.wyniki[0].werdykt,'cel');
});
test('15F: future momentum time is rejected',()=>{
 const momentum={platform:'ps',quotes:[{platform:'ps',rating:88,id:card.id,name:'Audit',price:15000,observedAt:t+3600}]};
 const b=batch(t+120,null,{momentum});assert.equal(Object.keys(b.quotes).length,0);
 assert.equal(step(seed(),t+120,b).otwarte[key].targetCount,0);
});
test('15F: mismatching EMA ID is rejected and frozen target survives',()=>{
 const level={platform:'ps',rating:88,id:'900002',name:'Audit',v:3,p:10000,t:t+120};
 const s=step(seed(),t+120,batch(t+120,12000),[],{[key]:level});
 assert.equal(s.otwarte[key].poziomMin,15500);assert.equal(s.otwarte[key].cel0,15000);
});
test('15F: conventional even median, empty and odd cases',()=>{
 assert.equal(median([2,10]),6);assert.equal(median([]),null);assert.equal(median([10,2,3]),3);
});
test('same profile across platforms is isolated',()=>{
 assert.notEqual(key,identity('pc',88,card.id,'Audit'));
 const ps=seed(),pc=seed(card,'pc');assert.throws(()=>advance(ps,{platform:'pc',at:t+120,batch:batch(t+120,15000,{platform:'pc'})}),/MIGRATION/);
 assert.ok(pc.otwarte[identity('pc',88,card.id,'Audit')]);
});
test('momentum quote cannot leak from PC into console batch',()=>{
 const b=batch(t+120,null,{momentum:{platform:'ps',quotes:[{platform:'pc',rating:88,id:card.id,name:'Audit',price:15000,observedAt:t+120}]}});
 assert.equal(Object.keys(b.quotes).length,0);assert.equal(step(seed(),t+120,b).otwarte[key].targetCount,0);
});
test('below-target quote resets and a new valid chain still succeeds',()=>{
 let s=step(seed(),t+120,batch(t+120,15000));s=step(s,t+240,batch(t+240,14000));
 assert.equal(s.otwarte[key].targetCount,0);
 s=step(s,t+360,batch(t+360,15000));s=step(s,t+480,batch(t+480,15000));
 assert.equal(s.wyniki[0].targetFirstObservedAt,t+360);
});
test('missing cycle resets confirmation, duplicate does not count',()=>{
 let s=step(seed(),t+120,batch(t+120,15000));s=step(s,t+180,batch(t+180,null));
 assert.equal(s.otwarte[key].targetCount,0);
 s=step(s,t+240,batch(t+240,15000));assert.equal(s.wyniki.length,0);
 s=step(s,t+360,batch(t+360,15000));assert.equal(s.wyniki[0].coverage.missingCycles,1);
});
test('gap >600 starts a new chain, exact 600 is accepted',()=>{
 let a=step(seed(),t+120,batch(t+120,15000));a=step(a,t+721,batch(t+721,15000));
 assert.equal(a.wyniki.length,0);assert.equal(a.otwarte[key].targetCount,1);assert.equal(a.otwarte[key].continuityBreaks,1);
 let b=step(seed(),t+120,batch(t+120,15000));b=step(b,t+720,batch(t+720,15000));assert.equal(b.wyniki[0].werdykt,'cel');
});
test('same cycle retry is idempotent across JSON restart; backwards time rejected',()=>{
 const s=step(seed(),t+120,batch(t+120,15000));
 assert.deepEqual(step(JSON.parse(JSON.stringify(s)),t+120,batch(t+120,15000)),s);
 assert.throws(()=>step(s,t+119,batch(t+119,15000)),/BACKWARDS/);
});
test('out-of-order source time does not confirm target',()=>{
 let s=step(seed(),t+240,batch(t+240,15000));s=step(s,t+300,batch(t+300,15000,{observedAt:t+180}));
 assert.equal(s.wyniki.length,0);assert.equal(s.otwarte[key].targetCount,0);assert.equal(s.otwarte[key].ostatnio,t+240);
});
test('same time with a different price cannot change accepted evidence',()=>{
 let s=step(seed(),t+120,batch(t+120,12000));s=step(s,t+240,batch(t+240,15000,{observedAt:t+120}));
 assert.equal(s.otwarte[key].max,12000);assert.equal(s.otwarte[key].targetCount,0);
});
test('freshness includes 600, rejects 601; unknown observation time rejected',()=>{
 assert.equal(Object.keys(batch(t+600,15000,{observedAt:t}).quotes).length,1);
 assert.equal(Object.keys(batch(t+601,15000,{observedAt:t}).quotes).length,0);
 const b=buildQuotes({platform:'ps',at:t+120,bands:{platform:'ps',byRating:{88:[{id:card.id,name:'Audit',price:15000}]}}});assert.equal(Object.keys(b.quotes).length,0);
});
test('legacy momentum without rating/name/time is not guessed',()=>{
 const b=batch(t+120,null,{momentum:{platform:'ps',karty:{Audit:{id:card.id,cena:15000,ostatnio:t+120}}}});
 assert.equal(Object.keys(b.quotes).length,0);assert.ok(b.rejected.length);
});
test('conflicting exact quotes are blocked rather than picked by order',()=>{
 const b=buildQuotes({platform:'ps',at:t,bands:{platform:'ps',observedAt:t,byRating:{88:[{id:card.id,name:'Audit',price:11000},{id:card.id,name:'Audit',price:15000}]}}});
 assert.equal(Object.keys(b.quotes).length,0);assert.equal(b.rejected[0].reason,'conflicting-identity');
});
test('verified band quote has priority over matching momentum',()=>{
 const b=batch(t,11000,{momentum:{platform:'ps',quotes:[{platform:'ps',rating:88,id:card.id,name:'Audit',price:30000,observedAt:t}]}});
 assert.equal(b.quotes[key].source,'band');assert.equal(b.quotes[key].price,11000);
});
test('new contract archives legacy open and closed rows byte-for-byte structurally',()=>{
 const old={def:'old',otwarte:{x:{id:'123',cel0:999}},wyniki:[{def:'old',werdykt:'cel',doCelu:2}]};
 const text=JSON.stringify(old),s=start('ps',old);
 assert.equal(JSON.stringify(old),text);assert.equal(JSON.stringify(s.legacy.original),text);
 assert.equal(stats(s).closed,0);assert.notEqual(s.def,old.def);assert.ok(s.def.endsWith('measurement2-g600'));
 const advanced=step(s,t,batch(t,11000),[card]);assert.equal(JSON.stringify(advanced.legacy.original),text);
});
test('different/future contract or definition cannot be mixed',()=>{
 assert.throws(()=>start('ps',{contract:3}),/MIGRATION/);
 const s=seed();s.def='wrong';assert.throws(()=>stats(s));
 const b=seed();b.wyniki.push({contract:1,def:'old',platform:'ps'});assert.throws(()=>stats(b),/MIXED/);
});
test('positive matching EMA updates diagnosis without moving target',()=>{
 const p={platform:'ps',rating:88,id:card.id,name:'Audit',v:3,p:10000,t:t+120};
 const s=step(seed(),t+120,batch(t+120,12000),[],{[key]:p});assert.equal(s.otwarte[key].poziomMin,10000);assert.equal(s.otwarte[key].cel0,15000);
});
test('future or stale EMA cannot change diagnosis',()=>{
 for(const timestamp of [t+3600,t-7201]){
  const p={platform:'ps',rating:88,id:card.id,name:'Audit',v:3,p:10000,t:timestamp};
  assert.equal(step(seed(),t+120,batch(t+120,12000),[],{[key]:p}).otwarte[key].poziomMin,15500);
 }
});
test('absence closes unknown, excludes it from conditional denominator but reports it',()=>{
 const s=step(seed(),t+LUKA+1,batch(t+LUKA+1,null));assert.equal(s.wyniki[0].werdykt,'urwane');
 const sk=stats(s);assert.equal(sk.known,0);assert.equal(sk.conditionalPct,null);assert.equal(sk.scenarioLowerPct,0);assert.equal(sk.scenarioUpperPct,100);
});
test('same evidence cannot resurrect a row after >2h outage',()=>{
 const s=step(seed(),t+LUKA+1,batch(t+LUKA+1,15000));assert.equal(s.wyniki[0].werdykt,'urwane');
});
test('event after 24h cannot complete a chain begun before horizon',()=>{
 let s=seed();for(let dt=3600;dt<HORYZONT-120;dt+=3600)s=step(s,t+dt,batch(t+dt,12000));
 s=step(s,t+HORYZONT-120,batch(t+HORYZONT-120,15000));
 s=step(s,t+HORYZONT+60,batch(t+HORYZONT+60,15000));
 assert.notEqual(s.wyniki[0].werdykt,'cel');
});
test('at least 60s after entry and 60s span are needed',()=>{
 let s=step(seed(),t+30,batch(t+30,15000));assert.equal(s.otwarte[key].targetCount,0);
 s=step(s,t+60,batch(t+60,15000));s=step(s,t+90,batch(t+90,15000));assert.equal(s.wyniki.length,0);
 s=step(s,t+120,batch(t+120,15000));assert.equal(s.wyniki[0].targetFirstObservedAt,t+60);
});
test('candidate above buy limit is labeled candidate, never execution',()=>{
 const s=seed({...card,cena:14000});assert.equal(s.otwarte[key].inReachAtSignal,false);assert.equal(s.otwarte[key].purchaseConfirmed,false);
});
test('unsupported candidate price cannot be registered against another quote',()=>{
 const s=step(null,t,batch(t,12000),[card]);assert.equal(Object.keys(s.otwarte).length,0);
});
test('malformed state cannot silently erase history',()=>{
 const s=seed();s.otwarte[key].cel0=10000;assert.throws(()=>step(s,t+120,batch(t+120,15000)),/INVALID_OPEN/);
});
test('statistics uses conventional median on two genuine v2 target results',()=>{
 const other={...card,id:'900002',nazwa:'Other',klucz:'Other 88'};
 const pack=(at,a,b)=>buildQuotes({platform:'ps',at,bands:{platform:'ps',observedAt:at,byRating:{88:[{id:card.id,name:'Audit',price:a},{id:other.id,name:'Other',price:b}]}}});
 let s=step(null,t,pack(t,11000,11000),[card,other]);
 s=step(s,t+120,pack(t+120,15000,11000));s=step(s,t+240,pack(t+240,15000,11000));
 s=step(s,t+600,pack(t+600,15000,15000));s=step(s,t+660,pack(t+660,15000,15000));
 assert.deepEqual(s.wyniki.map(r=>r.doCelu),[2,10]);assert.equal(stats(s).medianMinutes,6);
});
test('tampered target evidence cannot be scored',()=>{
 let s=step(seed(),t+120,batch(t+120,15000));s=step(s,t+240,batch(t+240,15000));
 s.wyniki[0].evidence[1].observedAt=s.wyniki[0].evidence[0].observedAt;
 assert.throws(()=>stats(s),/INVALID_TARGET/);
});
const summary={contract:2,signature:signature(),passed:tests.length,tests};
writeFileSync(new URL('./tests-result.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
