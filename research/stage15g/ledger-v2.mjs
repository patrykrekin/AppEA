// Experimental, pure module. No fetch, filesystem writes or production hook.
import {HORYZONT,LUKA,WYNIKI_LIMIT,MIN_PROB,SWIEZOSC,MIN_TRWALOSC_CELU,definicja} from '../../scraper/lib/rejestr.mjs';
import {EMA_WERSJA,MAX_PRZERWA_EMA_DOBOWA,MAX_ODSTEP_TRWALOSCI} from '../../scraper/lib/okazje.mjs';
import {onGrid,net} from '../../scraper/lib/grid.mjs';

export const CONTRACT=2;
export const signature=()=>definicja()+'-measurement2-g'+MAX_ODSTEP_TRWALOSCI;
const time=x=>Number.isSafeInteger(x)&&x>0;
const market=x=>x==='ps'||x==='pc';
const clone=x=>structuredClone(x);
export function identity(platform,rating,id,name){
  if(!market(platform)||!Number.isInteger(rating)||rating<1||rating>99||!/^\d+$/.test(String(id))||typeof name!=='string'||!name.trim())throw Error('INVALID_IDENTITY');
  return JSON.stringify([platform,rating,String(id),name.trim()]);
}
const fresh=(observedAt,at)=>time(observedAt)&&observedAt<=at&&at-observedAt<=SWIEZOSC;
export function median(values){
  const xs=values.filter(Number.isFinite).sort((a,b)=>a-b),k=xs.length>>1;
  return xs.length?(xs.length%2?xs[k]:(xs[k-1]+xs[k])/2):null;
}

/** Caller must supply actual observation time. Cached batches must retain it. */
export function buildQuotes({platform,at,bands=null,momentum=null}){
  if(!market(platform)||!time(at))throw Error('INVALID_BATCH');
  const quotes={},rejected=[],blocked=new Set();
  const put=(q,source)=>{
    let key;
    try{key=identity(q.platform,q.rating,q.id,q.name);}catch{rejected.push({source,reason:'identity-required'});return;}
    if(q.platform!==platform||!fresh(q.observedAt,at)||!onGrid(q.price)){
      rejected.push({source,reason:'platform-time-or-price',key});return;
    }
    if(blocked.has(key))return;
    const old=quotes[key];
    if(old?.source==='band'&&source==='momentum')return;
    if(old&&(old.price!==q.price||old.observedAt!==q.observedAt)){
      delete quotes[key];blocked.add(key);rejected.push({source,reason:'conflicting-identity',key});return;
    }
    quotes[key]={platform,rating:q.rating,id:String(q.id),name:q.name.trim(),price:q.price,observedAt:q.observedAt,source};
  };
  if(bands){
    if(bands.platform!==platform||!fresh(bands.observedAt,at))rejected.push({source:'band',reason:'platform-or-time'});
    else for(const [rating,cards] of Object.entries(bands.byRating??{})){
      if(!Array.isArray(cards)){rejected.push({source:'band',reason:'invalid-rating-list'});continue;}
      for(const c of cards)put({platform:bands.platform,rating:Number(rating),id:c?.id,name:c?.name,price:c?.price,observedAt:bands.observedAt},'band');
    }
  }
  if(momentum){
    if(momentum.platform!==platform)rejected.push({source:'momentum',reason:'platform-required'});
    else if(!Array.isArray(momentum.quotes))rejected.push({source:'momentum',reason:'explicit-rating-name-time-required'});
    else for(const q of momentum.quotes)put(q,'momentum');
  }
  return {contract:CONTRACT,platform,at,quotes,rejected};
}

