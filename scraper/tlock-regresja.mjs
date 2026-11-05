// Test dodatkowy — uruchamiany RĘCZNIE, nie przy minutowym cron (trwa 10s).
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, utimesSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patch } from './lib/store.mjs';
const dir = mkdtempSync(join(tmpdir(),'appea-lock-'));
const file=join(dir,'data.json');
try{
  writeFileSync(file, '{"at":100}\n');
  writeFileSync(file+'.lock','');
  const start=Date.now();
  assert.throws(()=>patch(file,{at:200}),/locka/);
  assert.ok(Date.now()-start>=9000);
  assert.equal(existsSync(file+'.lock'),true);
  assert.equal(JSON.parse(readFileSync(file,'utf8')).at,100);
  const d=new Date(Date.now()-180_000);
  utimesSync(file+'.lock',d,d);
  patch(file,{at:300});
  assert.equal(JSON.parse(readFileSync(file,'utf8')).at,300);
  assert.equal(existsSync(file+'.lock'),false);
  console.log('ok: aktualnego locka nie usuwamy, stary usuwamy bez uszkodzenia pliku');
}finally{rmSync(dir,{recursive:true,force:true})}
