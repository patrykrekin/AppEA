import assert from 'node:assert/strict';
import {init,delta,makeObject,append,freeze,buildPage,rotate,release,receiptStatus,readPages,replay,dryGcFrozen,
validateHead,verifyBytes,hash,serialize,GRACE_MS,TAIL_LIMIT,RECEIPT_LIMIT} from './core.mjs';

const id='stage15a-12345678',objects=new Map();
const write=o=>{const prior=objects.get(o.key);if(prior&&prior!==o.body)throw Error('HASH_COLLISION');objects.set(o.key,o.body)};
const load=k=>objects.get(k)??null;
let count=0;function check(label,f){f();count++;console.log('PASS '+count+' '+label)}
check('genesis',()=>assert.equal(init(id).generation,0));
check('invalid other run rejected',()=>assert.throws(()=>init('stage15a-../../evil')));
let head=init(id),beforeLast=null,rotations=0;
for(let i=1;i<=1024;i++){
 if(head.tail.length===TAIL_LIMIT){
  const locked=freeze(head,id),page=buildPage(locked,id,locked.tail.map(x=>load(x.key)));
  write(page.primary);write(page.backup);
  head=release(rotate(locked,id,page),id);rotations++;
 }
 if(i===1024)beforeLast=head;
 const spec=delta(id,i,'receipt-'+i,i%2?'ps':'pc');write(spec);
 head=append(head,id,spec,'receipt-'+i);
}
const all=replay(head,id,load);
check('1024 records restored in order',()=>assert.deepEqual(all.map(x=>x.seq),Array.from({length:1024},(_,i)=>i+1)));
check('every record has correct receipt',()=>assert.equal(all[999].receipt,'receipt-1000'));
check('HEAD under byte cap',()=>assert.ok(Buffer.byteLength(serialize(head))<8192));
check('63 pages created',()=>assert.equal(rotations,63));
check('16 live tail entries',()=>assert.equal(head.tail.length,16));
check('63 archived pages reachable',()=>assert.equal(readPages(head,id,load).length,63));
check('receipt cache at most 64',()=>assert.equal(head.receipts.length,RECEIPT_LIMIT));
check('recent receipt recognized',()=>assert.equal(receiptStatus(head,id,'receipt-1024'),'COMMITTED'));
check('old receipt ambiguous fail closed',()=>assert.equal(receiptStatus(head,id,'receipt-1'),'AMBIGUOUS_FAIL_CLOSED'));
check('too many tail entries demand rotation',()=>assert.throws(()=>append(head,id,delta(id,1025,'x','ps'),'x'),/ROTATION_REQUIRED/));
const locked=freeze(head,id);
check('fenced mode refuses active writer',()=>assert.throws(()=>append(locked,id,delta(id,1025,'x','ps'),'x'),/FENCED_MAINTENANCE/));
check('epoch advances at lock',()=>assert.equal(locked.epoch,head.epoch+1));
check('lock changes CAS ETag',()=>assert.notEqual(hash(serialize(head)),hash(serialize(locked))));
const staleTag=hash(serialize(beforeLast));let committed=locked,currentTag=hash(serialize(locked));
const cas=(etag,value)=>{if(etag!==currentTag)return 412;committed=value;currentTag=hash(serialize(value));return 200};
check('stale pre-lock writer gets 412',()=>assert.equal(cas(staleTag,append(beforeLast,id,delta(id,1024,'late','ps'),'late')),412));
check('stale writer does not overwrite lock',()=>assert.equal(committed.mode,'maintenance'));
check('epoch advances at release',()=>assert.equal(release(locked,id).epoch,locked.epoch+1));
check('no ETag ABA after release',()=>assert.notEqual(hash(serialize(release(locked,id))),staleTag));
check('fresh writer can resume after rotate/unlock',()=>{
 const page=buildPage(locked,id,locked.tail.map(x=>load(x.key)));
 const active=release(rotate(locked,id,page),id);
 assert.equal(append(active,id,delta(id,1025,'new','pc'),'new').generation,1025);
});
const pagePtr=head.page,pBody=load(pagePtr.primary.key),bBody=load(pagePtr.backup.key);
objects.delete(pagePtr.primary.key);
check('backup restores missing primary',()=>assert.equal(replay(head,id,load).length,1024));
objects.delete(pagePtr.backup.key);
check('missing primary and backup fails closed',()=>assert.throws(()=>replay(head,id,load),/MISSING_BOTH_PAGE_COPIES/));
objects.set(pagePtr.primary.key,pBody);objects.set(pagePtr.backup.key,bBody);
check('corrupt hash refuses silently changing history',()=>{
 objects.set(pagePtr.primary.key,'CORRUPT');
 assert.throws(()=>replay(head,id,load),/HASH_MISMATCH/);
 objects.set(pagePtr.primary.key,pBody);
});
check('history recovered intact after repair',()=>assert.equal(replay(head,id,load).length,1024));
const bogus=makeObject(id,'pages',{schema:15,synthetic:true,kind:'page',runId:id,through:5,prev:null,records:[]});
check('pointer namespace enforced',()=>assert.throws(()=>verifyBytes(id,'page-backups',bogus,bogus.body),/INVALID_POINTER/));
const now=Date.UTC(2026,10,8,17),listing=[...objects.keys()].map(Key=>({Key,LastModified:new Date(now-1000)}));
const gc=dryGcFrozen(locked,id,load,listing,now);
check('GC traverses all linked page+backup references',()=>assert.equal(gc.live,rotations*2+TAIL_LIMIT));
check('young old deltas protected by grace',()=>assert.equal(gc.hold,1024-TAIL_LIMIT));
check('fresh deltas not eligible',()=>assert.equal(gc.eligible,0));
check('GC does zero deletes',()=>assert.equal(gc.deleteOperations,0));
const old=listing.map(x=>({...x,LastModified:new Date(now-GRACE_MS-10)})),older=dryGcFrozen(locked,id,load,old,now);
check('aged archived deltas are candidates only',()=>assert.equal(older.eligible,1024-TAIL_LIMIT));
check('old reachable pages+backups still protected',()=>assert.equal(older.live,rotations*2+TAIL_LIMIT));
check('unlocked GC prohibited',()=>assert.throws(()=>dryGcFrozen(head,id,load,old,now),/GC_NOT_FENCED/));
check('72h lower bound enforced',()=>assert.throws(()=>dryGcFrozen(locked,id,load,old,now,1000),/GC_NOT_FENCED/));
check('unknown key refused',()=>assert.throws(()=>dryGcFrozen(locked,id,load,[{Key:'other',LastModified:new Date(now)}],now),/UNSAFE_LISTING/));
check('duplicates refused',()=>assert.throws(()=>dryGcFrozen(locked,id,load,[listing[0],listing[0]],now),/UNSAFE_LISTING/));
check('future timestamps refused',()=>assert.throws(()=>dryGcFrozen(locked,id,load,[{...listing[0],LastModified:new Date(now+1)}],now),/INVALID_DATE/));
check('GC aborts if root copies absent',()=>{
 objects.delete(pagePtr.primary.key);objects.delete(pagePtr.backup.key);
 assert.throws(()=>dryGcFrozen(locked,id,load,listing,now),/MISSING_BOTH_PAGE_COPIES/);
 objects.set(pagePtr.primary.key,pBody);objects.set(pagePtr.backup.key,bBody);
});
const result={node:process.version,tests:count,pass:true,realR2:false,records:all.length,pages:rotations,
 activeTail:head.tail.length,headBytes:Buffer.byteLength(serialize(head)),
 totalPayloadBytes:[...objects.values()].reduce((sum,s)=>sum+Buffer.byteLength(s),0),
 dryRun:gc,agedDryRun:older};
console.log('STAGE15A_RESULT '+JSON.stringify(result));