export function start(platform,previous=null){
  if(!market(platform))throw Error('INVALID_PLATFORM');
  if(previous?.contract!==undefined){
    if(previous.contract!==CONTRACT||previous.platform!==platform||previous.def!==signature())throw Error('CONTRACT_MIGRATION_REQUIRED');
    return clone(previous);
  }
  return {contract:CONTRACT,platform,def:signature(),at:null,otwarte:{},wyniki:[],
    legacy:previous?{status:'frozen-not-reverified',original:clone(previous)}:null};
}
const reset=r=>{r.targetChain=[];r.targetCount=0;};
function checkState(s){
  if(!s.otwarte||!Array.isArray(s.wyniki))throw Error('INVALID_STATE');
  for(const [key,r] of Object.entries(s.otwarte)){
    if(key!==identity(s.platform,r.rating,r.id,r.name)||r.def!==s.def||r.contract!==CONTRACT||!time(r.od)||!time(s.at)||r.od>s.at||!onGrid(r.wejscie)||!onGrid(r.cel0)||r.cel0<=r.wejscie||!time(r.lastEvidenceAt)||r.lastEvidenceAt>s.at||!Number.isInteger(r.targetCount)||r.targetCount<0||!Array.isArray(r.targetChain)||r.targetChain.length>2||(r.targetCount===0&&r.targetChain.length!==0)||(r.targetCount>0&&!r.targetChain.length))throw Error('INVALID_OPEN_ROW');
    for(const q of r.targetChain)if(identity(q.platform,q.rating,q.id,q.name)!==key||!fresh(q.observedAt,q.processedAt)||q.processedAt>s.at||q.observedAt<r.od+60||q.observedAt>r.lastEvidenceAt||q.price<r.cel0)throw Error('INVALID_PENDING_EVIDENCE');
  }
  for(const r of s.wyniki){
    if(r.contract!==CONTRACT||r.def!==s.def||r.platform!==s.platform)throw Error('MIXED_RESULTS');
    if(r.key!==identity(r.platform,r.rating,r.id,r.name)||!time(r.od)||!time(r.zamkniete)||r.zamkniete<r.od||!onGrid(r.wejscie)||!onGrid(r.cel)||r.cel<=r.wejscie)throw Error('INVALID_CLOSED_ROW');
  }
}
function close(r,at){
  const verdict=r.osiagnietyAt?'cel':r.poziomMin<=r.wejscie?'poziom':at-r.ostatnio>LUKA?'urwane':r.min<r.wejscie?'glebiej':'plasko';
  return {contract:CONTRACT,platform:r.platform,def:r.def,key:r.key,id:r.id,rating:r.rating,name:r.name,
    wejscie:r.wejscie,sufit:r.sufit,inReachAtSignal:r.inReachAtSignal,purchaseConfirmed:false,
    cel:r.cel0,poziom:r.poziom0,poziomMin:r.poziomMin,min:r.min,max:r.max,
    od:r.od,zamkniete:at,werdykt:verdict,doCelu:r.osiagnietyAt?(r.osiagnietyAt-r.od)/60:null,
    targetFirstObservedAt:r.osiagnietyAt??null,confirmationObservedAt:r.confirmationObservedAt??null,
    evidence:r.osiagnietyAt?clone(r.targetChain):[],lastObservedAt:r.ostatnio,
    coverage:{missingCycles:r.missingCycles,duplicateCycles:r.duplicateCycles,continuityBreaks:r.continuityBreaks}};
}

