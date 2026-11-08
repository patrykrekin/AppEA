/* Stage 15A LIVE synthetic R2 pilot. No DeleteObject, no production history. */
import assert from 'node:assert/strict';
import {appendFileSync,writeFileSync} from 'node:fs';
import {S3Client,PutObjectCommand,GetObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
import {namespace,init,delta,append,freeze,rotate,release,buildPage,validateHead,
 verifyBytes,dryGcFrozen,serialize} from './core.mjs';
const phase=process.argv[2];
if(process.env.STAGE15A_LIVE_CONSENT!=='yes')throw Error('NOT_AUTHORIZED');
if(!['seed','lock','stale','rotate','export'].includes(phase))throw Error('UNKNOWN_PHASE');
const id=process.env.STAGE15A_RUN_ID,prefix=namespace(id),HEAD=prefix+'hot/head.json';
for(const key of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'])
 if(!process.env[key])throw Error('MISSING_'+key);
const account=process.env.R2_ACCOUNT_ID;
if(!/^[a-f0-9]{32}$/.test(account))throw Error('BAD_ACCOUNT');
const endpoint=process.env.R2_ENDPOINT||('https://'+account+'.r2.cloudflarestorage.com');
if(!/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us))?\.r2\.cloudflarestorage\.com$/.test(endpoint))
 throw Error('INVALID_ENDPOINT');
