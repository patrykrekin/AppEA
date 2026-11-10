import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {policzInwestycje,PROG_INW,MIN_KROKOW,MIN_ODCZYTOW_D,MIN_WIEK_DOBOWEJ,MIN_TRWALOSC,MIN_TRWALOSC_SEK,INW_MARZA} from '../../scraper/lib/okazje.mjs';
const here=new URL('.',import.meta.url),zip=new URL('../stage15j/evidence.zip',import.meta.url);
const digest=x=>createHash('sha256').update(x).digest('hex');
assert.equal(digest(readFileSync(zip)),'fee03b10dc9a2f9670bfbcce00249076e9992287d7cd90de20401aba5e7ac2e3');
const dir=mkdtempSync(path.join(tmpdir(),'appea15k-'));
try{
execFileSync('python',['-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',zip.pathname,dir]);
const read=n=>JSON.parse(readFileSync(path.join(dir,n)));
const summary=read('series-result.json');
for(const [name,m] of Object.entries(summary.files)){const raw=readFileSync(path.join(dir,name));assert.equal(raw.length,m.bytes);assert.equal(digest(raw),m.sha256);}
// Independent piecewise arithmetic, compared with original output; no fitted thresholds.
const step=p=>p<=1000?50:p<=10000?100:p<=50000?250:p<=100000?500:1000;
const down=p=>Math.floor(p/step(p))*step(p);
const pct=x=>Math.round(x*1000)/10;
const rows=[];
for(const cycle of [1,2]){
 const f=read(`cycle${cycle}/frame.json`),shadow=read(`cycle${cycle}/shadow.json`);
 for(const side of ['ps','pc']){
  assert.deepEqual(policzInwestycje(f.reads[side].bands,f.preSlow[side],f.persistenceAfter[side],f.cycleAt),f.decisions[side]);
  for(const d of f.decisions[side]){
   const all=Object.entries(f.reads[side].bands).flatMap(([rating,cs])=>cs.map(c=>({...c,rating:Number(rating)})));
   const matches=all.filter(c=>c.rating===d.rating&&String(c.id)===d.id&&c.name===d.nazwa);
   assert.equal(matches.length,1);const quote=matches[0];assert.equal(quote.price,d.cena);
   const url=new URL(quote.url);assert.equal(url.host,'www.fut.gg');assert.ok(url.pathname.includes('/'+d.id+'-'));assert.ok(url.pathname.endsWith('/27-'+d.id+'/'));
   const w=f.preSlow[side][d.klucz],t=f.persistenceAfter[side][d.klucz];
   assert.equal(w.id,d.id);assert.equal(t.id,d.id);assert.equal(w.v,3);
   const age=f.cycleAt-w.od,stale=f.cycleAt-w.t,span=f.cycleAt-t.od;
   assert.ok(w.n>=MIN_ODCZYTOW_D&&age>=MIN_WIEK_DOBOWEJ&&stale>=0&&stale<=7200);
   assert.ok(t.n>=MIN_TRWALOSC&&span>=MIN_TRWALOSC_SEK);assert.equal(t.t,f.cycleAt);
   assert.ok(d.cena<=w.p*(1-PROG_INW));assert.ok(w.p-d.cena>=MIN_KROKOW*step(w.p));
   const target=down(down(w.p)-1),limit=down(Math.floor(target*.95/(1+INW_MARZA)));
   assert.equal(target,d.cel);assert.equal(limit,d.kupnoDo);assert.equal(d.wzasiegu,d.cena<=limit);
   assert.equal(d.netto,Math.round(target*.95-limit));assert.equal(d.zwrot,pct(d.netto/limit));assert.equal(d.rabat,pct(1-d.cena/w.p));
   const key=JSON.stringify([side,d.rating,d.id,d.nazwa]),ledger=shadow.states[side].otwarte[key];assert.ok(ledger);assert.equal(ledger.purchaseConfirmed,false);
   const rawNet=target*.95-d.cena;
   rows.push({cycle,platform:side,name:d.nazwa,rating:d.rating,id:d.id,key,url:quote.url,
    observedAt:f.reads[side].observedAt,decisionAt:f.cycleAt,quote:d.cena,level:w.p,target,limit,
    discountPct:d.rabat,withinLimit:d.wzasiegu,amountAboveLimit:Math.max(0,d.cena-limit),
    requiredQuoteDropPct:Math.max(0,(1-limit/d.cena)*100),
    displayedNetAtLimit:d.netto,displayedReturnAtLimitPct:d.zwrot,
    scenarioNetAtQuoteBeforeRounding:rawNet,scenarioNetAtQuoteCodeRounded:Math.round(rawNet),scenarioReturnAtQuotePct:100*rawNet/d.cena,
    breakEvenSale:Math.ceil((d.cena/.95)/step(d.cena/.95))*step(d.cena/.95),
    modelAgeSeconds:age,modelStaleSeconds:stale,modelCount:w.n,persistenceSeconds:span,persistenceCount:t.n,
    sameProfileIdOccurrencesInPlatformBands:all.filter(c=>String(c.id)===d.id).length,
    identityWithinSnapshot:true,purchaseConfirmed:false});
  }
 }
}
assert.equal(rows.length,8);assert.equal(new Set(rows.map(r=>r.key)).size,4);
assert.equal(rows.filter(r=>r.withinLimit).length,2);
const result={stage:'15K',status:'PASS',scope:'arithmetic and provenance of archived 15J candidates, no new market reads',
 sourceCommit:summary.sourceCommit,codeCommit:summary.codeCommit,evidenceSha256:digest(readFileSync(zip)),
 rows,uniqueSignals:4,observations:8,withinLimitByCycle:{1:1,2:1},purchaseExecutions:0,
 limitations:['identity checked internally against captured bands and model IDs, not independently against EA','5 percent tax and grid are existing code assumptions; exact game settlement rounding not reverified','model summary counts and age do not reconstruct all prior quotes or prove continuous market availability','EMA target is an uncalibrated reference, no probability or deadline of recovery','77 selected quotes per platform per frame, not all market listings','historical sample from 9 November; no current purchase recommendation'],
 decision:'keep all four as traceable conditional candidates; only PS Kvaratskhelia within limit; no production change or efficacy claim'};
writeFileSync(new URL('result.json',here),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,uniqueSignals:4,observations:8,withinLimitByCycle:result.withinLimitByCycle}));
}finally{rmSync(dir,{recursive:true,force:true});}
