import assert from 'node:assert/strict';
import {SHA,encode,runPrefix,initialHead,validateHead,delta,verifyObject,append,snapshotPayload,
checkpointHead,readCheckpoint,restore,planGc,validateTrash,GRACE_MS} from './core.mjs';
const id='stage14-12345678',prefix=runPrefix(id);
const head0=initialHead(id),d1=delta(id,1,'r1','ps'),d2=delta(id,2,'r2','pc'),head1=append(head0,id,d1,'r1'),
head2=append(head1,id,d2,'r2');
const snap=snapshotPayload(head2,id,[d1.body,d2.body]),cp={...snap},p={
key:prefix+'checkpoints/'+SHA(encode(cp))+'.json',sha:SHA(encode(cp))},
b={key:prefix+'backups/'+SHA(encode(cp))+'.json',sha:SHA(encode(cp))},headC=checkpointHead(head2,id,cp,p,b);
const d3=delta(id,3,'r3','ps'),head3=append(headC,id,d3,'r3');
const t=Date.UTC(2026,10,8,18),orphan=delta(id,77,'orphan','pc');
let count=0;function check(label,fn){fn();console.log('PASS '+(++count)+' '+label)}
check('strict run namespace',()=>assert.throws(()=>runPrefix('stage13-12345678')));
check('init head safe',()=>assert.equal(validateHead(head0,id).generation,0));
check('delta sha matches',()=>assert.equal(SHA(d1.body),d1.sha));
check('append rev/generation',()=>assert.deepEqual([head2.revision,head2.generation],[2,2]));
check('old head untouched',()=>assert.equal(head0.generation,0));
check('checkpoint has two events',()=>assert.equal(snap.entries.length,2));
check('checkpoint immutable body',()=>assert.equal(SHA(encode(snap)),p.sha));
check('new checkpoint head same generation',()=>assert.deepEqual([headC.generation,headC.revision],[2,3]));
check('primary and backup separate keys',()=>assert.notEqual(p.key,b.key));
check('primary and backup same digest',()=>assert.equal(p.sha,b.sha));
check('checkpoint head tail cleared',()=>assert.equal(headC.tail.length,0));
check('checkpoint primary read',()=>assert.equal(readCheckpoint(id,headC,encode(snap),'checkpoints').length,2));
check('checkpoint backup read',()=>assert.equal(readCheckpoint(id,headC,encode(snap),'backups').length,2));
check('primary restoration without old deltas',()=>assert.equal(restore(id,headC,encode(snap),[]).length,2));
check('backup restoration without original primary',()=>assert.equal(restore(id,headC,encode(snap),[],'backups').length,2));
check('append from checkpoint gen3',()=>assert.equal(head3.generation,3));
check('restore from backup and new tail',()=>assert.deepEqual(restore(id,head3,encode(snap),[d3.body],'backups').map(x=>x.receipt),['r1','r2','r3']));
check('checkpoint corruption rejected',()=>assert.throws(()=>readCheckpoint(id,headC,encode({...snap,upto:5}),'checkpoints')));
check('tail corruption rejected',()=>assert.throws(()=>restore(id,head3,encode(snap),[d3.body+'!'])));
check('backup digest mismatch rejected',()=>assert.throws(()=>checkpointHead(head2,id,snap,p,{...b,sha:'0'.repeat(64)})));
check('missing tail rejected',()=>assert.throws(()=>restore(id,head3,encode(snap),[])));
check('chain sequence mismatch rejected',()=>assert.throws(()=>validateHead({...head3,generation:44},id)));
check('duplicate seq rejected',()=>assert.throws(()=>validateHead({...head3,tail:[...head3.tail,head3.tail[0]]},id)));
check('GC cannot run without checkpoint',()=>assert.throws(()=>planGc(id,head2,encode(snap),encode(snap),[],t)));
const list=[
{Key:d1.key,LastModified:new Date(t-1000)},
{Key:d2.key,LastModified:new Date(t-1000)},
{Key:d3.key,LastModified:new Date(t-1000)},
{Key:orphan.key,LastModified:new Date(t-1000)}
];
check('GC retains live tail',()=>assert.equal(planGc(id,head3,encode(snap),encode(snap),list,t).active,1));
check('GC retains young orphans',()=>assert.equal(planGc(id,head3,encode(snap),encode(snap),list,t).grace,3));
check('GC zero destructive operations',()=>assert.equal(planGc(id,head3,encode(snap),encode(snap),list,t).deleteOperations,0));
check('GC aged candidates dry run only',()=>assert.equal(planGc(id,head3,encode(snap),encode(snap),list.map(x=>({...x,LastModified:new Date(t-GRACE_MS-1000)})),t).eligible,3));
check('GC referenced delta kept even old',()=>assert.equal(planGc(id,head3,encode(snap),encode(snap),list.map(x=>({...x,LastModified:new Date(t-GRACE_MS-1000)})),t).active,1));
check('GC too-short grace rejected',()=>assert.throws(()=>planGc(id,head3,encode(snap),encode(snap),list,t,1000)));
check('GC unexpected key rejected',()=>assert.throws(()=>planGc(id,head3,encode(snap),encode(snap),[{Key:'outside',LastModified:new Date(t)}],t)));
check('GC duplicate listing rejected',()=>assert.throws(()=>planGc(id,head3,encode(snap),encode(snap),[list[0],list[0]],t)));
check('GC divergent backup rejected',()=>assert.throws(()=>planGc(id,head3,encode(snap),encode({...snap,entries:[]}),list,t)));
check('GC future modification rejected',()=>assert.throws(()=>planGc(id,head3,encode(snap),encode(snap),[{Key:orphan.key,LastModified:new Date(t+1)}],t)));
const trash={schema:14,synthetic:true,kind:'disposable',runId:id};
check('only exact scoped trash allowed',()=>assert.equal(validateTrash(id,prefix+'trash/disposable.json',trash),true));
check('cannot delete actual delta via trash guard',()=>assert.throws(()=>validateTrash(id,d1.key,trash)));
check('cannot delete HEAD via trash guard',()=>assert.throws(()=>validateTrash(id,prefix+'hot/head.json',trash)));
check('cannot delete other runs',()=>assert.throws(()=>validateTrash(id,'appea-research/stage14/stage14-98765432/trash/disposable.json',trash)));
check('cannot delete synthetic false marker',()=>assert.throws(()=>validateTrash(id,prefix+'trash/disposable.json',{...trash,synthetic:false})));
console.log('STAGE14_TESTS '+JSON.stringify({pass:true,count,realR2:false}));
