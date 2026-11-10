import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {onGrid} from '../../scraper/lib/grid.mjs';
const here=new URL('.',import.meta.url),root=new URL('../../',import.meta.url);
const p=JSON.parse(readFileSync(new URL('protocol.json',here)));
const raw=execFileSync('git',['show',p.sourceCommit+':'+p.sourceFile],{cwd:root,maxBuffer:8*1024*1024});
const hash=x=>createHash('sha256').update(x).digest('hex');assert.equal(hash(raw),p.sourceSha256);
const a=JSON.parse(raw);assert.equal(a.wersja,2);
const timestamps=['ps','pc'].flatMap(s=>Object.values(a[s]).flatMap(v=>v.punkty.map(x=>x[0])));
const first=Math.min(...timestamps),last=Math.max(...timestamps),cutoff=Math.floor(first+(last-first)*2/3);
const inc=(o,k)=>o[k]=(o[k]||0)+1;
export function windowReason(points,t,protocol=p){
 const xs=points.filter(x=>x[0]<=t&&x[0]>=t-protocol.windowSeconds);
 if(xs.length<protocol.minimumPoints)return 'too-few-points';
 if(xs.at(-1)[0]-xs[0][0]<protocol.minimumSpanSeconds)return 'too-short-span';
 if(t-xs.at(-1)[0]>protocol.maximumGapSeconds)return 'stale';
 for(let i=1;i<xs.length;i++)if(xs[i][0]-xs[i-1][0]>protocol.maximumGapSeconds)return 'historical-gap';
 return null;
}
const synthetic=Array.from({length:49},(_,i)=>[100000+i*600,1000]);
assert.equal(windowReason(synthetic,128800),null);
assert.equal(windowReason([...synthetic,[999999,2000]],128800),windowReason(synthetic,128800));
assert.equal(windowReason(synthetic.slice(1),128800),'too-short-span');
const broken=synthetic.filter((_,i)=>i!==20&&i!==21);assert.equal(windowReason(broken,128800),'historical-gap');
assert.equal(windowReason(synthetic.slice(0,35),128800),'too-few-points');
const sides={},ratingCounts={};let origins=0;const records=[];
for(const side of ['ps','pc']){
 const snapshots=a.migawki?.[side]||[],byTime=new Map(snapshots.map(([t,ratings])=>[t,new Set(ratings)]));
 assert.equal(byTime.size,snapshots.length);
 const out={series:Object.keys(a[side]).length,points:0,snapshots:snapshots.length,firstSnapshot:snapshots[0]?.[0],lastSnapshot:snapshots.at(-1)?.[0],maxSnapshotGapSeconds:0,origins:0,reasons:{},split:{train:{origins:0,historyReady:0,endpointAvailable:0,continuousFollowup:0},embargo:{origins:0,historyReady:0,endpointAvailable:0,continuousFollowup:0},test:{origins:0,historyReady:0,endpointAvailable:0,continuousFollowup:0}}};
 for(let i=1;i<snapshots.length;i++){assert.ok(snapshots[i][0]>snapshots[i-1][0]);out.maxSnapshotGapSeconds=Math.max(out.maxSnapshotGapSeconds,snapshots[i][0]-snapshots[i-1][0]);}
 for(const [key,v] of Object.entries(a[side])){
  assert.equal(key,v.rating+'|'+v.id+'|'+v.nazwa);const pts=v.punkty;out.points+=pts.length;
  const times=new Set();
  for(let i=0;i<pts.length;i++){assert.ok(Number.isInteger(pts[i][0])&&onGrid(pts[i][1]));assert.ok(i===0||pts[i][0]>pts[i-1][0]);assert.ok(pts[i][0]<=a.at);times.add(pts[i][0]);}
  for(const [t,price] of pts){
   origins++;out.origins++;const split=t>=cutoff?'test':t+p.futureHorizonSeconds+p.endpointToleranceSeconds<cutoff?'train':'embargo';const stats=out.split[split];stats.origins++;
   let reason=!byTime.get(t)?.has(v.rating)?'origin-no-snapshot':windowReason(pts,t);
   const past=pts.filter(x=>x[0]<=t&&x[0]>=t-p.windowSeconds);
   if(!reason&&past.some(x=>!byTime.get(x[0])?.has(v.rating)))reason='history-no-snapshot';
   if(!reason&&snapshots.some(([st,ratings])=>st>=past[0][0]&&st<=t&&ratings.includes(v.rating)&&!times.has(st)))reason='historical-explicit-absence';
   let endpoint=null,continuous=false,missing=null;
   if(!reason){
    stats.historyReady++;
    for(const q of pts){if(q[0]<=t||Math.abs(q[0]-t-p.futureHorizonSeconds)>p.endpointToleranceSeconds)continue;
     if(!endpoint||Math.abs(q[0]-t-p.futureHorizonSeconds)<Math.abs(endpoint[0]-t-p.futureHorizonSeconds))endpoint=q;
    }
    if(endpoint){
     stats.endpointAvailable++;if(split==='train')assert.ok(endpoint[0]<cutoff,'train label crosses cutoff');
     const future=pts.filter(q=>q[0]>=t&&q[0]<=endpoint[0]);
     const absent=snapshots.some(([st,ratings])=>st>t&&st<=endpoint[0]&&ratings.includes(v.rating)&&!times.has(st));
     const gap=future.some((q,i)=>i>0&&q[0]-future[i-1][0]>p.maximumGapSeconds);
     continuous=!absent&&!gap;missing=absent?'explicit-absence':gap?'followup-gap':null;
     if(continuous)stats.continuousFollowup++;
    }else missing=t+p.futureHorizonSeconds+p.endpointToleranceSeconds>last?'archive-tail':'endpoint-missing';
   }
   inc(out.reasons,reason||'history-ready');
   const rk=side+'/'+v.rating;if(!ratingCounts[rk])ratingCounts[rk]={origins:0,historyReady:0,endpointAvailable:0,continuousFollowup:0};const rc=ratingCounts[rk];rc.origins++;if(!reason){rc.historyReady++;if(endpoint)rc.endpointAvailable++;if(continuous)rc.continuousFollowup++;}
   records.push([side,key,t,split,reason,endpoint?.[0]??null,continuous,missing]);
  }
 }
 sides[side]=out;
}
const productionBasket={};
for(const side of ['ps','pc']){
 const selected=records.filter(r=>r[0]===side&&Number(r[1].split('|')[0])>=83&&Number(r[1].split('|')[0])<=89);
 productionBasket[side]={};
 for(const split of ['train','embargo','test']){
  const xs=selected.filter(r=>r[3]===split),ready=xs.filter(r=>!r[4]);
  productionBasket[side][split]={origins:xs.length,historyReady:ready.length,endpointAvailable:ready.filter(r=>r[5]!==null).length,continuousFollowup:ready.filter(r=>r[6]).length,uniqueSeriesWithContinuousFollowup:new Set(ready.filter(r=>r[6]).map(r=>r[1])).size,followupMissingReasons:{}};
  for(const r of ready)if(r[7])inc(productionBasket[side][split].followupMissingReasons,r[7]);
 }
}
assert.equal(records.length,origins);
for(const side of ['ps','pc'])assert.equal(Object.values(sides[side].split).reduce((n,x)=>n+x.origins,0),sides[side].origins);
const result={stage:'15M' ,status:'PASS',sourceCommit:p.sourceCommit,sourceSha256:hash(raw),sourceBytes:raw.length,archiveAt:a.at,firstObservation:first,lastObservation:last,spanSeconds:last-first,cutoff,embargoSeconds:8100,origins,sides,ratingCounts,productionBasket,windowSanityChecks:5,
 eligibilityDigestSha256:hash(JSON.stringify(records)),historyReadyExamples:records.filter(x=>!x[4]).slice(0,8),
 exactProductionReplayPossible:false,researchProxyAllowed:true,forecastScoresComputed:false,independentHoldout:false,
 limitations:['selected cheapest-by-rating offers, not all cards or trades','10 minute minimum sampling, irregular gaps and snapshot absences','past EMA summaries and exact fast stream absent','chronological partition of already examined data, not pristine validation','endpoint availability alone does not establish continuous followup or execution']};
writeFileSync(new URL('result.json',here),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
