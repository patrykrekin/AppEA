/**
 * Niezalezna kontrola JAKOSCI eksperymentalnego archiwum kart.
 * NIE tworzy sygnalow transakcyjnych i nie zmienia historii ani EMA.
 * NIST MAD: https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/mad.htm
 * FPP3 rolling-origin: https://otexts.com/fpp3/toolbox.html
 */
import { onGrid, stepFor } from "./grid.mjs";
import { porownaj, PROBKA, MAX_LUKA } from "./eksperyment-historii-kart.mjs";

export const WERSJA_DIAGNOSTYKI = 1;
export const OKNO_ODCHYLEN = 7;       // hipoteza: 7 poprzednich punktow (ok. 70 minut)
export const MIN_ODCHYLEN = 5;
export const PROG_MAD = 3;             // hipoteza; 3 * 1,4826 * MAD
export const MIN_KROKI = 2;            // przy MAD=0 nie flaguj szumu <= 2 krokow siatki
export const HORYZONTY = [2*3600, 12*3600];
export const TOLERANCJA_WYNIKU = 900; // +- 15 minut wokol faktycznego horyzontu
export const ODSTEP_POCZATKOW = 3600; // max jeden poczatek na karte/godzine

function mediana(xs) {
  if (!xs.length) return null;
  const a=[...xs].sort((x,y)=>x-y),k=Math.floor(a.length/2);
  return a.length%2 ? a[k] : (a[k-1]+a[k])/2;
}

export function sprawdzPunkty(punkty, at) {
  const valid=[], errors=[];
  let last=-Infinity, maxLuka=0;
  for(const x of Array.isArray(punkty)?punkty:[]) {
    if(!Array.isArray(x)||x.length!==2||!Number.isInteger(x[0])
      ||x[0]<=0||x[0]>at||!Number.isFinite(x[1])||x[1]<=0||!onGrid(x[1])) {
      errors.push("nieprawidlowy punkt"); continue;
    }
    if(x[0] <= last) { errors.push("duplikat lub niechronologiczny czas"); continue; }
    if(last > 0) maxLuka=Math.max(maxLuka,x[0]-last);
    valid.push(x);last=x[0];
  }
  return { punkty:valid, bledy:errors, maxLuka, pokrycie:valid.length>1
    ?valid.at(-1)[0]-valid[0][0]:0 };
}

/** Oznacza kandydat na odstajacy punkt, NICZEGO nie usuwa.
 *  Test jest przyczynowy: bierze tylko punkty przed ocenianym, bez look-ahead.
 *  Oznaczenie to anomalia statystyczna, a NIE dowod bledu rynku.
 */
export function odstajacyOstatni(punkty, at) {
  const checked=sprawdzPunkty(punkty,at);
  const a=checked.punkty;
  if(checked.bledy.length) return {status:"bledne-dane"};
  if(a.length < MIN_ODCHYLEN+1) return {status:"za-malo-probek"};
  const prev=a.slice(-1-OKNO_ODCHYLEN,-1),x=a.at(-1);
  if(prev.length<MIN_ODCHYLEN) return {status:"za-malo-probek"};
  const seria=[...prev,x];
  if(seria.some((p,i)=>i>0&&p[0]-seria[i-1][0]>MAX_LUKA))
    return {status:"luka"};
  const baza=mediana(prev.map(p=>p[1]));
  const mad=mediana(prev.map(p=>Math.abs(p[1]-baza)));
  const prog=Math.max(PROG_MAD*1.4826*mad,MIN_KROKI*stepFor(baza));
  return { status: Math.abs(x[1]-baza)>prog?"kandydat":"normalny",
    cena:x[1], medianaBazy:baza, mad, progMonet:prog,
    odchylenieMonet:x[1]-baza, probyBazy:prev.length };
}

