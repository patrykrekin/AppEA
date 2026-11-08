import {createHash} from 'node:crypto';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const serialize=x=>JSON.stringify(x)+'\n';
export const GRACE_MS=72*3600_000,TAIL_LIMIT=16,RECEIPT_LIMIT=64,MAX_HEAD_BYTES=8192;
const RUN_RE=/^stage15a-[0-9]{8,20}$/;
export function namespace(id){if(!RUN_RE.test(id))throw Error('INVALID_RUN');return 'appea-research/stage15a/'+id+'/';}
export function makeObject(id,kind,value){
 if(!['deltas','pages','page-backups'].includes(kind))throw Error('UNSUPPORTED_KIND');
 const body=serialize(value),sha=hash(body),key=namespace(id)+kind+'/'+sha+'.json';
 if(Buffer.byteLength(body)>65536)throw Error('OBJECT_TOO_LARGE');
 return{key,sha,body};
}
export function verifyPointer(id,kind,p){
 const base=namespace(id)+kind+'/';
 if(!p||typeof p.key!=='string'||typeof p.sha!=='string'||!/^[a-f0-9]{64}$/.test(p.sha)||p.key!==base+p.sha+'.json')throw Error('INVALID_POINTER');
}
export function verifyBytes(id,kind,p,bytes){
 verifyPointer(id,kind,p);
 if(typeof bytes!=='string'||hash(bytes)!==p.sha)throw Error('HASH_MISMATCH');
 const obj=JSON.parse(bytes);
 if(obj.runId!==id||obj.schema!==15||obj.synthetic!==true)throw Error('UNTRUSTED_OBJECT');
 return obj;
}
export function init(id){namespace(id);return{schema:15,runId:id,revision:0,epoch:0,mode:'active',generation:0,lastAt:null,page:null,tail:[],receipts:[]};}
export function validateHead(h,id){
 namespace(id);
 if(!h||h.schema!==15||h.runId!==id||!['active','maintenance'].includes(h.mode)||
 !Number.isSafeInteger(h.revision)||h.revision<0||!Number.isSafeInteger(h.epoch)||h.epoch<0||
 !Number.isSafeInteger(h.generation)||h.generation<0||
 (h.generation===0?h.lastAt!==null:!Number.isSafeInteger(h.lastAt)||h.lastAt<0)||
 !Array.isArray(h.tail)||h.tail.length>TAIL_LIMIT||!Array.isArray(h.receipts)||h.receipts.length>RECEIPT_LIMIT)throw Error('INVALID_HEAD');
 if(h.page!==null){
  if(!h.page||!Number.isSafeInteger(h.page.through)||h.page.through<1)throw Error('BAD_PAGE_CURSOR');
  verifyPointer(id,'pages',h.page.primary);verifyPointer(id,'page-backups',h.page.backup);
  if(h.page.primary.sha!==h.page.backup.sha)throw Error('BAD_PAGE_MIRROR');
 }
 const base=h.page?.through??0;
 if(h.generation!==base+h.tail.length)throw Error('GAP_IN_HEAD');
 for(let i=0;i<h.tail.length;i++){
  const t=h.tail[i];verifyPointer(id,'deltas',t);
  if(t.seq!==base+i+1||typeof t.receipt!=='string'||t.receipt.length<1||t.receipt.length>128)throw Error('INVALID_TAIL');
 }
 const seen=new Set();
 for(const r of h.receipts){
  if(!r||typeof r.receipt!=='string'||r.receipt.length<1||r.receipt.length>128||
  !Number.isSafeInteger(r.seq)||r.seq<1||r.seq>h.generation||seen.has(r.receipt))throw Error('INVALID_RECEIPT');
  seen.add(r.receipt);
 }
 if(Buffer.byteLength(serialize(h))>MAX_HEAD_BYTES)throw Error('HEAD_TOO_LARGE');
 return h;
}
export function delta(id,seq,receipt,market){
 namespace(id);
 if(!Number.isSafeInteger(seq)||seq<1||typeof receipt!=='string'||receipt.length<1||receipt.length>128||!['ps','pc'].includes(market))throw Error('BAD_DELTA');
 return makeObject(id,'deltas',{schema:15,synthetic:true,kind:'delta',runId:id,seq,receipt,market,at:seq*120,offers:[{rating:85,profile:'111',price:1200}]});
}
export function append(h,id,spec,receipt){
 validateHead(h,id);
 if(h.mode!=='active')throw Error('FENCED_MAINTENANCE');
 if(h.tail.length===TAIL_LIMIT)throw Error('ROTATION_REQUIRED');
 verifyPointer(id,'deltas',spec);
 const v=verifyBytes(id,'deltas',spec,spec.body);
 if(v.kind!=='delta'||v.seq!==h.generation+1||v.receipt!==receipt||!Number.isSafeInteger(v.at)||
 (h.lastAt!==null&&v.at<=h.lastAt))throw Error('STALE_OR_INVALID_DELTA');
 if(h.receipts.some(r=>r.receipt===receipt)||h.tail.some(r=>r.receipt===receipt))throw Error('DUPLICATE_RECEIPT');
 const seq=h.generation+1;
 return validateHead({...h,revision:h.revision+1,generation:seq,lastAt:v.at,
 tail:[...h.tail,{key:spec.key,sha:spec.sha,seq,receipt}],
 receipts:[...h.receipts,{receipt,seq}].slice(-RECEIPT_LIMIT)},id);
}
export function freeze(h,id){
 validateHead(h,id);if(h.mode!=='active')throw Error('ALREADY_FROZEN');
 return validateHead({...h,revision:h.revision+1,epoch:h.epoch+1,mode:'maintenance'},id);
}
export function buildPage(h,id,bodies){
 validateHead(h,id);
 if(h.mode!=='maintenance'||!h.tail.length||bodies.length!==h.tail.length)throw Error('UNSAFE_ROTATION');
 const records=bodies.map((body,i)=>{
  const e=h.tail[i],v=verifyBytes(id,'deltas',e,body);
  if(v.kind!=='delta'||v.seq!==e.seq||v.receipt!==e.receipt)throw Error('DELTA_MISMATCH');
  return v;
 });
 const value={schema:15,synthetic:true,kind:'page',runId:id,through:h.generation,prev:h.page,records};
 const primary=makeObject(id,'pages',value),backup=makeObject(id,'page-backups',value);
 if(primary.sha!==backup.sha)throw Error('BACKUP_DIGEST_MISMATCH');
 return{primary,backup,value};
}
export function rotate(h,id,page){
 validateHead(h,id);
 if(h.mode!=='maintenance'||!page?.value||page.value.through!==h.generation||
 page.value.prev?.primary?.sha!==h.page?.primary?.sha)throw Error('ROTATION_STALE');
 verifyPointer(id,'pages',page.primary);verifyPointer(id,'page-backups',page.backup);
 if(page.primary.sha!==page.backup.sha)throw Error('NOT_MIRRORED');
 return validateHead({...h,revision:h.revision+1,page:{primary:{key:page.primary.key,sha:page.primary.sha},
 backup:{key:page.backup.key,sha:page.backup.sha},through:h.generation},tail:[]},id);
}
export function release(h,id){
 validateHead(h,id);if(h.mode!=='maintenance')throw Error('NOT_FROZEN');
 return validateHead({...h,revision:h.revision+1,epoch:h.epoch+1,mode:'active'},id);
}
export function receiptStatus(h,id,receipt){
 validateHead(h,id);return h.receipts.some(r=>r.receipt===receipt)?'COMMITTED':'AMBIGUOUS_FAIL_CLOSED';
}
export function readPages(h,id,load,maxPages=128){
 validateHead(h,id);
 let cursor=h.page;const pages=[],seen=new Set();
 while(cursor){
  if(pages.length>=maxPages)throw Error('REPLAY_PAGE_BUDGET');
  if(seen.has(cursor.primary.key))throw Error('CYCLE');seen.add(cursor.primary.key);
  let body=load(cursor.primary.key),kind='pages',ptr=cursor.primary;
  if(body==null){body=load(cursor.backup.key);ptr=cursor.backup;kind='page-backups';}
  if(body==null)throw Error('MISSING_BOTH_PAGE_COPIES');
  const v=verifyBytes(id,kind,ptr,body);
  if(v.kind!=='page'||v.through!==cursor.through||!Array.isArray(v.records)||
  v.records.length<1||v.records.length>TAIL_LIMIT)throw Error('BAD_PAGE_BODY');
  const start=v.through-v.records.length+1;
  v.records.forEach((r,i)=>{if(r.kind!=='delta'||r.seq!==start+i||r.runId!==id)throw Error('GAP_IN_PAGE')});
  const prevThrough=v.prev?.through??0;
  if(prevThrough!==start-1)throw Error('BROKEN_PAGE_LINK');
  pages.push(v);cursor=v.prev;
 }
 pages.reverse();return pages;
}
export function replay(h,id,load,maxPages=128){
 const pages=readPages(h,id,load,maxPages),records=pages.flatMap(p=>p.records);
 for(const e of h.tail){
  const body=load(e.key);if(body==null)throw Error('MISSING_ACTIVE_DELTA');
  const r=verifyBytes(id,'deltas',e,body);
  if(r.kind!=='delta'||r.seq!==e.seq||r.receipt!==e.receipt)throw Error('BAD_ACTIVE_DELTA');
  records.push(r);
 }
 if(records.length!==h.generation)throw Error('REPLAY_GAP');
 records.forEach((r,i)=>{if(r.seq!==i+1)throw Error('SEQ_MISMATCH')});
 return records;
}
export function dryGcFrozen(h,id,load,listed,nowMs,graceMs=GRACE_MS){
 validateHead(h,id);
 if(h.mode!=='maintenance'||graceMs<GRACE_MS||!Number.isFinite(nowMs)||!Array.isArray(listed)||listed.length>2000)throw Error('GC_NOT_FENCED');
 const pages=readPages(h,id,load,128),keys=new Set(h.tail.map(x=>x.key));
 for(const p of pages){
  keys.add(makeObject(id,'pages',p).key);keys.add(makeObject(id,'page-backups',p).key);
 }
 const prefix=namespace(id),seen=new Set();let live=0,hold=0,eligible=0;
 for(const o of listed){
  const key=o?.Key;
  if(typeof key!=='string'||!key.startsWith(prefix)||seen.has(key)||
  !/^.+\/(?:deltas|pages|page-backups)\/[a-f0-9]{64}\.json$/.test(key))throw Error('UNSAFE_LISTING');
  seen.add(key);
  const stamp=new Date(o.LastModified).getTime();
  if(!Number.isFinite(stamp)||stamp>nowMs)throw Error('INVALID_DATE');
  if(keys.has(key))live++;
  else if(nowMs-stamp<graceMs)hold++;
  else eligible++;
 }
 return{live,hold,eligible,deleteOperations:0,objects:listed.length,maintenanceEpoch:h.epoch};
}
