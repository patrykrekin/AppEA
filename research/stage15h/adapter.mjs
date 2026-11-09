// Pure offline adapter. No scraper hook, persistence or network calls.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {advance,buildQuotes,identity,start,stats} from '../stage15g/ledger-v2.mjs';
import {aktualizujPoziomyD,policzInwestycje,EMA_WERSJA} from '../../scraper/lib/okazje.mjs';
import {onGrid} from '../../scraper/lib/grid.mjs';
const clone=x=>structuredClone(x);
const time=x=>Number.isSafeInteger(x)&&x>0;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function canonical(x){
  if(Array.isArray(x))return x.map(canonical);
  if(obj(x))return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
  return x;
}
export const fingerprint=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const fail=code=>{throw Error(code);};

/** Input must be captured around the actual read/calculation boundary.
 * fixture mode is permanently separated from captured mode in output state.
 * completedAt is the original computation completion time, not retry time.
 */
export function adaptFrame(previous,frame,{legacy=null}={}){
  if(frame?.schema!==1||typeof frame.cycleId!=='string'||!frame.cycleId||!time(frame.cycleAt)||!time(frame.completedAt)||frame.completedAt<frame.cycleAt||!['fixture','captured'].includes(frame.mode))fail('EXPLICIT_FRAME_REQUIRED');
  if(previous&&(previous.adapterVersion!==1||previous.mode!==frame.mode))fail('ADAPTER_MIGRATION_REQUIRED');
  if(previous&&legacy)fail('LEGACY_ALREADY_ASSIGNED');
  const digest=fingerprint(frame);
  if(previous?.lastFrame){
    const last=previous.lastFrame;
    if(digest===last.digest)return clone(previous);
    if(frame.cycleId===last.cycleId)fail('FRAME_ID_REUSED');
    if(frame.completedAt===last.completedAt)fail('FRAME_TIME_COLLISION');
    if(frame.cycleAt<=last.cycleAt||frame.completedAt<last.completedAt)fail('BACKWARDS_FRAME');
  }
  // All mutations below affect a private copy; either both markets succeed or neither is returned.
  const next=previous?clone(previous):{adapterVersion:1,mode:frame.mode,states:{},receipts:{},modelEvidence:{},lastFrame:null};
  const diagnostics={};
  for(const side of ['ps','pc']){
    const read=frame.reads?.[side];
    if(!obj(read)||read.platform!==side||!time(read.observedAt)||read.observedAt<frame.cycleAt||read.observedAt>frame.completedAt||!Number.isSafeInteger(read.sequence)||read.sequence<=0||!obj(read.bands))fail('INVALID_READ_RECEIPT_'+side);
    const oldReceipt=next.receipts[side];
    if(oldReceipt&&(read.sequence<=oldReceipt.sequence||read.observedAt<=oldReceipt.observedAt))fail('READ_RECEIPT_REUSED_'+side);
    for(const name of ['preFast','preSlow','persistenceAfter','levelsAfter'])if(!obj(frame[name]?.[side]))fail('MISSING_PHASE_'+name+'_'+side);
    if(!Array.isArray(frame.decisions?.[side]))fail('MISSING_DECISIONS_'+side);
    for(const map of [frame.preFast[side],frame.preSlow[side]])for(const v of Object.values(map)){
      if(!obj(v)||!time(v.t)||v.t>=frame.cycleAt)fail('NOT_PRE_UPDATE_MODEL_'+side);
    }
    const labels=new Set();
    for(const [rating,cards] of Object.entries(read.bands)){
      if(!Array.isArray(cards))fail('INVALID_BANDS_'+side);
      for(const c of cards){
        try{identity(side,Number(rating),c?.id,c?.name);}catch{fail('INVALID_CARD_'+side);}
        const label=c.name+' '+Number(rating);
        if(!onGrid(c.price)||labels.has(label))fail('AMBIGUOUS_OR_INVALID_BAND_'+side);
        labels.add(label);
      }
    }
    const expectedDecisions=policzInwestycje(clone(read.bands),clone(frame.preSlow[side]),clone(frame.persistenceAfter[side]),frame.cycleAt);
    if(!isDeepStrictEqual(expectedDecisions,frame.decisions[side]))fail('DECISION_PARITY_'+side);
    const expectedLevels=aktualizujPoziomyD(clone(frame.preSlow[side]),clone(frame.preFast[side]),clone(read.bands),frame.cycleAt);
    if(!isDeepStrictEqual(expectedLevels,frame.levelsAfter[side]))fail('POST_MODEL_PARITY_'+side);
    const batch=buildQuotes({platform:side,at:frame.completedAt,bands:{platform:side,observedAt:read.observedAt,byRating:read.bands}});
    if(batch.rejected.length)fail('QUOTES_REJECTED_'+side);
    const levels={};const retainedModelsNotRestamped=Object.values(frame.levelsAfter[side]).filter(p=>p.t<frame.cycleAt).length;
    for(const q of Object.values(batch.quotes)){
      const p=frame.levelsAfter[side][q.name+' '+q.rating];
      if(!p||p.t!==frame.cycleAt)continue;
      if(p.v!==EMA_WERSJA||String(p.id)!==q.id)fail('POST_MODEL_IDENTITY_'+side);
      levels[identity(side,q.rating,q.id,q.name)]={platform:side,rating:q.rating,id:q.id,name:q.name,v:p.v,p:p.p,
        t:frame.completedAt,modelAt:p.t,observedAt:read.observedAt,
        evidenceKind:'verified-current-frame-derived-model',cycleId:frame.cycleId,readSequence:read.sequence};
    }
    const previousState=next.states[side]??start(side,legacy?.[side]??null);
    if(!next.states[side]&&legacy?.[side]&&Number.isFinite(legacy[side].at)&&legacy[side].at>frame.cycleAt)fail('FUTURE_LEGACY_'+side);
    next.states[side]=advance(previousState,{platform:side,at:frame.completedAt,candidates:clone(frame.decisions[side]),batch,levels});
    stats(next.states[side]); // Reject inconsistent measurement state before returning either platform.
    next.receipts[side]={sequence:read.sequence,observedAt:read.observedAt,bandsDigest:fingerprint(read.bands)};
    next.modelEvidence[side]=levels;
    diagnostics[side]={quotes:Object.keys(batch.quotes).length,decisions:expectedDecisions.length,
      derivedLevels:Object.keys(levels).length,retainedModelsNotRestamped,decisionParity:true,postModelParity:true};
  }
  next.lastFrame={cycleId:frame.cycleId,cycleAt:frame.cycleAt,completedAt:frame.completedAt,digest};
  next.diagnostics=diagnostics;
  next.statistics=Object.fromEntries(['ps','pc'].map(side=>[side,stats(next.states[side])]));
  return next;
}
