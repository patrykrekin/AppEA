/* STAGE14: LIVE only after explicit one-shot approval, entirely synthetic.
 * Writes a new run-scoped checkpoint + independent backup, restores on new VM,
 * dry-runs GC and deletes exactly one freshly created disposable TRASH object.
 * Never removes HEAD / deltas / checkpoints / backups / previous runs.
 */
import assert from 'node:assert/strict';
import {S3Client,GetObjectCommand,PutObjectCommand,ListObjectsV2Command,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {runPrefix,encode,initialHead,validateHead,delta,append,snapshotPayload,objectSpec,
 checkpointHead,readCheckpoint,restore,planGc,validateTrash,verifyObject} from './core.mjs';

if(process.env.APPEA_STAGE14_LIVE_CONSENT!=='yes')throw Error('LIVE_NOT_AUTHORIZED');
const phase=process.argv[2];
if(!['seed','checkpoint','restore','trash'].includes(phase))throw Error('INVALID_PHASE');
const id=process.env.R2_PILOT_ID,prefix=runPrefix(id),HEAD=prefix+'hot/head.json';
for(const x of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'])if(!process.env[x])throw Error('MISSING_SECRET_'+x);
const account=process.env.R2_ACCOUNT_ID;
if(!/^[a-f0-9]{32}$/.test(account))throw Error('BAD_ACCOUNT_ID');
const endpoint=process.env.R2_ENDPOINT||('https://'+account+'.r2.cloudflarestorage.com');
if(!/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us))?\.r2\.cloudflarestorage\.com$/.test(endpoint))throw Error('UNSAFE_ENDPOINT');
const client=new S3Client({region:'auto',endpoint,forcePathStyle:true,maxAttempts:1,
 requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
 credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const bucket=process.env.R2_BUCKET;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let puts=0,gets=0,lists=0,deletes=0;
const limitKey=key=>{
 if(typeof key!=='string'||!key.startsWith(prefix)||key.length>1024||!key.endsWith('.json'))throw Error('UNSAFE_KEY');
};
const get=async key=>{
 limitKey(key);if(++gets>30)throw Error('GET_LIMIT_REACHED');
 try{
  const o=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  assert.ok(o.ETag&&o.Body,'NO_ETAG_OR_BODY');
  return {etag:o.ETag,body:await o.Body.transformToString('utf8')};
 }catch(e){if(e?.$metadata?.httpStatusCode===404||e?.name==='NoSuchKey')return null;throw e;}
};
const put=async(key,body,condition)=>{
 limitKey(key);if(++puts>8)throw Error('PUT_LIMIT_REACHED');
 if(!!condition?.IfMatch===!!condition?.IfNoneMatch)throw Error('UNCONDITIONAL_PUT_FORBIDDEN');
 if(Buffer.byteLength(body)>65536)throw Error('OBJECT_TOO_LARGE');
 return client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,
 ContentType:'application/json',...condition}));
};
const list=async()=>{
 let token,all=[];
 do{
  if(++lists>3)throw Error('LIST_LIMIT_REACHED');
  const r=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix+'deltas/',MaxKeys:100,ContinuationToken:token}));
  all.push(...(r.Contents||[]));
  token=r.IsTruncated?r.NextContinuationToken:null;
  if(r.IsTruncated&&!token)throw Error('INVALID_PAGINATION');
 }while(token);
 return all;
};
const head=async()=>{
 const r=await get(HEAD);if(!r)return null;
 const h=JSON.parse(r.body);validateHead(h,id);
 return {...r,value:h};
};
const checkedDelta=async(entry)=>{
 const r=await get(entry.key);assert.ok(r,'MISSING_DELTA');
 const v=verifyObject(entry,r.body,id,'deltas');assert.equal(v.kind,'delta');assert.equal(v.seq,entry.seq);
 return r.body;
};
const checkedCheckpoint=async(h,which)=>{
 const ptr=which==='backups'?h.value.backup:h.value.checkpoint;
 const r=await get(ptr.key);assert.ok(r,'MISSING_CHECKPOINT_OR_BACKUP');
 readCheckpoint(id,h.value,r.body,which);return r.body;
};
const status=async(message,fields)=>console.log(message+' '+JSON.stringify({realR2:true,synthetic:true,runId:id,...fields,
  puts,gets,lists,deletes}));