export function jakosc(stan, at=stan?.at) {
  if(!Number.isInteger(at)||at<=0) throw new Error("Brak poprawnego czasu archiwum");
  const result={wersja:WERSJA_DIAGNOSTYKI,at,platformy:{}};
  for(const side of ["ps","pc"]){
    const entries=Object.values(stan?.[side]||{});
    const x={kart:entries.length,probek:0,swiezych20min:0,gotowych12h:0,
      zLuka20min:0,blednych:0,odstajacych:0,ostatnioNieobecnych:0,
      medianaProbek:0,maxProbek:0,rozkladOvr:{}};
    const counts=[];
    for(const w of entries){
      const c=sprawdzPunkty(w.punkty,at), last=c.punkty.at(-1);
      const n=c.punkty.length;counts.push(n);x.probek+=n;
      if(n>x.maxProbek)x.maxProbek=n;
      if(c.bledy.length)x.blednych++;
      if(c.maxLuka>MAX_LUKA)x.zLuka20min++;
      if(last&&at-last[0]<=MAX_LUKA)x.swiezych20min++;else x.ostatnioNieobecnych++;
      if(odstajacyOstatni(w.punkty,at).status==="kandydat")x.odstajacych++;
      if(Number.isInteger(w.rating)&&w.id&&w.nazwa
        &&porownaj(stan,side,w.rating,{id:w.id,name:w.nazwa},at).gotowe)x.gotowych12h++;
      const key=String(w.rating);x.rozkladOvr[key]=(x.rozkladOvr[key]||0)+1;
    }
    x.medianaProbek=mediana(counts)||0;
    x.pokrycieModeliPct=entries.length?+(100*x.gotowych12h/entries.length).toFixed(2):0;
    result.platformy[side]=x;
  }
  return result;
}

const metody=["ostatnia","ema12","mediana12","hybryda"];
const nowaGrupa=()=>({poczatki:0,oczekujace:0,brakKolejnegoNotowania:0,
  wynikiZaobserwowane:0,kartyZObserwacja:0,bladPct:{},iloscDlaMetody:{}});

/**
 * Ewaluacja walk-forward: pochodzenie p(t) tylko z punktow <t, p(t) jako
 * uczciwy benchmark, wyznaczony horyzont w przyszlosci.
 * Rowniez mierzymy ile obserwacji utracono: karta wypadajaca z listy
 * NIE jest ani zyskiem, ani strata. Wyniki sa WARUNKOWE na ponownym
 * zaobserwowaniu tej samej karty w oknie t+h (+/-15min).
 */
export function sprawdzMetody(stan,at=stan?.at,{
  horyzonty=HORYZONTY,tolerancja=TOLERANCJA_WYNIKU,
  odstep=ODSTEP_POCZATKOW
}={}){
  const out={wersja:WERSJA_DIAGNOSTYKI,at,wyniki:{}};
  for(const side of ["ps","pc"]){
    out.wyniki[side]={};
    for(const h of horyzonty)out.wyniki[side][h]=nowaGrupa();
    for(const w of Object.values(stan?.[side]||{})){
      const checked=sprawdzPunkty(w.punkty,at);
      if(checked.bledy.length||!w.id||!w.nazwa||!Number.isInteger(w.rating))continue;
      const points=checked.punkty;
      let lastOrigin=-Infinity;
      const card={id:w.id,name:w.nazwa};
      for(const [t,p] of points){
        if(t-lastOrigin<odstep)continue;
        const v=porownaj(stan,side,w.rating,card,t);
        if(!v.gotowe)continue;
        lastOrigin=t;
        for(const h of horyzonty){
          const g=out.wyniki[side][h];g.poczatki++;
          const targetTime=t+h;
          if(at<targetTime+tolerancja){g.oczekujace++;continue;}
          const future=points.filter(x=>Math.abs(x[0]-targetTime)<=tolerancja)
            .sort((a,b)=>Math.abs(a[0]-targetTime)-Math.abs(b[0]-targetTime))[0];
          if(!future){g.brakKolejnegoNotowania++;continue;}
          const y=future[1];
          const values={ostatnia:p,ema12:v.ema12,mediana12:v.mediana12,hybryda:v.hybryda};
          g.wynikiZaobserwowane++;
          for(const k of metody){
            const value=values[k];
            if(!Number.isFinite(value)||!(value>0))continue;
            const err=Math.abs(value-y)/y*100;
            g.bladPct[k]=(g.bladPct[k]||0)+err;
            g.iloscDlaMetody[k]=(g.iloscDlaMetody[k]||0)+1;
          }
        }
      }
    }
    for(const h of horyzonty){
      const g=out.wyniki[side][h];
      for(const k of metody)g.bladPct[k]=g.iloscDlaMetody[k]
        ?+(g.bladPct[k]/g.iloscDlaMetody[k]).toFixed(4):null;
      g.warunkowyUdzialRozstrzygnietychPct=g.poczatki-g.oczekujace>0
        ?+(100*g.wynikiZaobserwowane/(g.poczatki-g.oczekujace)).toFixed(2):null;
      delete g.iloscDlaMetody;
      delete g.kartyZObserwacja;
    }
  }
  return out;
}
