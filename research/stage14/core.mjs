/* AppEA stage 14: immutable checkpoint & backup and fail-closed GC. SYNTHETIC ONLY. */
import {createHash} from 'node:crypto';
export const SHA=s=>createHash('sha256').update(s).digest('hex');
export const encode=x=>JSON.stringify(x)+'\n';
export const GRACE_MS=72*3600*1000, MAX_OBJECT=65536, MAX_CHAIN=24;
export const runPrefix=id=>{
 if(!/^stage14-[0-9]{8,20}$/.test(id||''))throw Error('BAD_RUN_ID');
 return 'appea-research/stage14/'+id+'/';
};
export function objectSpec(id,kind,payload){
 if(!['deltas','checkpoints','backups'].includes(kind))throw Error('BAD_KIND');
 const body=encode(payload),sha=SHA(body),key=runPrefix(id)+kind+'/'+sha+'.json';
 if(Buffer.byteLength(body)>MAX_OBJECT)throw Error('OBJECT_TOO_LARGE');
 return {body,sha,key,kind};
}
const validPtr=(id,kind,x)=>{
 const prefix=runPrefix(id)+kind+'/';
 if(!x||typeof x.key!=='string'||typeof x.sha!=='string'
     ||!/^[a-f0-9]{64}$/.test(x.sha)||x.key!==prefix+x.sha+'.json')throw Error('BAD_POINTER_'+kind);
};
export function initialHead(id){
 runPrefix(id);
 return {schema:14,kind:'head',runId:id,revision:0,generation:0,checkpoint:null,backup:null,tail:[],lastReceipt:'init'};
}
export function validateHead(h,id){
 runPrefix(id);
 if(!h||h.schema!==14||h.kind!=='head'||h.runId!==id
  ||!Number.isSafeInteger(h.revision)||h.revision<0
  ||!Number.isSafeInteger(h.generation)||h.generation<0
  ||!Array.isArray(h.tail)||h.tail.length>MAX_CHAIN)throw Error('BAD_HEAD');
 if((h.checkpoint===null)!==(h.backup===null))throw Error('CHECKPOINT_BACKUP_PAIR');
 if(h.checkpoint!==null){
  validPtr(id,'checkpoints',h.checkpoint);
  validPtr(id,'backups',h.backup);
  if(h.checkpoint.sha!==h.backup.sha||h.checkpoint.upto!==h.backup.upto
   ||h.checkpoint.lastReceipt!==h.backup.lastReceipt
   ||!Number.isSafeInteger(h.checkpoint.upto)||h.checkpoint.upto<1)
    throw Error('BACKUP_NOT_IDENTICAL');
 }
 const base=h.checkpoint?.upto??0,receipts=new Set();
 for(const [i,x] of h.tail.entries()){
  validPtr(id,'deltas',x);
  if(x.seq!==base+i+1||typeof x.receipt!=='string'||x.receipt.length<1||receipts.has(x.receipt))throw Error('TAIL_DISCONTINUITY');
  receipts.add(x.receipt);
 }
 if(h.generation!==base+h.tail.length)throw Error('BAD_GENERATION');
 const newest=h.tail.at(-1)?.receipt??h.checkpoint?.lastReceipt??'init';
 if(h.lastReceipt!==newest||Buffer.byteLength(encode(h))>MAX_OBJECT)throw Error('BAD_LAST_RECEIPT');
 return h;
}
export function delta(id,seq,receipt,side){
 runPrefix(id);
 if(!Number.isSafeInteger(seq)||seq<1||!['ps','pc'].includes(side)
  ||typeof receipt!=='string'||receipt.length<1||receipt.length>100)throw Error('BAD_DELTA_INPUT');
 return objectSpec(id,'deltas',{schema:14,kind:'delta',synthetic:true,runId:id,
  seq,receipt,observed:[{side,rating:85,profileId:'111',price:1200}]});
}
export function verifyObject(spec,body,id,kind){
 validPtr(id,kind,spec);
 if(SHA(body)!==spec.sha||Buffer.byteLength(body)>MAX_OBJECT)throw Error('CONTENT_HASH_MISMATCH');
 const parsed=JSON.parse(body);
 if(parsed?.schema!==14||parsed?.synthetic!==true||parsed?.runId!==id)throw Error('INVALID_SYNTHETIC_PAYLOAD');
 return parsed;
}
export function append(h,id,d,receipt){
 validateHead(h,id);validPtr(id,'deltas',d);
 const x={schema:14,kind:'head',runId:id,revision:h.revision+1,generation:h.generation+1,
  checkpoint:h.checkpoint,backup:h.backup,
  tail:[...h.tail,{key:d.key,sha:d.sha,seq:h.generation+1,receipt}],lastReceipt:receipt};
 return validateHead(x,id);
}
export function snapshotPayload(h,id,records){
 validateHead(h,id);
 if(h.checkpoint!==null)throw Error('ALREADY_CHECKPOINTED_THIS_TEST');
 if(h.generation!==2||h.tail.length!==2||records.length!==2)throw Error('EXPECTED_TWO_PRE_CHECKPOINT_RECORDS');
 const entries=records.map((r,i)=>{
  const parsed=verifyObject({key:h.tail[i].key,sha:h.tail[i].sha},r,id,'deltas');
  if(parsed.seq!==h.tail[i].seq||parsed.receipt!==h.tail[i].receipt
     ||parsed.kind!=='delta'||!Array.isArray(parsed.observed))throw Error('DELTA_DOES_NOT_MATCH_HEAD');
  return parsed;
 });
 return {schema:14,kind:'checkpoint',synthetic:true,runId:id,upto:h.generation,
  lastReceipt:h.lastReceipt,entries};
}
export function checkpointHead(h,id,payload,primary,backup){
 validateHead(h,id);
 if(h.checkpoint!==null||payload?.upto!==h.generation||payload.lastReceipt!==h.lastReceipt
  ||payload.entries.length!==h.tail.length||primary.sha!==backup.sha)throw Error('CHECKPOINT_WRONG_HEAD');
 validPtr(id,'checkpoints',primary);validPtr(id,'backups',backup);
 return validateHead({schema:14,kind:'head',runId:id,revision:h.revision+1,generation:h.generation,
   checkpoint:{key:primary.key,sha:primary.sha,upto:payload.upto,lastReceipt:payload.lastReceipt},
   backup:{key:backup.key,sha:backup.sha,upto:payload.upto,lastReceipt:payload.lastReceipt},
   tail:[],lastReceipt:h.lastReceipt},id);
}
export function readCheckpoint(id,head,body,kind){
 validateHead(head,id);
 const ptr=kind==='backups'?head.backup:head.checkpoint;
 const p=verifyObject(ptr,body,id,kind);
 if(p.kind!=='checkpoint'||p.upto!==ptr.upto||p.lastReceipt!==ptr.lastReceipt
  ||p.entries?.length!==p.upto)throw Error('RESTORE_CHECKPOINT_BAD');
 for(let i=0;i<p.entries.length;i++){
  const r=p.entries[i];
  if(r.kind!=='delta'||r.seq!==i+1||r.synthetic!==true||r.runId!==id)throw Error('BAD_CHECKPOINT_ENTRIES');
 }
 if(p.entries.at(-1)?.receipt!==p.lastReceipt)throw Error('CHECKPOINT_RECEIPT_MISMATCH');
 return p.entries;
}
export function restore(id,head,cpBody,tailBodies,kind='checkpoints'){
 validateHead(head,id);
 const before=readCheckpoint(id,head,cpBody,kind);
 if(tailBodies.length!==head.tail.length)throw Error('TAIL_MISSING');
 const after=tailBodies.map((body,i)=>{
  const r=verifyObject(head.tail[i],body,id,'deltas');
  if(r.kind!=='delta'||r.seq!==head.tail[i].seq||r.receipt!==head.tail[i].receipt)throw Error('TAIL_DATA_CONFLICT');
  return r;
 });
 const all=[...before,...after];
 if(all.length!==head.generation||all.at(-1)?.receipt!==head.lastReceipt)throw Error('RECONSTRUCTION_MISMATCH');
 return all;
}
export function planGc(id,head,cpBody,backupBody,objects,nowMs,grace=GRACE_MS){
 validateHead(head,id);
 if(head.checkpoint===null||grace<GRACE_MS||!Number.isFinite(nowMs))throw Error('GC_PRECONDITION_FAIL');
 const cp=readCheckpoint(id,head,cpBody,'checkpoints');
 const backup=readCheckpoint(id,head,backupBody,'backups');
 if(encode(cp)!==encode(backup))throw Error('BACKUP_DIVERGENCE');
 if(!Array.isArray(objects)||objects.length>1000)throw Error('GC_LIST_BUDGET');
 const pref=runPrefix(id)+'deltas/',referencedTail=new Set(head.tail.map(x=>x.key));
 const seen=new Set(),report=[];
 for(const x of objects){
  if(!x?.Key?.startsWith(pref))throw Error('UNRELATED_LISTING');
  if(seen.has(x.Key)||!/^.+\/deltas\/[a-f0-9]{64}\.json$/.test(x.Key))throw Error('UNSAFE_OBJECT_NAME');
  seen.add(x.Key);
  const t=new Date(x.LastModified).getTime();
  if(!Number.isFinite(t)||t>nowMs)throw Error('INVALID_LAST_MODIFIED');
  let reason=referencedTail.has(x.Key)?'KEEP_LIVE_TAIL':
    nowMs-t<grace?'KEEP_GRACE':
    'ELIGIBLE_AFTER_REVALIDATION';
  report.push({key:x.Key,reason});
 }
 return {total:report.length,active:report.filter(x=>x.reason==='KEEP_LIVE_TAIL').length,
  grace:report.filter(x=>x.reason==='KEEP_GRACE').length,
  eligible:report.filter(x=>x.reason==='ELIGIBLE_AFTER_REVALIDATION').length,
  deleteOperations:0,report};
}
export function validateTrash(id,key,record){
 const only=runPrefix(id)+'trash/disposable.json';
 if(key!==only||record?.schema!==14||record?.synthetic!==true
  ||record?.kind!=='disposable'||record?.runId!==id)throw Error('NOT_AUTHORIZED_FOR_DISPOSAL');
 return true;
}
