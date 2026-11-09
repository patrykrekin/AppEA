import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const [captureFile,outFile]=process.argv.slice(2),capture=JSON.parse(readFileSync(captureFile));
const startMs=Date.now(),untilMs=capture.completedAtMs+60000,waitMs=Math.max(0,untilMs-startMs);
assert.ok(waitMs<=60000,'bounded wait');
await new Promise(resolve=>setTimeout(resolve,waitMs));
assert.ok(Date.now()>=untilMs);
writeFileSync(outFile,JSON.stringify({minimumGapMs:60000,firstCompletionMs:capture.completedAtMs,waitStartedMs:startMs,waitRequestedMs:waitMs,waitFinishedMs:Date.now()},null,2)+'\n');
console.log('Bounded inter-cycle wait '+waitMs+' ms');
