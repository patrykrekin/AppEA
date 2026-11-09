import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validate} from '../../scraper/validate.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const jobs=[
 ['v2',root,['research/stage15g/tests.mjs']],
 ['adapter',root,['research/stage15h/tests.mjs']],
 ['archive',root,['research/stage15h/archived-check.mjs']],
 ...['tkontrolki','trefresh','tstabilnosc','tliczby'].map(n=>[n,root+'/scraper',[n+'.mjs']])
];
const checks=[];
for(const [name,cwd,args] of jobs){
 const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',maxBuffer:2*1024*1024});
 checks.push({name,exitCode:r.status,pass:r.status===0});
 if(r.status!==0)throw Error(name+' FAILED\n'+r.stdout+'\n'+r.stderr);
}
const changes=execFileSync('git',['diff','--name-only','67837b4a0833ea7f224693cb8fa32cfc9723d06b','--','.',':(exclude)research'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.deepEqual(changes,['scraper/tkontrolki.mjs'],'only the aligned test file may differ outside research');
const sourceCommit='55d3b2e8ca0780448741bf0d5637796ae36c9d8c';
const raw=execFileSync('git',['show',sourceCommit+':data.json'],{cwd:root,maxBuffer:2*1024*1024});
const blob=createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${raw.length}\0`),raw])).digest('hex');
assert.equal(blob,'4745969730b15d6cebfc3664bf778818cad56a72');
const validated=validate(JSON.parse(raw));assert.equal(validated.err.length,0);
const result={checks,v2Cases:JSON.parse(readFileSync(new URL('../stage15g/tests-result.json',import.meta.url))).passed,
 adapterCases:JSON.parse(readFileSync(new URL('./adapter-tests-result.json',import.meta.url))).passed,
 alignedControlCases:17,pinnedDataValidation:{sourceCommit,errors:validated.err.length,warnings:validated.warn.length},
 outsideResearchChanges:changes,runtimeChanged:false,mainMerged:false,
 liveCaptureProof:false,remaining:'bounded isolated capture of actual in-memory read receipts; rollout plan for legacy open rows'};
writeFileSync(new URL('./qa.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
