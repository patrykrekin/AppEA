/* AppEA Stage 13, SYNTHETIC ONLY. Deterministic data model / dry-run GC. */
import {createHash} from 'node:crypto';
export const digest=body=>createHash('sha256').update(body).digest('hex');
export const encode=obj=>JSON.stringify(obj)+'\n';
export const PREFIX_RUN=/^stage13-[0-9]{8,20}$/;
export const MAX_HEAD=65536, MAX_DELTA=8192, GRACE_MS=72*3600*1000;
export const prefixOf=runId=>{
 if(!PREFIX_RUN.test(runId))throw Error('INVALID_RUN_ID');
 return 'appea-research/stage13/'+runId+'/';
};
export function deltaSpec(prefix,record){
 if(!prefix.startsWith('appea-research/stage13/')||!prefix.endsWith('/'))throw Error('INVALID_PREFIX');
 const body=encode(record),sha=digest(body),key=prefix+'deltas/'+sha+'.json';
 if(Buffer.byteLength(body)>MAX_DELTA)throw Error('DELTA_TOO_LARGE');
 return {body,sha,key};
}
export function inspectHead(head,runId){
 const prefix=prefixOf(runId);
 if(!head||head.schema!==13||head.runId!==runId||!Number.isSafeInteger(head.generation)
    ||head.generation<0||!Array.isArray(head.chain)
    ||head.chain.length!==head.generation||head.chain.length>16)
   throw Error('INVALID_MANIFEST_SCHEMA');
 const keys=new Set(),receipts=new Set();
 for(const x of head.chain){
  if(!x||typeof x.key!=='string'||!x.key.startsWith(prefix+'deltas/')
      ||!/^[0-9a-f]{64}$/.test(x.sha)||x.key!==prefix+'deltas/'+x.sha+'.json'
      ||typeof x.receipt!=='string'||x.receipt.length>128)
      throw Error('INVALID_DELTA_POINTER');
  if(keys.has(x.key)||receipts.has(x.receipt))throw Error('DUPLICATE_CHAIN_ENTRY');
  keys.add(x.key);receipts.add(x.receipt);
 }
 if(typeof head.receipt!=='string'||head.receipt!==((head.chain.at(-1)?.receipt)||'init'))throw Error('RECEIPT_MISMATCH');
 if(Buffer.byteLength(encode(head))>MAX_HEAD)throw Error('HEAD_TOO_LARGE');
 return {prefix,reachable:keys};
}
export function nextHead(current,runId,spec,receipt){
 const {prefix}=inspectHead(current,runId);
 if(!spec.key.startsWith(prefix+'deltas/')||spec.sha!==spec.key.slice((prefix+'deltas/').length,-5))
   throw Error('DELTA_OUTSIDE_RUN');
 if(current.chain.some(x=>x.key===spec.key||x.receipt===receipt))throw Error('DUPLICATED_COMMIT');
 const proposed={schema:13,runId,generation:current.generation+1,
     chain:[...current.chain,{key:spec.key,sha:spec.sha,receipt}],receipt};
 inspectHead(proposed,runId);return proposed;
}
export function dryRunGc(head,runId,listed,nowMs,graceMs=GRACE_MS){
 const {prefix,reachable}=inspectHead(head,runId);
 if(!Number.isFinite(nowMs)||!Number.isSafeInteger(graceMs)||graceMs<GRACE_MS)
  throw Error('INVALID_GC_POLICY');
 const entries=[],seen=new Set();
 for(const obj of listed){
  const key=obj?.Key;
  if(typeof key!=='string'||!key.startsWith(prefix+'deltas/'))continue;
  if(seen.has(key))throw Error('DUPLICATE_OBJECT_LIST');seen.add(key);
  if(!/^.+\/deltas\/[0-9a-f]{64}\.json$/.test(key))throw Error('UNEXPECTED_DELTA_KEY');
  const observedMs=new Date(obj.LastModified).getTime();
  if(!Number.isFinite(observedMs)||observedMs>nowMs)throw Error('UNTRUSTED_MODIFICATION_TIME');
  const isReferenced=reachable.has(key);
  const tooRecent=nowMs-observedMs<graceMs;
  entries.push({key,action:isReferenced?'KEEP_REFERENCED':tooRecent?'KEEP_GRACE':'ELIGIBLE_DRY_RUN_ONLY'});
 }
 return {
   reachable:entries.filter(x=>x.action==='KEEP_REFERENCED').length,
   orphanRecent:entries.filter(x=>x.action==='KEEP_GRACE').length,
   eligibleDryRun:entries.filter(x=>x.action==='ELIGIBLE_DRY_RUN_ONLY').length,
   objects:entries.length,
   deleteOperations:0,
   entries
 };
}
export function assertDelta(spec,body){
 if(digest(body)!==spec.sha||body!==spec.body)throw Error('DELTA_HASH_OR_BYTES_MISMATCH');
 const parsed=JSON.parse(body);
 if(parsed?.schema!==13||parsed?.synthetic!==true)throw Error('NON_SYNTHETIC_DELTA');
 return parsed;
}
export function ackStatus(head,runId,receipt){
 inspectHead(head,runId);
 return head.chain.some(x=>x.receipt===receipt)?'already_committed':'not_in_current_chain_fail_closed';
}
