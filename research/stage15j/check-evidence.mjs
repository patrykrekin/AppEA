import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adaptFrame,fingerprint} from '../stage15h/adapter.mjs';
import {filtrujPoziomy,filtrujTrwalosc,aktualizujTrwalosc,MAX_PRZERWA_EMA_SZYBKA,MAX_PRZERWA_EMA_DOBOWA} from '../../scraper/lib/okazje.mjs';
import {validate} from '../../scraper/validate.mjs';
const root=new URL('../../',import.meta.url),dir=path.resolve(process.argv[2]);
const read=n=>JSON.parse(readFileSync(path.join(dir,n),'utf8'));
const series=read('series-result.json');
for(const [name,meta] of Object.entries(series.files)){const raw=readFileSync(path.join(dir,name));assert.equal(raw.length,meta.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),meta.sha256);}
let previous=null;
for(const cycle of [1,2]){
const cycleDir=path.join(dir,'cycle'+cycle),read=n=>JSON.parse(readFileSync(path.join(cycleDir,n),'utf8'));
const result=read('result.json'),frame=read('frame.json'),shadow=read('shadow.json'),capture=read('capture.json'),manifest=read('input-manifest.json'),d=read('data.json');
assert.equal(manifest.sourceCommit,result.sourceCommit);assert.equal(manifest.codeCommit,result.codeCommit);
for(const [name,meta] of Object.entries(result.files)){
 const raw=readFileSync(path.join(cycleDir,name));assert.equal(raw.length,meta.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),meta.sha256);
}
const inputs={};
for(const [name,meta] of Object.entries(manifest.files)){
 if(cycle===2){assert.deepEqual(meta,JSON.parse(readFileSync(path.join(dir,'cycle1/output-manifest.json'))).files[name]);if(name==='data.json'){const raw=readFileSync(path.join(dir,'cycle1/data.json'));assert.equal(createHash('sha256').update(raw).digest('hex'),meta.sha256);inputs[name]=JSON.parse(raw);}continue;}
 const raw=execFileSync('git',['show',manifest.sourceCommit+':'+name],{cwd:root,maxBuffer:4*1024*1024});
 assert.equal(raw.length,meta.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),meta.sha256);
 inputs[name]=JSON.parse(raw);
}
for(const side of ['ps','pc']){
 const prev=inputs['data.json'].okazje;
 assert.deepEqual(frame.preFast[side],filtrujPoziomy(prev.poziomy?.[side],frame.cycleAt,MAX_PRZERWA_EMA_SZYBKA));
 assert.deepEqual(frame.preSlow[side],filtrujPoziomy(prev.poziomyD?.[side],frame.cycleAt,MAX_PRZERWA_EMA_DOBOWA));
 assert.deepEqual(frame.persistenceAfter[side],aktualizujTrwalosc(filtrujTrwalosc(prev.trwalosc?.[side],frame.cycleAt),frame.reads[side].bands,frame.preSlow[side],frame.cycleAt));
 assert.equal(fingerprint(frame.reads[side].bands),capture.receipts[side].selectedBandsDigest);
 assert.equal(frame.reads[side].observedAt,Math.floor(capture.receipts[side].observedAtMs/1000));
 assert.equal(capture.receipts[side].cookie,side==='ps'?'ps5':'pc');
}
assert.equal(frame.mode,'captured');assert.ok(BigInt(capture.receipts.pc.monotonicNs)>=BigInt(capture.receipts.ps.monotonicNs));
assert.ok(BigInt(capture.completedMonotonicNs)>=BigInt(capture.receipts.pc.monotonicNs));
assert.deepEqual(adaptFrame(previous,frame),shadow);
assert.deepEqual(d.inwestycje,frame.decisions);assert.deepEqual(d.okazje.poziomyD,frame.levelsAfter);
assert.equal(d.awaria,null);assert.equal(validate(d).err.length,0);
previous=shadow;
}
const before=readFileSync(path.join(dir,'series-result.json'),'utf8');
execFileSync(process.execPath,[new URL('./verify-series.mjs',import.meta.url).pathname,dir]);
assert.equal(readFileSync(path.join(dir,'series-result.json'),'utf8'),before);
const proof={pass:true,sourceCommit:series.sourceCommit,codeCommit:series.codeCommit,
 allEvidenceFileHashesMatch:true,allPinnedInputFileHashesMatch:true,
 originalPreFastAndSlowModelsMatch:true,originalPersistenceAfterMatches:true,
 actualSelectedBandHashesMatch:true,cookieAndMonotonicOrderMatch:true,
 adapterOutputRecomputedExactly:true,isolatedOldPublicationMatches:true,
 frameMode:'captured',liveFrames:2,persistedSeriesRecomputedExactly:true,efficacyAssessed:false};
writeFileSync(new URL('./independent-result.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof,null,2));
