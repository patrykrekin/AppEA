// Independent cross-language verification of the six strict-horizon target checks.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url);
const h=JSON.parse(readFileSync(new URL('historia-kart.json',root)));
const s=JSON.parse(readFileSync(new URL('research/stage15b/input/shadow-stage8.json',root))).migawka;
const out=JSON.parse(readFileSync(new URL('./result.json',import.meta.url)));
const end=s.czasOdczytuStart+43200;
let checked=0,inReach=0;
for(const side of ['ps','pc'])for(const r of s[side].filter(r=>r[14]===1)){
  const key=`${r[0]}|${r[1]}|${r[17]}`;
  const points=h[side][key].punkty.filter(p=>p[0]>s.czasOdczytuStart&&p[0]<=end);
  const result=out.platforms[side].investments.find(x=>x.key===key);
  const hits=points.filter(p=>p[1]>=r[15]);
  assert.equal(result.pathPrices,points.length);
  assert.equal(result.observedMaxPrice,Math.max(...points.map(p=>p[1])));
  assert.equal(result.targetObservations,hits.length);
  assert.equal(result.firstObservedTargetAt,hits[0]?.[0]??null);
  const endpoint=h[side][key].punkty.filter(p=>Math.abs(p[0]-end)<=900)
    .sort((a,b)=>Math.abs(a[0]-end)-Math.abs(b[0]-end)||a[0]-b[0])[0];
  assert.equal(result.endpointAt,endpoint[0]);
  assert.equal(result.endpointPrice,endpoint[1]);
  assert.equal(result.target,r[15]);
  assert.equal(result.inReach,r[2]<=r[16]);
  checked++;if(result.inReach)inReach++;
}
assert.equal(checked,6);assert.equal(inReach,5);
console.log('PASS: independent JS verification of 6 targets, maxima, path counts and endpoints; 5 originally inReach');
