// Actual archived prices/models, explicitly simulated acquisition receipts.
// This is not a captured/live frame and cannot be mixed with captured-mode state.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {policzInwestycje,aktualizujPoziomyD} from '../../scraper/lib/okazje.mjs';
import {adaptFrame,fingerprint} from './adapter.mjs';
const raw=readFileSync(new URL('../stage15b/input/shadow-stage8.json',import.meta.url));
const sha=createHash('sha256').update(raw).digest('hex');
assert.equal(sha,'b5c5362f9be8da99d9f48de9e2f4aa89c7791f73853a22f4e3ae60a0e16f3b6e');
const s=JSON.parse(raw).migawka,t=s.czasOdczytuStart;
const frame={schema:1,cycleId:'archive-fixture-'+sha,mode:'fixture',cycleAt:t,completedAt:t+5,
  reads:{},preFast:{},preSlow:{},persistenceAfter:{},decisions:{},levelsAfter:{}};
for(const [i,side] of ['ps','pc'].entries()){
  const bands={},fast={},slow={},tr={};
  for(const r of s[side]){
    const key=r[17]+' '+r[0];(bands[r[0]]??=[]).push({id:r[1],name:r[17],price:r[2]});
    for(const [map,start] of [[fast,3],[slow,7]])if(r[start]!==null)map[key]={id:r[1],v:3,p:r[start],n:r[start+1],t:t-r[start+2],od:t-r[start+3]};
    if(r[11]!==null)tr[key]={id:r[1],n:r[11],od:t-r[12],t};
  }
  frame.reads[side]={platform:side,sequence:1,observedAt:t+1+i,bands};
  frame.preFast[side]=fast;frame.preSlow[side]=slow;frame.persistenceAfter[side]=tr;
  frame.decisions[side]=policzInwestycje(bands,slow,tr,t);
  frame.levelsAfter[side]=aktualizujPoziomyD(slow,fast,bands,t);
  const recorded=s[side].filter(r=>r[14]===1);
  assert.equal(frame.decisions[side].length,recorded.length);
  for(const x of frame.decisions[side]){
    const r=recorded.find(r=>r[17]+' '+r[0]===x.klucz&&r[1]===x.id);
    assert.ok(r);assert.equal(x.cena,r[2]);assert.equal(x.poziom,r[7]);assert.equal(x.cel,r[15]);assert.equal(x.kupnoDo,r[16]);
  }
}
const before=fingerprint(frame),state=adaptFrame(null,frame);
assert.equal(fingerprint(frame),before);
assert.equal(readFileSync(new URL('../stage15b/input/shadow-stage8.json',import.meta.url),'utf8'),raw.toString());
const result={sourceSha256:sha,originalAlgorithmCommit:s.definicje.commit,
  scope:'archived data reconstruction and parity check, not captured timing or efficacy proof',
  frameMode:state.mode,clockEvidence:'synthetic offsets: ps +1s, pc +2s, completed +5s',
  persistenceTimeLimitation:'source snapshot lacks last persistence timestamp; t assigned for reconstruction, unused by policzInwestycje',
  phaseContextLimitation:'pre-models reconstructed only for captured cohort; no claim of full original in-memory state',
  diagnostics:state.diagnostics,statistics:state.statistics,inputUnchanged:true,
  originalSixDecisionsMatch:true};
writeFileSync(new URL('./archived-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
