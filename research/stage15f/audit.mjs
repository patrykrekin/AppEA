import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {dopiszRejestr,zrodloCen,skutecznoscInw,definicja,LUKA} from '../../scraper/lib/rejestr.mjs';
import {validate} from '../../scraper/validate.mjs';
const here=new URL('./',import.meta.url),root=new URL('../../',import.meta.url);
const protocol=JSON.parse(readFileSync(new URL('./protocol.json',import.meta.url)));
const blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
for(const [path,expected] of Object.entries({'scraper/lib/rejestr.mjs':protocol.ledgerBlob,'index.html':protocol.uiBlob,'scraper/lib/okazje.mjs':'a1127e90900fe84c0c9a06b129a6cd33db730476','scraper/lib/grid.mjs':'b18e580f097a03870f6634a16a06be983b3b8188','scraper/lib/klucz-karty.mjs':'961e3d99bdc2629c8799b65366b1be81958ac6b6','scraper/validate.mjs':'ac45b965c38c7dad37a16e887b46d60f0f0b3d1b','scraper/lib/kontrolki.mjs':'4d6e3c2fcd045677adcb18891b492a8dcf88e86d'}))assert.equal(blob(readFileSync(new URL(path,root))),expected);
const raw=execFileSync('git',['show',protocol.sourceCommit+':data.json'],{cwd:root,maxBuffer:5*1024*1024});
assert.equal(blob(raw),protocol.sourceDataBlob);
const data=JSON.parse(raw),def=definicja(),t=1794000000;
const report={protocol,sourceAt:data.at,sourceIso:new Date(data.at*1000).toISOString(),sourceAwaria:data.awaria,tests:[],liveSnapshot:{}};
const add=(id,kind,evidence)=>report.tests.push({id,kind,evidence});
const card={klucz:'Audit 88',id:'900001',rating:88,nazwa:'Audit',cena:11000,poziom:15500,cel:15000,kupnoDo:13500,rabat:29,wzasiegu:true};
const seed=(w=card)=>dopiszRejestr({},t,[structuredClone(w)],{},{});
const view=(price,id=card.id)=>({['@id:'+id]:{id,cena:price,skad:'pasmo'}});
const call=(state,at,prices,levels={})=>{
 const before=JSON.stringify(state),out=dopiszRejestr(state,at,[],prices,levels);
 assert.equal(JSON.stringify(state),before,'fixture input mutation');return out;
};
// Candidate semantics: a false inReach flag does not prevent registration.
const over={...card,cena:14000,wzasiegu:false};
assert.ok(seed(over).otwarte[card.klucz]);
add('candidate-without-purchase','contract',{registeredAboveBuyLimit:true,purchaseEventRequired:false});
// Frozen target survives a declining daily EMA; no lower target is substituted.
let s=call(seed(),t+120,view(12000),{[card.klucz]:{v:3,p:12000}});
assert.equal(s.otwarte[card.klucz].cel0,15000);
assert.equal(s.otwarte[card.klucz].poziomMin,12000);
add('frozen-target','pass',{target:15000,newDailyLevel:12000});
// A single touch is insufficient, a below-target quote resets, two distinct band reads confirm.
s=call(seed(),t+120,view(15000));assert.equal(s.wyniki.length,0);
s=call(s,t+240,view(14000));assert.equal(s.otwarte[card.klucz].celN,0);
s=call(s,t+360,view(15000));assert.equal(s.wyniki.length,0);
s=call(s,t+480,view(15000));assert.equal(s.wyniki[0].werdykt,'cel');assert.equal(s.wyniki[0].doCelu,6);
add('two-quotes-and-reset','pass',{singleTouchDoesNotClose:true,belowTargetResets:true,timeMinutesFromFirstQualifyingTouch:6});
// Two ratings share a profile ID. Even exact-name rating key cannot protect ID-only lookup.
const bands={88:[{name:'Audit',id:card.id,price:12000}],89:[{name:'Audit',id:card.id,price:30000}]};
const prices=zrodloCen(bands,null,t+120);
assert.equal(prices[card.klucz].cena,12000);assert.equal(prices['@id:'+card.id].cena,30000);
s=call(seed(),t+120,prices);s=call(s,t+240,zrodloCen(bands,null,t+240));
assert.equal(s.wyniki[0].werdykt,'cel');
const validationCase=structuredClone(data);validationCase.rejestr.ps=s;validationCase.skutecznosc.ps=skutecznoscInw(s);
assert.equal(validate(validationCase).err.length,0);
add('cross-rating-id-alias','confirmed-counterexample',{actual88Price:12000,target88:15000,aliasTakenFrom89:30000,verdict:s.wyniki[0].werdykt,validatorAcceptsFalseTarget:true});
// The exact same momentum source observation can be counted in two processing cycles.
const momentum={karty:{[card.klucz]:{id:card.id,cena:15000,ostatnio:t+120}}};
s=call(seed(),t+120,zrodloCen({},momentum,t+120));
assert.equal(s.wyniki.length,0);
s=call(s,t+240,zrodloCen({},momentum,t+240));assert.equal(s.wyniki[0].werdykt,'cel');
add('reused-momentum-quote','confirmed-counterexample',{uniqueSourceTimes:1,processingTimes:[t+120,t+240],verdict:s.wyniki[0].werdykt});
// Future timestamps pass the one-sided age test; source timestamp is discarded.
const future=zrodloCen({}, {karty:{[card.klucz]:{id:card.id,cena:15000,ostatnio:t+3600}}}, t+120);
assert.ok(future['@id:'+card.id]);
add('future-momentum-time','confirmed-counterexample',{sourceTime:t+3600,processingTime:t+120,accepted:true});
const stale=zrodloCen({},momentum,t+120+601);assert.equal(stale['@id:'+card.id],undefined);
add('stale-momentum','pass',{ageSeconds:601,rejected:true});
// Missing observations do not reset a partially completed target sequence.
s=call(seed(),t+120,view(15000));s=call(s,t+240,{});
assert.equal(s.otwarte[card.klucz].celN,1);
s=call(s,t+3600,view(15000));assert.equal(s.wyniki[0].werdykt,'cel');
add('gap-between-target-quotes','contract-limitation',{missingCycleResets:false,gapSeconds:3480,verdict:s.wyniki[0].werdykt});
// Identity mismatch in post-update EMA is also ignored when name/rating key matches.
s=call(seed(),t+120,view(12000),{[card.klucz]:{v:3,id:'900002',p:10000}});
assert.equal(s.otwarte[card.klucz].poziomMin,10000);
add('daily-ema-id-mismatch','confirmed-counterexample',{rowId:card.id,emaId:'900002',wrongIdentityUpdatedLevel:true});
// Absence closes unknown unless a level-decline diagnosis takes precedence.
s=call(seed(),t+LUKA+1,{});assert.equal(s.wyniki[0].werdykt,'urwane');
let prior=seed();prior=call(prior,t+120,{}, {[card.klucz]:{v:3,id:card.id,p:10000}});
prior=call(prior,t+120+LUKA+1,{});assert.equal(prior.wyniki[0].werdykt,'poziom');
add('verdict-priority','contract',{noPrice:'urwane',noPriceAfterKnownLevelDecline:'poziom'});
// Counterexample for conventional even-n median; bucket arithmetic is independent.
const fake={otwarte:{},wyniki:[{def,werdykt:'cel',doCelu:2},{def,werdykt:'cel',doCelu:10},{def,werdykt:'glebiej',doCelu:null},{def,werdykt:'urwane',doCelu:null}]};
const sk=skutecznoscInw(fake);assert.equal(sk.znane,3);assert.equal(sk.trafienie,67);assert.equal(sk.medianaDoCelu,10);
add('conditional-denominator-and-even-median','confirmed-counterexample',{allClosed:4,known:3,target:2,conditionalPct:67,scenarioBoundsPct:[50,75],reportedMedianMinutes:10,conventionalMedianMinutes:6});

