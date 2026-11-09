import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {adaptFrame,fingerprint} from '../stage15h/adapter.mjs';
import {encodeState,sha256} from './state.mjs';
const root=path.resolve(process.argv[2]),read=name=>JSON.parse(readFileSync(path.join(root,name)));
const a=read('cycle1/frame.json'),b=read('cycle2/frame.json'),sa=read('cycle1/shadow.json'),sb=read('cycle2/shadow.json');
const ca=read('cycle1/capture.json'),cb=read('cycle2/capture.json'),one=read('cycle1/state-commit.json'),two=read('cycle2/state-commit.json');
const firstInput=read('cycle1/input-manifest.json'),nextInput=read('cycle2/input-manifest.json');
assert.equal(firstInput.kind,'pinned-main');assert.equal(nextInput.kind,'previous-verified-output');
assert.deepEqual(nextInput.files,read('cycle1/output-manifest.json').files);
assert.equal(nextInput.files['data.json'].sha256,sha256(readFileSync(path.join(root,'cycle1/data.json'))));
assert.equal(one.previousDigest,null);assert.equal(one.committedDigest,sha256(encodeState(1,sa)));
assert.equal(two.previousDigest,one.committedDigest);assert.equal(cb.previousStateDigest,one.committedDigest);
assert.equal(nextInput.expectedPreviousStateDigest,one.committedDigest);
assert.equal(two.committedDigest,sha256(encodeState(2,sb)));
assert.equal(sha256(readFileSync(path.join(root,'state-final.json'))),two.committedDigest);
assert.deepEqual(read('state-final.json').adapter,sb);
assert.notEqual(ca.processId,cb.processId);assert.equal(ca.cycle,1);assert.equal(cb.cycle,2);
assert.deepEqual(adaptFrame(null,a),sa);assert.deepEqual(adaptFrame(sa,b),sb);
const retry=read('retry.json');assert.equal(retry.fullStateUnchanged,true);assert.equal(retry.newBrowserOrRead,false);
assert.equal(retry.stateFileDigest,one.committedDigest);assert.equal(retry.stateFingerprint,fingerprint(sa));
assert.deepEqual(adaptFrame(sa,a),sa);
const intervals={};const preserved={};
for(const side of ['ps','pc']){
 assert.equal(a.reads[side].sequence,1);assert.equal(b.reads[side].sequence,2);
 intervals[side]=cb.receipts[side].observedAtMs-ca.receipts[side].observedAtMs;assert.ok(intervals[side]>=60000);
 assert.equal(sa.states[side].legacy,null);assert.equal(sb.states[side].legacy,null);
 let n=0;
 for(const [key,r] of Object.entries(sa.states[side].otwarte)){
  const later=sb.states[side].otwarte[key]??sb.states[side].wyniki.find(x=>x.key===key&&x.od===r.od);
  assert.ok(later,'existing v2 row vanished');
  for(const f of ['def','id','rating','name','od','wejscie','sufit','poziom0','inReachAtSignal','purchaseConfirmed']){
    const value=f==='poziom0'&&later.poziom0===undefined?later.poziom:later[f];assert.equal(value,r[f],key+' frozen '+f);
  }
  assert.equal(later.cel0??later.cel,r.cel0);n++;
 }
 preserved[side]=n;
}
for(const n of [1,2]){
 const result=read('cycle'+n+'/result.json');assert.equal(result.status,'PASS');assert.equal(result.isolatedPublicationParity,true);
 for(const [name,meta] of Object.entries(result.files)){const raw=readFileSync(path.join(root,'cycle'+n,name));assert.equal(raw.length,meta.bytes);assert.equal(sha256(raw),meta.sha256);}
}
const files={};let total=0;
function walk(dir,prefix=''){
 for(const name of readdirSync(dir)){
  const p=path.join(dir,name),relative=prefix+name;
  if(statSync(p).isDirectory()){walk(p,relative+'/');continue;}
  if(relative==='series-result.json')continue;
  const raw=readFileSync(p);assert.ok(raw.length<=1048576,relative+' cap');total+=raw.length;files[relative]={bytes:raw.length,sha256:sha256(raw)};
 }
}
walk(root);assert.ok(total<=4194304);
const result={status:'PASS',sourceCommit:firstInput.sourceCommit,codeCommit:firstInput.codeCommit,normalFastCycles:2,
 twoDistinctFastProcesses:true,processIds:[ca.processId,cb.processId],persistedStateReloaded:true,oldOutputInputChainMatches:true,
 exactFrameReplayUnchanged:true,noNetworkForReplay:true,sourceIntervalMs:intervals,frozenRowsPreserved:preserved,
 decisions:{cycle1:sa.diagnostics,cycle2:sb.diagnostics},statisticsAfterTwo:sb.statistics,
 oldPublicationParity:true,legacyImported:false,totalBytesBeforeSummary:total,files,
 limitations:['process restart, not runner loss or distributed CAS','two frames do not guarantee two eligible target touches','no investment efficacy measured']};
const body=JSON.stringify(result,null,2)+'\n';assert.ok(total+Buffer.byteLength(body)<=4194304);
writeFileSync(path.join(root,'series-result.json'),body);
console.log(JSON.stringify(result,null,2));
