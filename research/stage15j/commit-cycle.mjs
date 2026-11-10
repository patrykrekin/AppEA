import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {commitState,sha256} from './state.mjs';
const [dir,stateFile,n]=process.argv.slice(2),cycle=Number(n);
const read=name=>JSON.parse(readFileSync(path.join(dir,name)));
const result=read('result.json'),capture=read('capture.json'),shadow=read('shadow.json');
assert.equal(result.status,'PASS');assert.equal(result.isolatedPublicationParity,true);assert.equal(capture.cycle,cycle);
// Bind the successful validation result to the still-identical old publication and pending shadow.
for(const name of ['data.json','frame.json','shadow.json','capture.json'])assert.equal(sha256(readFileSync(path.join(dir,name))),result.files[name].sha256);
const digest=commitState(stateFile,cycle,shadow,capture.previousStateDigest);
writeFileSync(path.join(dir,'state-commit.json'),JSON.stringify({cycle,previousDigest:capture.previousStateDigest,committedDigest:digest,validatedPublication:true},null,2)+'\n',{flag:'wx'});
console.log('Committed verified state cycle '+cycle+' '+digest);
