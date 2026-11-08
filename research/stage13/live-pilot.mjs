/* AppEA STAGE 13 — gated LIVE R2 contract pilot. SYNTHETIC ONLY; no DeleteObject, no FUT.GG. */
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import {S3Client,GetObjectCommand,PutObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
import {encode,deltaSpec,prefixOf,inspectHead,nextHead,dryRunGc,assertDelta,ackStatus,MAX_HEAD,MAX_DELTA} from './core.mjs';

const phase=process.argv[2], role=process.argv[3];
if(process.env.APPEA_STAGE13_LIVE_CONSENT!=='yes')throw Error('EXPLICIT_LIVE_CONSENT_REQUIRED');
if(!['init','candidate','orphan','inspect','advance'].includes(phase))throw Error('INVALID_PHASE');
if(phase==='candidate'&&!['A','B'].includes(role))throw Error('INVALID_CANDIDATE');
const runId=process.env.R2_PILOT_ID,prefix=prefixOf(runId),headKey=prefix+'hot/head.json';
for(const key of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET']){
 if(!process.env[key])throw Error('MISSING_'+key);
}
const account=process.env.R2_ACCOUNT_ID;
if(!/^[a-f0-9]{32}$/.test(account))throw Error('BAD_ACCOUNT');
const endpoint=process.env.R2_ENDPOINT||('https://'+account+'.r2.cloudflarestorage.com');
if(!/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us))?\.r2\.cloudflarestorage\.com$/.test(endpoint))
 throw Error('BAD_ENDPOINT');
