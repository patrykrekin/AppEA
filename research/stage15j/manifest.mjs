import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sha256,readPrevious} from './state.mjs';
const [kind,n]=process.argv.slice(2),cycle=Number(n),dir=process.env.STAGE15J_DIR;
assert.ok(['input','output'].includes(kind)&&(cycle===1||cycle===2));
const files={};
for(const name of ['data.json','historia.json','historia-kart.json']){
 const raw=readFileSync(path.join(path.dirname(process.env.FUT_DATA),name));files[name]={bytes:raw.length,sha256:sha256(raw)};
}
if(kind==='input'&&cycle===2){
 const parent=JSON.parse(readFileSync(path.join(process.env.STAGE15J_ROOT,'cycle1/output-manifest.json')));
 assert.deepEqual(files,parent.files,'second input must be first isolated output');
}
const previous=kind==='input'?readPrevious(process.env.STAGE15J_STATE,cycle):null;
const manifest={cycle,kind:kind==='input'?(cycle===1?'pinned-main':'previous-verified-output'):'isolated-output',
 sourceCommit:process.env.STAGE15J_SOURCE,codeCommit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,
 expectedPreviousStateDigest:previous?.digest??null,files};
writeFileSync(path.join(dir,kind==='input'?'input-manifest.json':'output-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
if(kind==='output')copyFileSync(process.env.FUT_DATA,path.join(dir,'data.json'));