const receipt=(n)=>id+'-r'+n;
const assert412=async f=>{
 let value;
 try{await f();value='unexpected_success';}catch(e){value=e?.$metadata?.httpStatusCode===412?'PRECONDITION_412':String(e?.$metadata?.httpStatusCode||e?.name);}
 assert.equal(value,'PRECONDITION_412','Expected stale ETag to give 412, got '+value);
};
try{
 if(phase==='seed'){
  assert.equal(await head(),null,'EXISTING_TEST_RUN_ID');
  let h=initialHead(id);
  await put(HEAD,encode(h),{IfNoneMatch:'*'});
  let state=await head();assert.equal(state.value.generation,0);
  const d1=delta(id,1,receipt(1),'ps'),d2=delta(id,2,receipt(2),'pc');
  await put(d1.key,d1.body,{IfNoneMatch:'*'});
  await wait(1300);
  h=append(h,id,d1,receipt(1));
  await put(HEAD,encode(h),{IfMatch:state.etag});
  state=await head();assert.equal(state.value.generation,1);
  await put(d2.key,d2.body,{IfNoneMatch:'*'});
  await wait(1300);
  h=append(h,id,d2,receipt(2));
  await put(HEAD,encode(h),{IfMatch:state.etag});
  state=await head();assert.equal(state.value.generation,2);
  const orphan=delta(id,77,'orphan', 'ps');
  await put(orphan.key,orphan.body,{IfNoneMatch:'*'});
  assert.equal((await get(orphan.key))?.body,orphan.body);
  await status('STAGE14_SEED',{generation:2,revision:2,committedDeltas:2,uncommittedDeltas:1});
 }
 if(phase==='checkpoint'){
  const h=await head();assert.equal(h?.value?.generation,2);
  const bodies=await Promise.all(h.value.tail.map(checkedDelta));
  const cp=snapshotPayload(h.value,id,bodies);
  const primary=objectSpec(id,'checkpoints',cp),backup=objectSpec(id,'backups',cp);
  assert.notEqual(primary.key,backup.key);assert.equal(primary.sha,backup.sha);
  await put(primary.key,primary.body,{IfNoneMatch:'*'});
  await put(backup.key,backup.body,{IfNoneMatch:'*'});
  const p=await get(primary.key),b=await get(backup.key);
  assert.equal(p?.body,primary.body);assert.equal(b?.body,backup.body);
  const proposed=checkpointHead(h.value,id,cp,primary,backup);
  await wait(1300);
  await put(HEAD,encode(proposed),{IfMatch:h.etag});
  const updated=await head();assert.equal(updated.value.generation,2);
  assert.equal(updated.value.tail.length,0);assert.equal(updated.value.revision,3);
  assert.equal(readCheckpoint(id,updated.value,p.body,'checkpoints').length,2);
  assert.equal(readCheckpoint(id,updated.value,b.body,'backups').length,2);
  await status('STAGE14_CHECKPOINT',{generation:2,revision:3,checkpointSha:primary.sha,
    backupMatches:true,committedRecords:2,bytesPrimary:Buffer.byteLength(primary.body),independentKeys:true});
 }
 if(phase==='restore'){
  const h=await head();assert.equal(h?.value?.generation,2);assert.equal(h?.value?.revision,3);
  const primary=await checkedCheckpoint(h,'checkpoints'),backup=await checkedCheckpoint(h,'backups');
  const a=restore(id,h.value,primary,[],'checkpoints');
  // Backup restoration does not fetch or rely on the primary object or old raw deltas.
  const b=restore(id,h.value,backup,[],'backups');
  assert.deepEqual(a,b);
  const d3=delta(id,3,receipt(3),'ps');
  await put(d3.key,d3.body,{IfNoneMatch:'*'});
  const proposed=append(h.value,id,d3,receipt(3));
  await wait(1300);
  await put(HEAD,encode(proposed),{IfMatch:h.etag});
  let end=await head();assert.equal(end.value.generation,3);assert.equal(end.value.revision,4);
  const laterBody=await checkedDelta(end.value.tail[0]);
  const restoredBackup=restore(id,end.value,backup,[laterBody],'backups');
  assert.deepEqual(restoredBackup.map(x=>x.receipt),[receipt(1),receipt(2),receipt(3)]);
  await wait(1300);
  await assert412(()=>put(HEAD,encode(proposed),{IfMatch:h.etag}));
  end=await head();assert.equal(end.value.generation,3);
  await status('STAGE14_RESTORE',{generation:3,revision:4,
    recoveredFromBackupWithoutPrimary:true,restoredEvents:restoredBackup.length,
    oldRawDeltasNotReadForBackup:true,staleEtag:'PRECONDITION_412'});
 }
 if(phase==='trash'){
  const h=await head();assert.equal(h?.value?.generation,3);
  const [cp,backup]=await Promise.all([checkedCheckpoint(h,'checkpoints'),checkedCheckpoint(h,'backups')]);
  const tailBody=await checkedDelta(h.value.tail[0]);
  const history=restore(id,h.value,backup,[tailBody],'backups');assert.equal(history.length,3);
  const before=await list();
  const gc=planGc(id,h.value,cp,backup,before,Date.now());
  assert.deepEqual({total:gc.total,active:gc.active,grace:gc.grace,eligible:gc.eligible,deletes:gc.deleteOperations},
   {total:4,active:1,grace:3,eligible:0,deletes:0});
  const key=prefix+'trash/disposable.json',
   rec={schema:14,kind:'disposable',synthetic:true,runId:id,receipt:'one-time-test-only'},
   body=encode(rec);
  validateTrash(id,key,rec);
  assert.equal(await get(key),null,'DISPOSABLE_EXISTS');
  await put(key,body,{IfNoneMatch:'*'});
  const item=await get(key);assert.equal(item?.body,body);
  validateTrash(id,key,JSON.parse(item.body));
  const fresh=await head();assert.equal(fresh.etag,h.etag,'HEAD_CHANGED_ABORT_DELETE');
  assert.equal(fresh.value.generation,3,'HEAD_MOVED');
  if(++deletes>1)throw Error('DELETE_BUDGET');
  await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
  assert.equal(await get(key),null,'DELETE_NOT_VISIBLE');
  const finalHead=await head();assert.equal(finalHead.etag,h.etag,'HEAD_MUTATED_BY_TRASH');
  const checkAfter=await list();assert.deepEqual(checkAfter.map(x=>x.Key).sort(),before.map(x=>x.Key).sort());
  await status('STAGE14_TRASH_TEST',{deletedDisposableObjects:1,
    deletedHistoryObjects:0,historyObjects:gc.total,
    liveTailProtected:gc.active,youngUncommittedProtected:gc.grace,
    gcEligible:gc.eligible,realGcDeletes:0,
    backupStillRestorable:true,checkpointAndHistoryIntact:true});
 }
}finally{client.destroy()}