const conventionalMedian=a=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b),k=s.length>>1;return s.length%2?s[k]:(s[k-1]+s[k])/2;};
for(const side of ['ps','pc']){
 const ledger=data.rejestr[side],computed=skutecznoscInw(ledger),published=data.skutecznosc[side];
 assert.deepEqual(computed,published,'published stats differ from unchanged ledger function');
 const groups={current:ledger.wyniki.filter(r=>r.def===def),older:ledger.wyniki.filter(r=>r.def!==def)};
 const groupResults={};
 for(const [name,rows] of Object.entries(groups)){
  const counts={cel:0,poziom:0,glebiej:0,plasko:0,urwane:0};
  for(const r of rows){assert.ok(r.werdykt in counts);counts[r.werdykt]++;}
  const known=rows.length-counts.urwane;
  const times=rows.filter(r=>r.werdykt==='cel').map(r=>r.doCelu).filter(Number.isFinite);
  const expected=known?Math.round(100*counts.cel/known):null;
  const actual=name==='current'?computed:computed.starsze;
  if(actual){assert.equal(expected,actual.trafienie);assert.equal(known,actual.znane);}
  groupResults[name]={n:rows.length,known,...counts,conditionalPct:expected,
    lowerScenarioPct:rows.length?100*counts.cel/rows.length:null,
    upperScenarioPct:rows.length?100*(counts.cel+counts.urwane)/rows.length:null,
    reportedMedianMinutes:actual?.medianaDoCelu??null,conventionalMedianMinutes:conventionalMedian(times),
    observedEntryAboveBuyLimit:rows.filter(r=>r.sufit>0&&r.wejscie>r.sufit).length,
    withProfileId:rows.filter(r=>!!r.id).length};
 }
 report.liveSnapshot[side]={retainedClosed:ledger.wyniki.length,open:Object.keys(ledger.otwarte).length,publishedMatchesRecomputation:true,groups:groupResults,
  warning:'retained last 150 per platform; not lifetime sample or trade execution record'};
}
const oldSnapshot=JSON.parse(readFileSync(new URL('../stage15b/input/shadow-stage8.json',import.meta.url))).migawka;
report.priorRealMultiRatingIds={};
for(const side of ['ps','pc']){
 const map=new Map();for(const r of oldSnapshot[side]){const a=map.get(r[1])??[];a.push({rating:r[0],name:r[17]});map.set(r[1],a);}
 report.priorRealMultiRatingIds[side]=[...map].filter(([id,a])=>new Set(a.map(x=>x.rating)).size>1).map(([id,rows])=>({id,rows}));
}
const ui=readFileSync(new URL('index.html',root),'utf8');
report.frontendStatic={ledgerStatsIdentifierPresent:ui.includes('skutecznosc'),personalPlanTargetLabelPresent:ui.includes('cel osiągnięty'),scope:'static source only; personal plan is separate from frozen ledger targets; no browser rendering or runtime proof'};
assert.equal(report.frontendStatic.ledgerStatsIdentifierPresent,false);
writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
console.log('AUDIT COMPLETE: controls passed; confirmed counterexamples are known defects, not repaired by this audit');