/** Batch is per platform; no legacy ID-only price aliases are accepted. */
export function advance(previous,{platform,at,candidates=[],batch,levels={}}){
  if(!time(at)||batch?.contract!==CONTRACT||batch.platform!==platform||batch.at!==at)throw Error('INVALID_BATCH');
  const s=start(platform,previous);checkState(s);
  if(s.at!==null&&at<s.at)throw Error('BACKWARDS_TIME');
  if(s.at===at)return s; // restart/retry of an already processed batch is idempotent
  const rejected=[...batch.rejected];
  const getQuote=(key)=>{
    const q=batch.quotes?.[key];
    if(!q)return null;
    try{if(identity(q.platform,q.rating,q.id,q.name)!==key||q.platform!==platform||!fresh(q.observedAt,at)||!onGrid(q.price)||!['band','momentum'].includes(q.source))return null;}catch{return null;}
    return q;
  };
  for(const w of candidates){
    let key;try{key=identity(platform,w.rating,w.id,w.nazwa);}catch{rejected.push({source:'candidate',reason:'identity-required'});continue;}
    if(s.otwarte[key])continue;
    const q=getQuote(key);
    if(w.klucz!==w.nazwa+' '+w.rating||!onGrid(w.cena)||!onGrid(w.cel)||w.cel<=w.cena||!onGrid(w.kupnoDo)||net(w.kupnoDo,w.cel)<=0||!Number.isFinite(w.poziom)||w.poziom<=0||!q||q.price!==w.cena){
      rejected.push({source:'candidate',reason:'unsupported-candidate',key});continue;
    }
    s.otwarte[key]={contract:CONTRACT,platform,def:s.def,key,id:String(w.id),rating:w.rating,name:w.nazwa,
      wejscie:w.cena,sufit:w.kupnoDo,inReachAtSignal:w.cena<=w.kupnoDo,purchaseConfirmed:false,
      cel0:w.cel,poziom0:w.poziom,poziom:w.poziom,poziomMin:w.poziom,levelObservedAt:null,
      od:at,ostatnio:q.observedAt,lastEvidenceAt:q.observedAt,lastEvidencePrice:q.price,
      min:w.cena,max:w.cena,targetChain:[],targetCount:0,osiagnietyAt:null,
      missingCycles:0,duplicateCycles:0,continuityBreaks:0};
  }
  for(const [key,r] of Object.entries(s.otwarte)){
    const q=getQuote(key);
    const alreadyLost=at-r.ostatnio>LUKA;
    if(!alreadyLost){
      if(!q){r.missingCycles++;reset(r);}
      else if(q.observedAt===r.lastEvidenceAt&&q.price!==r.lastEvidencePrice){
        reset(r);rejected.push({source:q.source,reason:'same-time-conflicting-price',key});
      }else if(q.observedAt<r.lastEvidenceAt){
        reset(r);rejected.push({source:q.source,reason:'out-of-order',key});
      }else if(q.observedAt===r.lastEvidenceAt){
        r.duplicateCycles++;
      }else if(q.observedAt>r.lastEvidenceAt&&q.observedAt>=r.od&&q.observedAt<=r.od+HORYZONT){
        r.lastEvidenceAt=q.observedAt;r.lastEvidencePrice=q.price;r.ostatnio=q.observedAt;
        r.min=Math.min(r.min,q.price);r.max=Math.max(r.max,q.price);
        if(q.price<r.cel0||q.observedAt-r.od<60)reset(r);
        else{
          const last=r.targetChain.at(-1);
          if(last&&q.observedAt-last.observedAt>MAX_ODSTEP_TRWALOSCI){r.continuityBreaks++;reset(r);}
          const evidence={platform,rating:r.rating,id:r.id,name:r.name,observedAt:q.observedAt,processedAt:at,price:q.price,source:q.source};
          if(!r.targetChain.length)r.targetChain=[evidence];
          else r.targetChain=[r.targetChain[0],evidence];
          r.targetCount++;
          if(r.targetCount>=MIN_TRWALOSC_CELU&&q.observedAt-r.targetChain[0].observedAt>=60){
            r.osiagnietyAt=r.targetChain[0].observedAt;r.confirmationObservedAt=q.observedAt;
          }
        }
      }
      const p=levels[key];
      // A level must prove its own identity/time, even if supplied under an exact key.
      if(p){
        let matching=false;try{matching=identity(p.platform,p.rating,p.id,p.name)===key;}catch{}
        if(matching&&p.v===EMA_WERSJA&&Number.isFinite(p.p)&&p.p>0&&time(p.t)&&p.t>=r.od&&p.t<=Math.min(at,r.od+HORYZONT)&&at-p.t<=MAX_PRZERWA_EMA_DOBOWA&&(r.levelObservedAt===null||p.t>r.levelObservedAt)){
          r.poziom=p.p;r.poziomMin=Math.min(r.poziomMin,p.p);r.levelObservedAt=p.t;
        }else rejected.push({source:'ema',reason:'identity-time-or-version',key});
      }
    }
    if(r.osiagnietyAt||at-r.od>=HORYZONT||at-r.ostatnio>LUKA){s.wyniki.push(close(r,at));delete s.otwarte[key];}
  }
  s.at=at;s.wyniki=s.wyniki.slice(-WYNIKI_LIMIT);s.lastBatchDiagnostics=rejected;
  return s;
}

export function stats(state){
  if(state?.contract!==CONTRACT||state.def!==signature()||!market(state.platform))throw Error('INVALID_V2_STATE');
  checkState(state);
  const counts={cel:0,poziom:0,glebiej:0,plasko:0,urwane:0};
  for(const r of state.wyniki){
    if(!(r.werdykt in counts))throw Error('INVALID_VERDICT');
    if(r.werdykt==='cel'){
      const [a,b]=r.evidence??[];
      if(!a||!b||identity(a.platform,a.rating,a.id,a.name)!==r.key||identity(b.platform,b.rating,b.id,b.name)!==r.key||!fresh(a.observedAt,a.processedAt)||!fresh(b.observedAt,b.processedAt)||a.observedAt<r.od+60||b.observedAt-a.observedAt<60||b.observedAt-a.observedAt>MAX_ODSTEP_TRWALOSCI||b.observedAt>r.od+HORYZONT||a.price<r.cel||b.price<r.cel||r.doCelu!==(a.observedAt-r.od)/60)throw Error('INVALID_TARGET_EVIDENCE');
    }
    counts[r.werdykt]++;
  }
  const n=state.wyniki.length,known=n-counts.urwane;
  return {contract:CONTRACT,def:state.def,platform:state.platform,metric:'conditional-candidate-quoted-target-contact',
    closed:n,open:Object.keys(state.otwarte).length,known,...counts,conditionalPct:known?100*counts.cel/known:null,
    scenarioLowerPct:n?100*counts.cel/n:null,scenarioUpperPct:n?100*(counts.cel+counts.urwane)/n:null,
    medianMinutes:median(state.wyniki.filter(r=>r.werdykt==='cel').map(r=>r.doCelu)),
    ready:known>=MIN_PROB,minimumKnown:MIN_PROB,legacyExcluded:!!state.legacy,executionsMeasured:false,
    rowsWithMissingCycles:state.wyniki.filter(r=>r.coverage?.missingCycles>0).length,
    rowsWithLateLastPrice:state.wyniki.filter(r=>r.zamkniete-r.lastObservedAt>LUKA).length};
}
