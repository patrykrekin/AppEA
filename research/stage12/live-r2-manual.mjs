/**
 * MANUAL-ONLY LIVE STAGE 12 pilot. No FUT.GG, no real card data, no deletes.
 * Run in two separate GitHub jobs: writer then reader, with same R2_PILOT_ID.
 * Credentials must be bucket-scoped GitHub environment secrets; never log them.
 */
import assert from 'node:assert/strict';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
if(process.env.APPEA_STAGE12_LIVE_CONSENT!=='yes')throw Error('LIVE_CONSENT_NOT_SET');
const phase=process.argv[2];
if(!['writer','reader'].includes(phase))throw Error('STAGE12_PHASE_REQUIRED');
const runId=process.env.R2_PILOT_ID;
if(!/^stage12-[0-9]{8,20}$/.test(runId||''))throw Error('R2_PILOT_ID_FORMAT');
const required=['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
for(const key of required)if(!process.env[key])throw Error('STAGE12_MISSING_'+key);
const account=process.env.R2_ACCOUNT_ID;
if(!/^[0-9a-f]{32}$/.test(account))throw Error('R2_ACCOUNT_ID_FORMAT');
const endpoint=process.env.R2_ENDPOINT||('https://'+account+'.r2.cloudflarestorage.com');
if(!/^https:\/\/[0-9a-f]{32}(?:\.(?:eu|us))?\.r2\.cloudflarestorage\.com$/.test(endpoint))throw Error('INVALID_R2_ENDPOINT');
const s3=new S3Client({region:'auto',endpoint,forcePathStyle:true,maxAttempts:1,
 requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
 credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const bucket=process.env.R2_BUCKET,key='appea-research/stage12/'+runId+'/head.json';
const body=revision=>JSON.stringify({stage:'12',synthetic:true,runId,revision,receipt:runId+'-g'+revision});
const get=async()=>{
 try{
  const r=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  assert.ok(r.ETag,'ETAG_REQUIRED');
  return {etag:r.ETag,value:JSON.parse(await r.Body.transformToString('utf8'))};
 }catch(e){if(e?.$metadata?.httpStatusCode===404||e?.name==='NoSuchKey')return null;throw e}
};
const put=(revision,cond)=>s3.send(new PutObjectCommand({Bucket:bucket,Key:key,
 Body:body(revision),ContentType:'application/json',...cond}));
const expect412=async p=>await assert.rejects(p,e=>e?.$metadata?.httpStatusCode===412,'expected 412');
try{
 if(phase==='writer'){
  assert.equal(await get(),null,'KEY_ALREADY_EXISTS_USE_NEW_RUN_ID');
  await put(1,{IfNoneMatch:'*'});await expect412(put(1,{IfNoneMatch:'*'}));
  const a=await get();assert.equal(a.value.revision,1);
  await put(2,{IfMatch:a.etag});await expect412(put(999,{IfMatch:a.etag}));
  const b=await get();assert.equal(b.value.revision,2);
  console.log('STAGE12_REAL_R2_WRITER '+JSON.stringify({realR2:true,phase,revision:2,was412:true,runId,synthetic:true}));
 }else{
  const a=await get();assert.equal(a?.value?.revision,2,'RESTART_DID_NOT_READ_GENERATION_2');assert.equal(a.value.runId,runId);
  await put(3,{IfMatch:a.etag});
  // Intentionally ignore successful response, recover only from a new GET.
  const b=await get();assert.equal(b.value.revision,3);assert.equal(b.value.receipt,runId+'-g3');
  await expect412(put(4,{IfMatch:a.etag}));
  console.log('STAGE12_REAL_R2_READER '+JSON.stringify({realR2:true,phase,revision:3,was412:true,
    recoveredAfterSimulatedLostAck:true,runId,synthetic:true}));
 }
}finally{s3.destroy()}
