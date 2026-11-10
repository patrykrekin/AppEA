import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {instrument} from './prepare.mjs';
import {commitState,readPrevious,sha256} from './state.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'appea-15j-test-')),results=[];
const test=(name,fn)=>{fn();results.push({name,result:'PASS'});};
const adapter={adapterVersion:1,mode:'captured',lastFrame:{cycleId:'synthetic-transport-fixture',digest:'a'.repeat(64)},states:{},receipts:{}};
try{
 test('first state is absent and commit reloads exactly',()=>{
  const f=path.join(dir,'a.json');assert.equal(readPrevious(f,1).adapter,null);const h=commitState(f,1,adapter,null);
  const read=readPrevious(f,2);assert.equal(read.digest,h);assert.deepEqual(read.adapter,adapter);
 });
 test('new process reloads committed JSON rather than sharing memory',()=>{
  const f=path.join(dir,'b.json');commitState(f,1,adapter,null);
  const r=spawnSync(process.execPath,['--input-type=module','-e',`import {readPrevious} from ${JSON.stringify(new URL('./state.mjs',import.meta.url).href)}; console.log(JSON.stringify(readPrevious(process.argv[1],2)));`,f],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).adapter,adapter);
 });
 test('wrong expected hash cannot overwrite first state',()=>{
  const f=path.join(dir,'c.json');commitState(f,1,adapter,null);const old=readFileSync(f);
  assert.throws(()=>commitState(f,2,adapter,'wrong'),/changed/);assert.deepEqual(readFileSync(f),old);
 });
 test('second cycle cannot start with no state',()=>assert.throws(()=>readPrevious(path.join(dir,'absent'),2),/requires/));
 test('first cycle cannot reuse an existing state file',()=>{
  const f=path.join(dir,'d.json');commitState(f,1,adapter,null);assert.throws(()=>readPrevious(f,1),/no v2/);
 });
 test('malformed/truncated JSON is rejected without rewriting it',()=>{
  const f=path.join(dir,'e.json');writeFileSync(f,'{"schema":');assert.throws(()=>readPrevious(f,2));assert.equal(readFileSync(f,'utf8'),'{"schema":');
 });
 test('wrong version and noncaptured state are rejected',()=>{
  const f=path.join(dir,'f.json');for(const record of [{schema:2,cycle:1,adapter},{schema:1,cycle:2,adapter},{schema:1,cycle:1,adapter:{...adapter,mode:'fixture'}}]){writeFileSync(f,JSON.stringify(record));assert.throws(()=>readPrevious(f,2));}
 });
 test('pending leftover does not replace last committed state',()=>{
  const f=path.join(dir,'g.json'),h=commitState(f,1,adapter,null);writeFileSync(f+'.pending-2','partial');
  assert.equal(readPrevious(f,2).digest,h);assert.throws(()=>commitState(f,2,adapter,h));assert.equal(sha256(readFileSync(f)),h);
 });
 test('oversized state is rejected before commit',()=>{
  const f=path.join(dir,'h.json');assert.throws(()=>commitState(f,1,{...adapter,padding:'x'.repeat(1048576)},null),/byte cap/);assert.equal(existsSync(f),false);
 });
 test('second verified commit creates a distinct explicit cycle record',()=>{
  const f=path.join(dir,'i.json'),h=commitState(f,1,adapter,null),next={...adapter,lastFrame:{cycleId:'synthetic-second',digest:'b'.repeat(64)}};
  const after=commitState(f,2,next,h);assert.notEqual(after,h);assert.equal(JSON.parse(readFileSync(f)).cycle,2);
 });
 test('insertion-only instrumentation remains source-guarded and syntactically valid',()=>{
  const original=readFileSync(new URL('../../scraper/scrape.mjs',import.meta.url),'utf8'),source=instrument(original);
  assert.ok(source.includes('../research/stage15j/capture.mjs'));assert.throws(()=>instrument(original+'\n'));
  const r=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 });
}finally{rmSync(dir,{recursive:true,force:true});}
writeFileSync(new URL('./offline-result.json',import.meta.url),JSON.stringify({passed:results.length,tests:results,syntheticTransportFixtures:true,liveCyclesExecuted:0},null,2)+'\n');
console.log(JSON.stringify({passed:results.length,tests:results}));
