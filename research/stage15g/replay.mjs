import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildQuotes,advance,start,stats,identity} from './ledger-v2.mjs';
import {zrodloCen} from '../../scraper/lib/rejestr.mjs';
const root=new URL('../../',import.meta.url),sha=x=>createHash('sha256').update(x).digest('hex');
const blob=x=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${x.length}\0`),x])).digest('hex');
const historyRaw=readFileSync(new URL('historia-kart.json',root));
assert.equal(blob(historyRaw),'dab4f4fe62c0ef99bf81aa4cbf36eb3700153cf1');
const raw=readFileSync(new URL('../stage15b/input/shadow-stage8.json',import.meta.url));
assert.equal(sha(raw),'b5c5362f9be8da99d9f48de9e2f4aa89c7791f73853a22f4e3ae60a0e16f3b6e');
const h=JSON.parse(historyRaw),snapshot=JSON.parse(raw).migawka,t=snapshot.czasOdczytuStart;
const snapshotCommit='55d3b2e8ca0780448741bf0d5637796ae36c9d8c';
const currentRaw=execFileSync('git',['show',snapshotCommit+':data.json'],{cwd:root,maxBuffer:5*1024*1024});
assert.equal(blob(currentRaw),'4745969730b15d6cebfc3664bf778818cad56a72');
const current=JSON.parse(currentRaw);
const result={scope:'format and provenance replay, not an efficacy backtest',replayOrigin:t,replayHours:12,levelsReconstructed:false,platforms:{},migration:{},momentumCoverage:{}};
for(const side of ['ps','pc']){
  const initial={},candidates=[];
  for(const r of snapshot[side]){
    (initial[r[0]]??=[]).push({name:r[17],id:r[1],price:r[2]});
    if(r[14])candidates.push({klucz:r[17]+' '+r[0],rating:r[0],id:r[1],nazwa:r[17],cena:r[2],poziom:r[7],cel:r[15],kupnoDo:r[16]});
  }
  const batch=buildQuotes({platform:side,at:t,bands:{platform:side,observedAt:t,byRating:initial}});
  assert.equal(Object.keys(batch.quotes).length,77);
  assert.equal(batch.rejected.length,0);
  let state=advance(null,{platform:side,at:t,candidates,batch});
  assert.equal(Object.keys(state.otwarte).length,candidates.length);
  const perTime=new Map();
  for(const r of snapshot[side]){
    const key=`${r[0]}|${r[1]}|${r[17]}`;
    for(const [at,price] of h[side][key]?.punkty??[]){
      if(at<=t||at>t+12*3600)continue;
      let bands=perTime.get(at);if(!bands){bands={};perTime.set(at,bands);}
      (bands[r[0]]??=[]).push({id:r[1],name:r[17],price});
    }
  }
  let cycles=0,rejected=0,quotes=0;
  for(const [at,ratings] of h.migawki[side]){
    if(at<=t||at>t+12*3600)continue;
    const b=buildQuotes({platform:side,at,bands:{platform:side,observedAt:at,byRating:perTime.get(at)??{}}});
    assert.ok(Object.keys(perTime.get(at)??{}).every(r=>ratings.includes(Number(r))));
    rejected+=b.rejected.length;quotes+=Object.keys(b.quotes).length;cycles++;
    state=advance(state,{platform:side,at,candidates:[],batch:b});
  }
  result.platforms[side]={cycles,quotes,rejected,stats:stats(state),openRows:Object.values(state.otwarte).map(r=>({key:r.key,signalPrice:r.wejscie,target:r.cel0,maxIncludingSignal:r.max,lastObservedAt:r.ostatnio,missingCycles:r.missingCycles,confirmationCount:r.targetCount}))};
  assert.equal(state.wyniki.filter(r=>r.werdykt==='cel').length,0);
  // Separate current-snapshot migration smoke test. Future legacy data is NEVER fed to historical replay.
  const legacy=current.rejestr[side],before=JSON.stringify(legacy);
  let migrated=start(side,legacy);
  migrated=advance(migrated,{platform:side,at:current.at+1,candidates:[],batch:buildQuotes({platform:side,at:current.at+1})});
  assert.equal(JSON.stringify(legacy),before);assert.equal(JSON.stringify(migrated.legacy.original),before);
  assert.equal(stats(migrated).closed,0);assert.equal(stats(migrated).open,0);
  result.migration[side]={legacyOpen:Object.keys(legacy.otwarte).length,legacyClosed:legacy.wyniki.length,preservedSha256:sha(before),byteEquivalentJson:true,v2Closed:0,v2Open:0,oldOpenPolicy:'frozen in archive; not relabeled or advanced'};
}
const oldMomentum=current.obserwacja;
const legacyFresh=zrodloCen({},oldMomentum,current.at);
const rejectedLegacy=buildQuotes({platform:'ps',at:current.at,momentum:{platform:'ps',karty:oldMomentum.karty}});
assert.equal(Object.keys(rejectedLegacy.quotes).length,0);
result.momentumCoverage={sourceCommit:snapshotCommit,cardsInLegacyCache:Object.keys(oldMomentum.karty).length,
  legacyFreshProfileAliases:Object.keys(legacyFresh).filter(k=>k.startsWith('@id:')).length,
  quotesAcceptedByV2:0,reason:'no explicit rating/name identity and observation contract in legacy momentum; no guessing',
  consequence:'console observations outside bands lose this fallback until source identity is proven; PC was already band-only'};
assert.equal(readFileSync(new URL('historia-kart.json',root),'utf8'),historyRaw.toString());
assert.equal(readFileSync(new URL('../stage15b/input/shadow-stage8.json',import.meta.url),'utf8'),raw.toString());
writeFileSync(new URL('./replay-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
