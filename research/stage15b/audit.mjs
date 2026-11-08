import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {policzOkazje,policzInwestycje} from '../../scraper/lib/okazje.mjs';
import {onGrid,listBelow,snapDown} from '../../scraper/lib/grid.mjs';
const path=new URL('./input/shadow-stage8.json',import.meta.url);
const raw=readFileSync(path); assert.ok(raw.length<=65536);
const original=raw.toString(), s=JSON.parse(original), m=s.migawka, at=m.czasOdczytuStart;
assert.equal(m.schemat,1); assert.equal(m.definicje.commit,'d27061cdb6d662fad2ff153ac63f19739532dfd1');
const result={sourceSha256:createHash('sha256').update(raw).digest('hex'),at,platforms:{},limitations:['One historical snapshot; no outcome or execution evidence','Persistence last-update time is absent; replay uses decision time for that unused field','Publication data.json absent from artifact; no independent publication parity check']};
for(const side of ['ps','pc']){
 const bands={},f={},d={},tr={},seen=new Set();
 for(const r of m[side]){
  assert.equal(r.length,18);assert.ok(r[0]>=83&&r[0]<=89);assert.ok(onGrid(r[2]));
  const key=r[17]+' '+r[0],id=r[1]; assert.ok(!seen.has(key));seen.add(key);
  (bands[r[0]]??=[]).push({name:r[17],id,price:r[2]});
  for(const [dest,i] of [[f,3],[d,7]]) if(r[i]!==null){
   assert.ok(r[i]>0&&Number.isInteger(r[i+1])&&r[i+1]>0);
   assert.ok(r[i+2]>=0&&r[i+3]>=r[i+2]);
   dest[key]={v:3,p:r[i],n:r[i+1],t:at-r[i+2],od:at-r[i+3],id};
  }
  if(r[11]!==null)tr[key]={id,n:r[11],od:at-r[12],t:at};
  for(const i of [13,14])assert.ok(r[i]===0||r[i]===1);
 }
 const fast=policzOkazje(bands,f).karty, inv=policzInwestycje(bands,d,tr,at);
 assert.deepEqual(fast.map(x=>x.klucz).sort(),m[side].filter(r=>r[13]).map(r=>r[17]+' '+r[0]).sort());
 assert.deepEqual(inv.map(x=>x.klucz).sort(),m[side].filter(r=>r[14]).map(r=>r[17]+' '+r[0]).sort());
 for(const x of inv){const r=m[side].find(r=>r[17]+' '+r[0]===x.klucz);
  assert.equal(x.cel,r[15]);assert.equal(x.kupnoDo,r[16]);
  assert.equal(r[15],listBelow(r[7]));assert.equal(r[16],snapDown(Math.floor(r[15]*0.95/1.05)));
  assert.ok(r[15]>r[2]&&onGrid(r[15])&&onGrid(r[16]));
 }
 result.platforms[side]={rows:m[side].length,fast:fast.length,investments:inv.length,inReach:inv.filter(x=>x.wzasiegu).length,details:inv.map(x=>({key:x.klucz,price:x.cena,target:x.cel,buyLimit:x.kupnoDo,inReach:x.wzasiegu,conditionalNetAtObservedPrice:x.cel*0.95-x.cena}))};
}
assert.equal(readFileSync(path,'utf8'),original);
writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
