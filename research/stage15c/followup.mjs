import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {onGrid} from '../../scraper/lib/grid.mjs';
const root=new URL('../../',import.meta.url);
const protocol=JSON.parse(readFileSync(new URL('./protocol.json',import.meta.url)));
const bytes=readFileSync(new URL('historia-kart.json',root));
const gitBlob=createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex');
assert.equal(gitBlob,'dab4f4fe62c0ef99bf81aa4cbf36eb3700153cf1','history must match frozen commit');
const h=JSON.parse(bytes),s=JSON.parse(readFileSync(new URL('../stage15b/input/shadow-stage8.json',import.meta.url))).migawka;
const t=s.czasOdczytuStart,H=protocol.horizonSeconds,T=protocol.toleranceSeconds;
export function closest(points,target,tolerance){return points.filter(p=>Math.abs(p[0]-target)<=tolerance).sort((a,b)=>Math.abs(a[0]-target)-Math.abs(b[0]-target)||a[0]-b[0])[0]??null;}
assert.deepEqual(closest([[110,1],[90,2]],100,10),[90,2]);
assert.equal(closest([[89,1]],100,10),null);
assert.deepEqual(closest([[110,1]],100,10),[110,1]);
const out={protocol,origin:t,historyAt:h.at,historyGitBlob:gitBlob,platforms:{}};
const median=xs=>{if(!xs.length)return null;const a=[...xs].sort((a,b)=>a-b),k=a.length>>1;return a.length%2?a[k]:(a[k-1]+a[k])/2;};
for(const side of ['ps','pc']){
 const rows=s[side].map(r=>{
  assert.ok(!/[\r\n,]/.test(r[17]),'CSV name requires escaping');
  const key=`${r[0]}|${r[1]}|${r[17]}`,entry=h[side][key];
  const pts=entry?.punkty??[];
  if(entry){assert.equal(entry.id,r[1]);assert.equal(entry.rating,r[0]);assert.equal(entry.nazwa,r[17]);}
  let prev=0;for(const p of pts){assert.ok(Number.isInteger(p[0])&&p[0]>prev&&p[0]<=h.at&&onGrid(p[1]));prev=p[0];}
  const p=closest(pts,t+H,T),ratingSamples=(h.migawki?.[side]??[]).filter(x=>Math.abs(x[0]-(t+H))<=T&&x[1].includes(r[0]));
  if(p)assert.ok(ratingSamples.some(x=>x[0]===p[0]),'endpoint requires matching valid rating snapshot');
  return {key,name:r[17],rating:r[0],fast:!!r[13],investment:!!r[14],inReach:r[14]===1?r[2]<=r[16]:null,originPrice:r[2],target:r[15],buyLimit:r[16],status:h.at<t+H+T?'pending':p?'observed':ratingSamples.length?'absent-in-sampled-slice':'unobserved',ratingSamples:ratingSamples.length,endpoint:p,offsetSeconds:p?p[0]-(t+H):null,priceChangePct:p?100*(p[1]/r[2]-1):null,conditionalNetReturnPct:p?100*((p[1]*0.95-r[2])/r[2]):null,endpointAtTarget:p&&r[14]===1?p[1]>=r[15]:null};
 });
 const summary={};
 for(const [name,filter] of Object.entries({all:r=>true,investment:r=>r.investment,investmentInReach:r=>r.investment&&r.inReach,other:r=>!r.investment,fast:r=>r.fast})){
  const a=rows.filter(filter),b=a.filter(r=>r.status==='observed');
  summary[name]={total:a.length,observed:b.length,absent:a.filter(r=>r.status==='absent-in-sampled-slice').length,unobserved:a.filter(r=>r.status==='unobserved').length,pending:a.filter(r=>r.status==='pending').length,medianPriceChangePct:median(b.map(r=>r.priceChangePct)),medianConditionalNetReturnPct:median(b.map(r=>r.conditionalNetReturnPct)),positiveConditionalNet:b.filter(r=>r.conditionalNetReturnPct>0).length,endpointAtTarget:b.filter(r=>r.endpointAtTarget===true).length};
 }
 out.platforms[side]={summary,investments:rows.filter(r=>r.investment),rows};
}
assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),readFileSync(new URL('historia-kart.json',root))])).digest('hex'),gitBlob);
const lines=['platform,key,fast,investment,inReach,originPrice,target,buyLimit,status,ratingSamples,endpointAt,endpointPrice,offsetSeconds,priceChangePct,conditionalNetReturnPct,endpointAtTarget'];
for(const [side,x] of Object.entries(out.platforms)){for(const r of x.rows)lines.push([side,r.key,r.fast,r.investment,r.inReach,r.originPrice,r.target,r.buyLimit,r.status,r.ratingSamples,r.endpoint?.[0],r.endpoint?.[1],r.offsetSeconds,r.priceChangePct,r.conditionalNetReturnPct,r.endpointAtTarget].map(v=>v==null?'':String(v)).join(','));delete x.rows;}
writeFileSync(new URL('./rows.csv',import.meta.url),lines.join('\n')+'\n');
writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
for(const [side,x] of Object.entries(out.platforms))console.log(side,JSON.stringify({summary:x.summary,investments:x.investments},null,2));
