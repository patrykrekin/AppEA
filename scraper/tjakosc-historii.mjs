import assert from "node:assert/strict";
import {sprawdzPunkty,odstajacyOstatni,jakosc,sprawdzMetody}
  from "./lib/jakosc-historii-kart.mjs";
import {WERSJA as WERSJA_HIST} from "./lib/eksperyment-historii-kart.mjs";

const t=1_800_000_000,card={id:"123",name:"Karta testowa"};
const key="87|123|Karta testowa";
const series=Array.from({length:220},(_,i)=>[t+i*600,5000]);
const stan={wersja:WERSJA_HIST,at:t+219*600,ps:{[key]:{...card,rating:87,nazwa:card.name,punkty:series}},pc:{}};
const clean=sprawdzPunkty(series,stan.at);
assert.equal(clean.bledy.length,0);
assert.equal(clean.punkty.length,220);
assert.equal(clean.maxLuka,600);
assert.equal(sprawdzPunkty([...series,series.at(-1)],stan.at).bledy.length,1,
 "ten sam czas to duplikat, nie nowa obserwacja");
assert.equal(sprawdzPunkty([...series,[stan.at+600,5000]],stan.at).bledy.length,1,
 "nie przyjmujemy przyszlej probki");
assert.equal(sprawdzPunkty([...series,[stan.at+600,9750]],stan.at).bledy.length,1,
 "niepoprawny punkt lub przyszly");
const stable=odstajacyOstatni(series,stan.at);
assert.equal(stable.status,"normalny");
const anomalous=[...series.slice(0,-1),[stan.at,1000]];
const flag=odstajacyOstatni(anomalous,stan.at);
assert.equal(flag.status,"kandydat");
assert.equal(flag.medianaBazy,5000);
assert.equal(flag.mad,0);
assert.ok(flag.progMonet>0);
assert.equal(anomalous.at(-1)[1],1000,"nie usuwamy prawdziwego spadku!");
const notEnough=odstajacyOstatni(series.slice(0,3),series[2][0]);
assert.equal(notEnough.status,"za-malo-probek");
const gap=[...series.slice(0,-1),[stan.at+2400,4500]];
assert.equal(odstajacyOstatni(gap,stan.at+2400).status,"luka");

const j=jakosc(stan);
assert.equal(j.platformy.ps.kart,1);
assert.equal(j.platformy.ps.probek,220);
assert.equal(j.platformy.ps.swiezych20min,1);
assert.equal(j.platformy.ps.gotowych12h,1);
assert.equal(j.platformy.pc.kart,0);
assert.equal(j.platformy.ps.odstajacych,0);
const badStan={...stan,ps:{[key]:{...stan.ps[key],punkty:anomalous}}};
assert.equal(jakosc(badStan).platformy.ps.odstajacych,1);
const scored=sprawdzMetody(stan);
assert.ok(scored.wyniki.ps[7200].poczatki>0);
assert.ok(scored.wyniki.ps[7200].wynikiZaobserwowane>0);
assert.ok(scored.wyniki.ps[43200].wynikiZaobserwowane>0);
assert.equal(scored.wyniki.ps[7200].bladPct.ostatnia,0);
assert.equal(scored.wyniki.ps[7200].bladPct.mediana12,0);
assert.equal(scored.wyniki.ps[7200].brakKolejnegoNotowania,0);
assert.equal(scored.wyniki.pc[7200].poczatki,0);
const missing=series.filter((_,i)=>i<115||i>165);
const censored={...stan,ps:{[key]:{...stan.ps[key],punkty:missing}}};
const e=sprawdzMetody(censored);
assert.ok(e.wyniki.ps[7200].brakKolejnegoNotowania>0,
 "brak karty w przyszlym oknie musi byc 'nierozstrzygniety' a nie porazka");
assert.ok(e.wyniki.ps[7200].wynikiZaobserwowane>0);
assert.equal(jakosc(censored).platformy.ps.zLuka20min,1);
console.log("OK: czyszczenie metadanych, brak look-ahead i bez utraty sygnalow anomalii");
console.log("OK: warunkowa ocena walk-forward dla horyzontow 2h/12h i monitoring braku wynikow");
