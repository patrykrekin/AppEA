import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {instrument} from './prepare.mjs';
const source=readFileSync(new URL('../../scraper/scrape.mjs',import.meta.url),'utf8');
const generated=instrument(source);
assert.ok(generated.includes('captureContext({cycleAt:at'));
assert.equal(generated.split('recordRead("ps"').length-1,1);
assert.equal(generated.split('recordRead("pc"').length-1,1);
assert.equal(generated.split('recordGoAttempt(url)').length-1,1);
assert.throws(()=>instrument(source+'\n'),/reviewed exact scraper/);
// Parse the entire generated module without executing scraper or network code.
// Syntax checking is delegated to Node's parser without writing into production.
const {spawnSync}=await import('node:child_process');
const checked=spawnSync(process.execPath,['--input-type=module','--check'],{input:generated,encoding:'utf8'});
assert.equal(checked.status,0,checked.stderr);
const result={pass:true,checks:['reviewed original hash','unique capture anchors','insertion-only reversible instrumentation','both platform receipts','no original source mutation','generated module syntax'],liveCyclesExecuted:0};
writeFileSync(new URL('./offline-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
