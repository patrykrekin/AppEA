/* LIVE R2 Stage 15A.2 — strictly SYNTHETIC namespace; no DeleteObject and no FUT.GG calls. */
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import {S3Client,GetObjectCommand,PutObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
import {generate,initHead,validateHead,pin,unpin,freeze,release,planGC,replay,object,runPrefix,j} from './core.mjs';
if(process.env.APPEA_15A2_LIVE_CONSENT!=='yes')throw Error('LIVE_CONSENT_REQUIRED');
const phase=process.argv[2];
if(!['seed','pin','stale','maintenance','inspect','release'].includes(phase))throw Error('BAD_PHASE');
const runId=process.env.R2_PILOT_ID,prefix=runPrefix(runId),headKey=prefix+'hot/head.json';
for(const k of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'])if(!process.env[k])throw Error('MISSING_'+k);
const account=process.env.R2_ACCOUNT_ID,endpoint=process.env.R2_ENDPOINT||('https://'+account+'.r2.cloudflarestorage.com');
if(!/^[a-f0-9]{32}$/.test(account)||!/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us))?\.r2\.cloudflarestorage\.com$/.test(endpoint))throw Error('BAD_R2_ENDPOINT');
const client=new S3Client({region:'auto',endpoint,forcePathStyle:true,maxAttempts:1,
 requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
 credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const bucket=process.env.R2_BUCKET;
let gets=0,puts=0,lists=0;const wait=ms=>new Promise(r=>setTimeout(r,ms));
function keyGuard(key){if(typeof key!=='string'||!key.startsWith(prefix)||!key.endsWith('.json')||key.length>1024)throw Error('CROSS_PREFIX');}
async function get(key){
 keyGuard(key);if(++gets>40)throw Error('GET_LIMIT');
 try{const r=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  if(!r.ETag||!r.Body)throw Error('MISSING_ETAG');
  return{etag:r.ETag,body:await r.Body.transformToString('utf8')};
 }catch(e){if(e?.$metadata?.httpStatusCode===404||e?.name==='NoSuchKey')return null;throw e;}
}
async function put(key,body,cond){
 keyGuard(key);
 if(++puts>12||Buffer.byteLength(body)>65536||!!cond.IfMatch===!!cond.IfNoneMatch)throw Error('UNSAFE_PUT');
 return client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:'application/json',...cond}));
}
async function readHead(){
 const r=await get(headKey);if(!r)return null;
 const h=JSON.parse(r.body);validateHead(runId,h);return{...r,value:h};
}
function out(key,value){if(!process.env.GITHUB_OUTPUT)throw Error('MISSING_GITHUB_OUTPUT');appendFileSync(process.env.GITHUB_OUTPUT,key+'='+value+'\n');}
function report(tag,more){console.log('STAGE15A2_'+tag+' '+JSON.stringify({realR2:true,synthetic:true,phase,runId,gets,puts,lists,...more}));}
async function inventory(){
 if(++lists>2)throw Error('LIST_LIMIT');
 const r=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix,MaxKeys:100}));
 if(r.IsTruncated)throw Error('UNEXPECTED_PAGINATION');
 return r.Contents||[];
}
try{
 if(phase==='seed'){
  assert.equal(await readHead(),null,'RUN_ALREADY_EXISTS');
  const archive=generate(runId,32);
  assert.equal(archive.metadata.objects,7);
  for(const [key,body]of archive.storage)await put(key,body,{IfNoneMatch:'*'});
  const h=initHead(runId,archive.root);
  await put(headKey,j(h),{IfNoneMatch:'*'});
  const saved=await readHead();assert.equal(saved?.value?.revision,0);
  out('base_etag',saved.etag);
  report('SEED',{pages:2,groups:1,immutableObjects:7,rootSha:archive.root.sha});
 }
 if(phase==='pin'){
  const start=await readHead();assert.equal(start?.value?.mode,'active');assert.equal(start.value.readers.length,0);
  const proposal=pin(runId,start.value,'reader-15a2',Date.now(),900000);
  await wait(1350);await put(headKey,j(proposal),{IfMatch:start.etag});
  const saved=await readHead();assert.equal(saved?.value?.readers.length,1);
  report('PIN',{readerCount:1,revision:saved.value.revision});
 }
 if(phase==='stale'){
  const current=await readHead();assert.equal(current.value.readers.length,1);
  const staleEt=process.env.STAGE15A2_BASE_ETAG;
  if(!/^"[^"]+"$/.test(staleEt??''))throw Error('MISSING_OLD_ETAG');
  const staleHead=initHead(runId,current.value.root);
  const proposal=freeze(runId,staleHead);
  await wait(1350);
  let code='unexpected';
  try{await put(headKey,j(proposal),{IfMatch:staleEt});}
  catch(e){code=e?.$metadata?.httpStatusCode===412?'412':String(e?.$metadata?.httpStatusCode??e?.name);}
  assert.equal(code,'412');
  const still=await readHead();assert.equal(still.value.readers.length,1);
  const frozen=freeze(runId,still.value),etag=JSON.stringify(frozen);
  assert.throws(()=>planGC(runId,frozen,()=>null,[],Date.now(),etag,etag),/GC_FENCING_FAIL_CLOSED/);
  report('STALE',{oldEtagStatus:412,readerPinPreserved:true,gcBlockedByReader:true});
 }
 if(phase==='maintenance'){
  const current=await readHead();assert.equal(current.value.readers.length,1);
  const noPin=unpin(runId,current.value,'reader-15a2');
  await wait(1350);await put(headKey,j(noPin),{IfMatch:current.etag});
  const unpinned=await readHead();assert.equal(unpinned.value.readers.length,0);
  const proposed=freeze(runId,unpinned.value);
  await wait(1350);await put(headKey,j(proposed),{IfMatch:unpinned.etag});
  const locked=await readHead();assert.equal(locked.value.mode,'maintenance');
  assert.equal(locked.value.readers.length,0);assert.equal(locked.value.epoch,1);
  report('MAINTENANCE',{mode:locked.value.mode,epoch:locked.value.epoch,readers:0});
 }
 if(phase==='inspect'){
  const h=await readHead();assert.equal(h.value.mode,'maintenance');
  const listing=await inventory();assert.equal(listing.length,8);
  const contents=new Map();
  for(const item of listing){const r=await get(item.Key);assert.ok(r);contents.set(item.Key,r.body);}
  const read=key=>contents.get(key)??null;
  const result=replay(runId,h.value.root,read);
  assert.equal(result.records.length,32);
  assert.equal(result.reachable.size,7);
  const gc=planGC(runId,h.value,read,listing,Date.now(),h.etag,h.etag);
  assert.equal(gc.reachable,7);assert.equal(gc.grace,0);
  assert.equal(gc.eligible,0);assert.equal(gc.deleteOperations,0);
  report('INSPECT',{rootRecords:32,referenced:gc.reachable,deleteOperations:gc.deleteOperations});
 }
 if(phase==='release'){
  const h=await readHead();assert.equal(h.value.mode,'maintenance');
  const newH=release(runId,h.value);
  await wait(1350);await put(headKey,j(newH),{IfMatch:h.etag});
  const r=await readHead();assert.equal(r.value.mode,'active');assert.equal(r.value.epoch,2);
  assert.equal(r.value.readers.length,0);
  report('RELEASE',{mode:'active',epoch:2,readers:0});
 }
}finally{client.destroy()}