const client=new S3Client({region:'auto',endpoint,forcePathStyle:true,maxAttempts:1,
 requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
 credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const bucket=process.env.R2_BUCKET,delay=ms=>new Promise(r=>setTimeout(r,ms));
let puts=0,gets=0,lists=0;
function checkKey(key){
 if(typeof key!=='string'||!key.startsWith(prefix)||!key.endsWith('.json')||key.length>1024)
  throw Error('OUTSIDE_NAMESPACE');
}
async function read(key){
 checkKey(key);if(++gets>40)throw Error('GET_BUDGET');
 try{
  const v=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  assert.ok(v.ETag&&v.Body);
  return{etag:v.ETag,body:await v.Body.transformToString('utf8')};
 }catch(e){if(e?.$metadata?.httpStatusCode===404||e?.name==='NoSuchKey')return null;throw e;}
}
async function write(key,body,cond){
 checkKey(key);if(++puts>7)throw Error('PUT_BUDGET');
 if(!!cond?.IfNoneMatch===!!cond?.IfMatch||Buffer.byteLength(body)>65536)
  throw Error('MISSING_CONDITION_OR_OVERSIZED');
 return client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:'application/json',...cond}));
}
async function head(){
 const r=await read(HEAD);if(!r)return null;
 const v=JSON.parse(r.body);validateHead(v,id);return{...r,value:v};
}
function output(key,value){
 if(!process.env.GITHUB_OUTPUT)throw Error('NO_OUTPUT');
 appendFileSync(process.env.GITHUB_OUTPUT,key+'='+value+'\n');
}
function proof(kind,details){
 console.log('STAGE15A_'+kind+' '+JSON.stringify({realR2:true,synthetic:true,phase,runId:id,puts,gets,lists,...details}));
}
try{
 if(phase==='seed'){
  assert.equal(await head(),null,'UNIQUE_RUN_REQUIRED');
  await write(HEAD,serialize(init(id)),{IfNoneMatch:'*'});
  let h=await head();assert.equal(h.value.generation,0);
  for(let i=1;i<=2;i++){
   const spec=delta(id,i,'r'+i,i%2?'ps':'pc');
   await write(spec.key,spec.body,{IfNoneMatch:'*'});
   await delay(1300);
   const proposal=append(h.value,id,spec,'r'+i);
   await write(HEAD,serialize(proposal),{IfMatch:h.etag});
   h=await head();assert.equal(h.value.generation,i);
  }
  proof('SEED',{generation:2,revision:h.value.revision,tail:h.value.tail.length});
 }
 if(phase==='lock'){
  const h=await head();assert.equal(h.value.mode,'active');assert.equal(h.value.generation,2);
  const proposal=freeze(h.value,id);await delay(1300);
  await write(HEAD,serialize(proposal),{IfMatch:h.etag});
  const locked=await head();assert.equal(locked.value.mode,'maintenance');
  assert.equal(locked.value.epoch,h.value.epoch+1);
  output('base_etag',h.etag);
  proof('LOCK',{epoch:locked.value.epoch,generation:locked.value.generation,maintenance:true});
 }
 if(phase==='stale'){
  const locked=await head();assert.equal(locked.value.mode,'maintenance');
  const previous={...locked.value,mode:'active',revision:locked.value.revision-1,epoch:locked.value.epoch-1};
  const spec=delta(id,3,'late','ps');
  await write(spec.key,spec.body,{IfNoneMatch:'*'});
  const proposal=append(previous,id,spec,'late');
  const etag=process.env.STAGE15A_BASE_ETAG;
  if(!/^"[^"]+"$/.test(etag||''))throw Error('EXPECTED_BASE_ETAG');
  await delay(1300);
  let status;
  try{await write(HEAD,serialize(proposal),{IfMatch:etag});status='UNEXPECTED_SUCCESS';}
  catch(e){status=e?.$metadata?.httpStatusCode===412?'PRECONDITION_412':String(e?.$metadata?.httpStatusCode||e?.name);}
  assert.equal(status,'PRECONDITION_412');
  const current=await head();assert.equal(current.value.mode,'maintenance');
  proof('STALE',{staleWriter:status,stillMaintenance:true,orphanCreated:true});
 }
 if(phase==='rotate'){
  let locked=await head();assert.equal(locked.value.mode,'maintenance');assert.equal(locked.value.tail.length,2);
  const bodies=[];
  for(const e of locked.value.tail){const obj=await read(e.key);assert.ok(obj);bodies.push(obj.body);}
  const page=buildPage(locked.value,id,bodies);
  await write(page.primary.key,page.primary.body,{IfNoneMatch:'*'});
  await write(page.backup.key,page.backup.body,{IfNoneMatch:'*'});
  assert.equal((await read(page.primary.key)).body,page.primary.body);
  assert.equal((await read(page.backup.key)).body,page.backup.body);
  let proposed=rotate(locked.value,id,page);await delay(1300);
  await write(HEAD,serialize(proposed),{IfMatch:locked.etag});
  locked=await head();assert.equal(locked.value.mode,'maintenance');assert.equal(locked.value.tail.length,0);
  const listing=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix,MaxKeys:100}));lists++;
  assert.equal(listing.IsTruncated,false);
  const inventory=(listing.Contents||[]).filter(x=>/\/(deltas|pages|page-backups)\//.test(x.Key));
  const mem=new Map([[page.primary.key,page.primary.body],[page.backup.key,page.backup.body]]);
  const gc=dryGcFrozen(locked.value,id,key=>mem.get(key)||null,inventory,Date.now());
  assert.deepEqual([gc.live,gc.hold,gc.eligible,gc.deleteOperations],[2,3,0,0]);
  proposed=release(locked.value,id);await delay(1300);
  await write(HEAD,serialize(proposed),{IfMatch:locked.etag});
  const released=await head();assert.equal(released.value.mode,'active');assert.equal(released.value.epoch,2);
  const parsed=verifyBytes(id,'pages',page.primary,page.primary.body);
  assert.equal(parsed.records.length,2);
  proof('ROTATE',{generation:released.value.generation,epoch:released.value.epoch,
   pages:1,records:parsed.records.length,rawDeltas:2,staleOrphan:1,gc,headBytes:Buffer.byteLength(serialize(released.value))});
 }
 if(phase==='export'){
  const h=await head();assert.equal(h.value.mode,'active');assert.equal(h.value.generation,2);
  const p=h.value.page,r=await read(p.backup.key);assert.ok(r);
  const v=verifyBytes(id,'page-backups',p.backup,r.body);assert.equal(v.records.length,2);
  writeFileSync(process.env.RUNNER_TEMP+'/stage15a-page.json',r.body,{mode:0o600});
  output('expected_sha',p.backup.sha);
  proof('EXPORT',{sha:p.backup.sha,bytes:Buffer.byteLength(r.body),offBucketUploadPending:true});
 }
}finally{client.destroy()}
