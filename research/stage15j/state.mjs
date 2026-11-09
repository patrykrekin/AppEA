import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export const sha256=raw=>createHash('sha256').update(raw).digest('hex');
export const encodeState=(cycle,adapter)=>JSON.stringify({schema:1,cycle,adapter},null,2)+'\n';
export function readPrevious(file,cycle){
 assert.ok(cycle===1||cycle===2,'bounded cycle');
 if(cycle===1){assert.ok(!existsSync(file),'cycle1 must start with no v2 file');return {adapter:null,digest:null,cycle:0};}
 assert.ok(existsSync(file),'cycle2 requires committed state');
 const raw=readFileSync(file);assert.ok(raw.length<=1048576,'state read byte cap');const record=JSON.parse(raw);
 assert.equal(record.schema,1);assert.equal(record.cycle,1);assert.equal(record.adapter?.adapterVersion,1);
 assert.equal(record.adapter.mode,'captured');assert.ok(record.adapter.lastFrame);
 return {adapter:record.adapter,digest:sha256(raw),cycle:record.cycle};
}
export function commitState(file,cycle,adapter,expectedPrevious){
 const prior=readPrevious(file,cycle);assert.equal(prior.digest,expectedPrevious,'state changed since capture');
 assert.equal(adapter.adapterVersion,1);assert.ok(adapter.lastFrame);
 const body=encodeState(cycle,adapter),temp=file+'.pending-'+cycle;
 assert.ok(Buffer.byteLength(body)<=1048576,'state byte cap');
 writeFileSync(temp,body,{flag:'wx'});
 // One writer only; recheck before rename. This is not inter-process/distributed CAS.
 const current=existsSync(file)?sha256(readFileSync(file)):null;assert.equal(current,expectedPrevious);
 renameSync(temp,file);
 const saved=readFileSync(file);assert.equal(saved.toString(),body);
 return sha256(saved);
}
