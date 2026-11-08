/* Independent GitHub runner verifies a TEMPORARY off-R2 artifact, SYNTHETIC ONLY. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {namespace,verifyBytes} from './core.mjs';
const id=process.env.STAGE15A_RUN_ID,sha=process.env.STAGE15A_EXPECTED_SHA;
const root=namespace(id);
if(!/^[a-f0-9]{64}$/.test(sha||''))throw Error('EXPECTED_SHA_MISSING');
const path=process.env.RUNNER_TEMP+'/offsite/stage15a-page.json';
const body=readFileSync(path,'utf8');
const expected={sha,key:root+'page-backups/'+sha+'.json'};
const record=verifyBytes(id,'page-backups',expected,body);
assert.equal(record.kind,'page');
assert.equal(record.through,2);
assert.equal(record.prev,null);
assert.deepEqual(record.records.map(x=>x.seq),[1,2]);
assert.deepEqual(record.records.map(x=>x.receipt),['r1','r2']);
assert.ok(record.records.every(x=>x.synthetic===true));
console.log('STAGE15A_OFFSITE_RESTORE '+JSON.stringify({realR2:false,
 recoveredFrom:'github_actions_artifact_not_r2',independentRunner:true,
 temporaryRetentionDays:7,realR2SnapshotOriginallyRead:true,
 sha256Verified:true,synthetic:true,records:record.records.length,bytes:Buffer.byteLength(body)}));
