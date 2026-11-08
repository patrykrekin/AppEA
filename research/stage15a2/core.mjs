/** AppEA Stage 15A.2 — deterministic synthetic archive and in-HEAD reader pins.
 * Research only. No I/O, no real FUT data, and NO DeleteObject.
 */
import {createHash} from 'node:crypto';
export const SHA=s=>createHash('sha256').update(s).digest('hex');
export const j=x=>JSON.stringify(x)+'\n';
export const PAGES_PER_GROUP=64, ROWS_PER_PAGE=16, MAX_GROUPS=128,MAX_B=65536,GC_GRACE_MS=72*3600_000;
export const runPrefix=id=>{
 if(!/^stage15a2-[0-9]{8,20}$/.test(id??''))throw Error('BAD_RUN_ID');
 return 'appea-research/stage15a2/'+id+'/';
};
export function object(id,kind,value) {
 if(!['pages','page-mirrors','groups','group-mirrors','roots'].includes(kind))throw Error('INVALID_OBJECT_KIND');
 const body=j(value),sha=SHA(body),key=runPrefix(id)+kind+'/'+sha+'.json';
 if(Buffer.byteLength(body)>MAX_B)throw Error('OBJECT_TOO_LARGE');
 return{kind,key,sha,body};
}
export function ptr(id,kind,reference){
 const stem=runPrefix(id)+kind+'/';
 if(!reference||typeof reference.key!=='string'||typeof reference.sha!=='string'||
 !/^[0-9a-f]{64}$/.test(reference.sha)||reference.key!==stem+reference.sha+'.json')throw Error('INVALID_POINTER_'+kind);
 return reference;
}
export function load(id,kind,reference,read){
 ptr(id,kind,reference);
 const bytes=read(reference.key);
 if(bytes==null)return null;
 if(typeof bytes!=='string'||SHA(bytes)!==reference.sha||Buffer.byteLength(bytes)>MAX_B)throw Error('HASH_MISMATCH_'+kind);
 const v=JSON.parse(bytes);
 if(v?.schema!==152||v.synthetic!==true||v.runId!==id)throw Error('INVALID_PAYLOAD_'+kind);
 return v;
}
function dual(id,kind,mirrorKind,value,store) {
 const a=object(id,kind,value),b=object(id,mirrorKind,value);
 if(a.sha!==b.sha||a.key===b.key)throw Error('MIRROR_MISMATCH');
 store.set(a.key,a.body);store.set(b.key,b.body);
 return{primary:{key:a.key,sha:a.sha},mirror:{key:b.key,sha:b.sha}};
}
export function generate(id,records=16384){
 const prefix=runPrefix(id);
 if(!Number.isSafeInteger(records)||records<1||records%ROWS_PER_PAGE!==0||records>MAX_GROUPS*PAGES_PER_GROUP*ROWS_PER_PAGE)
 throw Error('INVALID_GENERATOR_COUNT');
 const storage=new Map(),groups=[],totalPages=records/ROWS_PER_PAGE;
 for(let g=0;g<Math.ceil(totalPages/PAGES_PER_GROUP);g++){
  const pages=[];
  for(let p=g*PAGES_PER_GROUP;p<Math.min(totalPages,(g+1)*PAGES_PER_GROUP);p++){
   const first=p*ROWS_PER_PAGE+1;
   const rows=Array.from({length:ROWS_PER_PAGE},(_,k)=>({seq:first+k,at:(first+k)*120,side:(first+k)%2?'ps':'pc',price:1200,rating:85,synthetic:true}));
   const v={schema:152,synthetic:true,kind:'page',runId:id,start:first,end:first+ROWS_PER_PAGE-1,rows};
   pages.push({start:v.start,end:v.end,...dual(id,'pages','page-mirrors',v,storage)});
  }
  const gVal={schema:152,synthetic:true,kind:'group',runId:id,index:g,first:pages[0].start,last:pages.at(-1).end,pages};
  const copies=dual(id,'groups','group-mirrors',gVal,storage);
  groups.push({index:g,first:gVal.first,last:gVal.last,...copies});
 }
 const rootVal={schema:152,synthetic:true,kind:'root',runId:id,total:records,groups};
 const root=object(id,'roots',rootVal);storage.set(root.key,root.body);
 return{root:{key:root.key,sha:root.sha},storage,metadata:{records,pages:totalPages,groups:groups.length,objects:storage.size,
   bytes:[...storage.values()].reduce((a,v)=>a+Buffer.byteLength(v),0),prefix}};
}
export function replay(id,root,read,{pageLimit=4096}={}){
 if(!Number.isSafeInteger(pageLimit)||pageLimit<1)throw Error('INVALID_READ_BUDGET');
 const r=load(id,'roots',root,read);
 if(!r||r.kind!=='root'||!Number.isSafeInteger(r.total)||!Array.isArray(r.groups)||
 r.groups.length<1||r.groups.length>MAX_GROUPS)throw Error('CORRUPT_ROOT');
 const rows=[],refs=new Set([root.key]),pages=[],seen=new Set();
 for(let gi=0;gi<r.groups.length;gi++){
  const gRef=r.groups[gi];
  if(gRef.index!==gi)throw Error('GROUP_ORDER');
  refs.add(ptr(id,'groups',gRef.primary).key);refs.add(ptr(id,'group-mirrors',gRef.mirror).key);
  if(gRef.primary.sha!==gRef.mirror.sha)throw Error('GROUP_MIRROR_SHA');
  let g=load(id,'groups',gRef.primary,read);
  if(g==null)g=load(id,'group-mirrors',gRef.mirror,read);
  if(!g||g.kind!=='group'||g.index!==gi||g.first!==gRef.first||g.last!==gRef.last||
    !Array.isArray(g.pages)||g.pages.length<1||g.pages.length>PAGES_PER_GROUP)throw Error('INVALID_GROUP');
  for(let pi=0;pi<g.pages.length;pi++){
   if(pages.length>=pageLimit)throw Error('READ_PAGE_BUDGET');
   const pRef=g.pages[pi];
   refs.add(ptr(id,'pages',pRef.primary).key);refs.add(ptr(id,'page-mirrors',pRef.mirror).key);
   if(pRef.primary.sha!==pRef.mirror.sha||seen.has(pRef.primary.key))throw Error('PAGE_DUPLICATE_OR_BAD_MIRROR');
   seen.add(pRef.primary.key);
   let page=load(id,'pages',pRef.primary,read);
   if(page==null)page=load(id,'page-mirrors',pRef.mirror,read);
   if(!page||page.kind!=='page'||page.start!==pRef.start||page.end!==pRef.end||
       !Array.isArray(page.rows)||page.rows.length!==ROWS_PER_PAGE)throw Error('BAD_PAGE');
   if(page.start!==rows.length+1||page.end!==rows.length+ROWS_PER_PAGE)throw Error('GAP_OR_REORDER');
   for(let i=0;i<page.rows.length;i++){
    const item=page.rows[i];
    if(item.seq!==page.start+i||item.synthetic!==true||!['ps','pc'].includes(item.side))throw Error('ROW_MISMATCH');
    rows.push(item);
   }
   pages.push(pRef);
  }
 }
 if(rows.length!==r.total||pages.length>MAX_GROUPS*PAGES_PER_GROUP)throw Error('INCOMPLETE_ARCHIVE');
 return{records:rows,reachable:refs,groups:r.groups.length,pages:pages.length};
}
export function initHead(id,root){ptr(id,'roots',root);return{schema:152,runId:id,revision:0,epoch:0,mode:'active',root,readers:[]};}
export function validateHead(id,h){
 runPrefix(id);
 if(!h||h.schema!==152||h.runId!==id||!Number.isSafeInteger(h.revision)||h.revision<0||
 !Number.isSafeInteger(h.epoch)||h.epoch<0||!['active','maintenance'].includes(h.mode)||
 !Array.isArray(h.readers)||h.readers.length>16)throw Error('BAD_HEAD');
 ptr(id,'roots',h.root);
 const seen=new Set();
 for(const r of h.readers){
  if(!r||!/^[a-zA-Z0-9_-]{1,48}$/.test(r.id??'')||seen.has(r.id)||
  !Number.isSafeInteger(r.started)||!Number.isSafeInteger(r.expires)||r.expires<=r.started)throw Error('BAD_READER_PIN');
  seen.add(r.id);
 }
 if(Buffer.byteLength(j(h))>8192)throw Error('HEAD_SIZE');
 return h;
}
export function pin(id,h,reader,at,ttl=900000){
 validateHead(id,h);
 if(h.mode!=='active'||!Number.isSafeInteger(at)||at<=0||!Number.isSafeInteger(ttl)||ttl<60000||ttl>900000||
 !/^[a-zA-Z0-9_-]{1,48}$/.test(reader??'')||h.readers.some(x=>x.id===reader)||h.readers.length===16)
 throw Error('READER_PIN_REFUSED');
 return validateHead(id,{...h,revision:h.revision+1,readers:[...h.readers,{id:reader,started:at,expires:at+ttl}]});
}
export function unpin(id,h,reader){
 validateHead(id,h);
 if(!h.readers.some(x=>x.id===reader))throw Error('UNKNOWN_READER');
 return validateHead(id,{...h,revision:h.revision+1,readers:h.readers.filter(x=>x.id!==reader)});
}
export function freeze(id,h){
 validateHead(id,h);
 if(h.mode!=='active')throw Error('ALREADY_MAINTENANCE');
 return validateHead(id,{...h,mode:'maintenance',revision:h.revision+1,epoch:h.epoch+1});
}
export function release(id,h){
 validateHead(id,h);
 if(h.mode!=='maintenance'||h.readers.length)throw Error('ACTIVE_READERS_BLOCK_RELEASE');
 return validateHead(id,{...h,mode:'active',revision:h.revision+1,epoch:h.epoch+1});
}
export function planGC(id,h,read,objects,now,expectedETag,currentETag){
 validateHead(id,h);
 if(h.mode!=='maintenance'||h.readers.length||!expectedETag||currentETag!==expectedETag||
  !Number.isSafeInteger(now)||!Array.isArray(objects)||objects.length>20000)throw Error('GC_FENCING_FAIL_CLOSED');
 const r=replay(id,h.root,read),prefix=runPrefix(id),seen=new Set();
 let reachable=0,grace=0,eligible=0;
 for(const o of objects){
  if(!o||typeof o.Key!=='string'||!o.Key.startsWith(prefix)||seen.has(o.Key)||
  !/^.+\/(?:pages|page-mirrors|groups|group-mirrors|roots)\/[0-9a-f]{64}\.json$/.test(o.Key))
   throw Error('GC_UNSAFE_LISTING');
  seen.add(o.Key);
  const modified=new Date(o.LastModified).getTime();
  if(!Number.isFinite(modified)||modified>now)throw Error('BAD_TIMESTAMP');
  if(r.reachable.has(o.Key))reachable++;
  else if(now-modified<GC_GRACE_MS)grace++;
  else eligible++;
 }
 return{reachable,grace,eligible,deleteOperations:0,rootVerified:true,epoch:h.epoch,
  items:objects.length,recordsVerified:r.records.length};
}
