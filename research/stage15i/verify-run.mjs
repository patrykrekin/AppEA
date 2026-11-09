import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validate} from '../../scraper/validate.mjs';
const dir=path.resolve(process.argv[2]);
const read=name=>JSON.parse(readFileSync(path.join(dir,name),'utf8'));
const f=read('frame.json'),shadow=read('shadow.json'),capture=read('capture.json'),d=read('data.json'),nav=read('navigation.json'),manifest=read('input-manifest.json');
assert.equal(f.mode,'captured');assert.equal(shadow.mode,'captured');assert.equal(capture.mode,'captured');assert.equal(capture.inputUnchanged,true);
assert.equal(d.awaria,null);assert.equal(d.atFast,f.cycleAt);assert.equal(d.at,f.cycleAt);
const validation=validate(d);assert.equal(validation.err.length,0,validation.err.join('\n'));
assert.deepEqual(d.inwestycje,f.decisions);assert.deepEqual(d.okazje.poziomyD,f.levelsAfter);
assert.equal(nav.individualCardNavigation,0);assert.ok(nav.goAttempts<=24);
for(const side of ['ps','pc']){
 assert.equal(capture.receipts[side].cookie,side==='ps'?'ps5':'pc');
 assert.equal(f.reads[side].observedAt,Math.floor(capture.receipts[side].observedAtMs/1000));
 assert.ok(capture.receipts[side].observedAtMs<=capture.completedAtMs);
 assert.equal(shadow.diagnostics[side].decisionParity,true);assert.equal(shadow.diagnostics[side].postModelParity,true);
}
const files={};let total=0;
for(const name of readdirSync(dir)){
 const p=path.join(dir,name);if(!statSync(p).isFile())continue;
 const raw=readFileSync(p);assert.ok(raw.length<=1048576,name+' byte cap');total+=raw.length;
 files[name]={bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};
}
assert.ok(files['frame.json'].bytes<=524288);assert.ok(total<=2097152);
const result={status:'PASS',sourceCommit:manifest.sourceCommit,codeCommit:manifest.codeCommit,
 actualClockEvidence:true,mode:'captured',normalFastCycles:1,inputUnchanged:true,isolatedPublicationParity:true,
 diagnostics:shadow.diagnostics,statistics:shadow.statistics,navigation:nav,validationWarnings:validation.warn,
 receipts:capture.receipts,completedAtMs:capture.completedAtMs,adapterDurationMs:capture.adapterDurationMs,
 files,totalBytesBeforeSummary:total,limits:{frameBytes:524288,totalBytes:2097152},
 limitations:['one frame, not two-read live confirmation or investment efficacy','one receipt per platform bundle, not individual offer timestamps','legacy not migrated; no production publication']};
const body=JSON.stringify(result,null,2)+'\n';assert.ok(total+Buffer.byteLength(body)<=2097152);
writeFileSync(path.join(dir,'result.json'),body);
console.log(JSON.stringify(result,null,2));