const bucket=process.env.R2_BUCKET;
const s3=new S3Client({region:'auto',endpoint,forcePathStyle:true,maxAttempts:1,
 requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
 credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
let puts=0,gets=0,lists=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checkKey=key=>{
 if(!key.startsWith(prefix)||key.length>1024)throw Error('CROSS_RUN_OR_UNSAFE_KEY');
 if(!key.endsWith('.json'))throw Error('NON_JSON_KEY');
};
async function get(key){
 checkKey(key);gets++;
 try{
  const r=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  if(!r.ETag||!r.Body)throw Error('MISSING_R2_ETAG_OR_BODY');
  const body=await r.Body.transformToString('utf8');
  return {body,etag:r.ETag};
 }catch(e){if(e?.$metadata?.httpStatusCode===404||e?.name==='NoSuchKey')return null;throw e;}
}
async function put(key,body,conditions){
 checkKey(key);
 if(!!conditions?.IfMatch===!!conditions?.IfNoneMatch)throw Error('CONDITIONAL_ONLY');
 if(conditions.IfNoneMatch&&conditions.IfNoneMatch!=='*')throw Error('INVALID_CREATE_CONDITION');
 if(Buffer.byteLength(body)>(key===headKey?MAX_HEAD:MAX_DELTA))throw Error('PAYLOAD_TOO_LARGE');
 if(++puts>3)throw Error('PER_JOB_PUT_BUDGET_EXCEEDED');
 return s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,
  ContentType:'application/json',...conditions}));
}
async function listDeltas(){
 const results=[];let token;
 do{
  if(++lists>3)throw Error('LIST_BUDGET_EXCEEDED');
  const r=await s3.send(new ListObjectsV2Command({Bucket:bucket,
    Prefix:prefix+'deltas/',MaxKeys:100,ContinuationToken:token}));
  for(const x of r.Contents||[])results.push(x);
  token=r.IsTruncated?r.NextContinuationToken:null;
  if(r.IsTruncated&&!token)throw Error('PAGINATION_BROKEN');
 }while(token);
 return results;
}
async function head(){
 const rec=await get(headKey);if(!rec)return null;
 let parsed;
 try{parsed=JSON.parse(rec.body)}catch{throw Error('CORRUPT_HEAD_JSON')}
 inspectHead(parsed,runId);
 return {...rec,value:parsed};
}
function output(key,val){
 if(!process.env.GITHUB_OUTPUT)throw Error('GITHUB_OUTPUT_MISSING');
 appendFileSync(process.env.GITHUB_OUTPUT,key+'='+val+'\n','utf8');
}
function makeDelta(writer){
 return deltaSpec(prefix,{schema:13,synthetic:true,runId,writer,
   observations:[{market:writer==='B'?'pc':'ps',rating:85,profile:'111',price:1200}],
   receipt:runId+'-'+writer});
}
async function verifyDelta(entry){
 const obj=await get(entry.key);
 if(!obj)throw Error('MISSING_REFERENCED_DELTA');
 const bodySha=entry.key.slice((prefix+'deltas/').length,-5);
 if(bodySha!==entry.sha)throw Error('BAD_POINTER_HASH');
 // Validates SHA256 of bytes using the exact canonical body format.
 const parsed=JSON.parse(obj.body);
 const spec=deltaSpec(prefix,parsed);
 if(spec.sha!==entry.sha||spec.body!==obj.body)throw Error('CORRUPT_DELTA_BYTES');
 assertDelta(spec,obj.body);
 return parsed;
}
function classifyError(e){
 const c=e?.$metadata?.httpStatusCode;
 if(c===412)return 'PRECONDITION_412';
 if(c===429)return 'THROTTLED_429';
 throw e;
}
async function main(){
 if(phase==='init'){
   assert.equal(await head(),null,'ALREADY_EXISTS_NEW_RUN_REQUIRED');
   const genesis={schema:13,runId,generation:0,chain:[],receipt:'init'};
   await put(headKey,encode(genesis),{IfNoneMatch:'*'});
   const read=await head();
   assert.equal(read?.value?.generation,0);
   output('base_etag',read.etag);
   console.log('STAGE13_INIT '+JSON.stringify({realR2:true,runId,generation:0,etagAvailable:true,synthetic:true}));
 }
 if(phase==='candidate'){
   const etag=process.env.STAGE13_BASE_ETAG;
   if(!/^"[^"]+"$/.test(etag||''))throw Error('MISSING_BASE_ETAG');
   const spec=makeDelta(role);
   await put(spec.key,spec.body,{IfNoneMatch:'*'});
   assert.equal((await get(spec.key))?.body,spec.body);
   const genesis={schema:13,runId,generation:0,chain:[],receipt:'init'};
   const proposal=nextHead(genesis,runId,spec,runId+'-'+role);
   let result='committed';
   try{await put(headKey,encode(proposal),{IfMatch:etag});}
   catch(e){result=classifyError(e)}
   const after=await head();
   if(result==='committed')assert.equal(after?.value?.receipt,runId+'-'+role);
   console.log('STAGE13_CANDIDATE '+JSON.stringify({realR2:true,writer:role,
     result,headGeneration:after?.value?.generation,synthetic:true,deltaImmutable:true}));
 }
 if(phase==='orphan'){
   const spec=makeDelta('ORPHAN');
   await put(spec.key,spec.body,{IfNoneMatch:'*'});
   assert.equal((await get(spec.key))?.body,spec.body);
   console.log('STAGE13_ORPHAN '+JSON.stringify({realR2:true,created:true,referenced:false,synthetic:true}));
 }
 if(phase==='inspect'){
   const h=await head();assert.equal(h?.value?.generation,1);
   const [entry]=h.value.chain;
   assert.ok([runId+'-A',runId+'-B'].includes(entry.receipt));
   const delta=await verifyDelta(entry);
   assert.ok(['A','B'].includes(delta.writer));
   const objs=await listDeltas();
   const gc=dryRunGc(h.value,runId,objs,Date.now());
   assert.equal(gc.objects,3,'EXPECTED_TWO_COMPETITORS_AND_ONE_ORPHAN');
   assert.equal(gc.reachable,1);assert.equal(gc.orphanRecent,2);assert.equal(gc.eligibleDryRun,0);
   assert.equal(gc.deleteOperations,0);
   output('winner',delta.writer);
   console.log('STAGE13_INSPECT '+JSON.stringify({realR2:true,phase,runId,generation:1,
     winner:delta.writer,objects:gc.objects,orphan:gc.orphanRecent,
     eligibleForGc:gc.eligibleDryRun,deletes:0,synthetic:true}));
 }
 if(phase==='advance'){
   const h=await head();assert.equal(h?.value?.generation,1);
   const winner=h.value.chain[0].receipt;
   const spec=makeDelta('RECOVERY');
   await put(spec.key,spec.body,{IfNoneMatch:'*'});
   assert.equal((await get(spec.key))?.body,spec.body);
   const proposal=nextHead(h.value,runId,spec,runId+'-RECOVERY');
   // Make sure the R2 per-key write throttle doesn't mask the CAS result.
   await wait(1300);
   await put(headKey,encode(proposal),{IfMatch:h.etag});
   // Discard the returned ACK intentionally and recover only from a fresh read.
   const recovered=await head();
   assert.equal(recovered.value.generation,2);
   assert.equal(ackStatus(recovered.value,runId,runId+'-RECOVERY'),'already_committed');
   assert.equal(recovered.value.chain[0].receipt,winner);
   for(const entry of recovered.value.chain)await verifyDelta(entry);
   await wait(1300);
   let stale='unexpected_success';
   try{await put(headKey,encode(proposal),{IfMatch:h.etag});}
   catch(e){stale=classifyError(e)}
   assert.equal(stale,'PRECONDITION_412');
   const final=await head();assert.equal(final.value.generation,2);
   const objs=await listDeltas(),gc=dryRunGc(final.value,runId,objs,Date.now());
   assert.equal(gc.reachable,2);assert.equal(gc.orphanRecent,2);
   assert.equal(gc.eligibleDryRun,0);assert.equal(gc.deleteOperations,0);
   console.log('STAGE13_ADVANCE '+JSON.stringify({realR2:true,runId,generation:2,
      receiptsVerified:2,staleWrite:stale,orphanUncommitted:gc.orphanRecent,
      orphanGcDryRun:gc.eligibleDryRun,actualDeletes:0,
      simulatedLostAckRecovered:true,synthetic:true,puts,gets,lists}));
 }
}
try{await main()}finally{s3.destroy()}
