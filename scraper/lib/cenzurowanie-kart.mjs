/**
 * ANALIZA NIEOBECNOSCI KART W LIMITOWANEJ LISCIE fut.gg.
 * Brak z listy nie jest sprzedaza, zyskiem, spadkiem ani brakiem na rynku.
 *
 * Snapshot v2 = [czas, [oceny, dla ktorych odczytane karty byly poprawne]].
 * Tylko dwie poprawne nastepujace migawki TEJ SAMEJ platformy i oceny moga
 * potwierdzic fakt: "ta karta nie nalezala do odczytanego wycinka".
 * Nigdy nie imputujemy jej ceny i nie traktujemy tego jak complete-market feed.
 */
import { kluczKarty, MAX_LUKA } from "./eksperyment-historii-kart.mjs";

export const WERSJA_AUDYTU = 1;
export const MAX_ODSTEP_MIGAWEK = 20*60;
export const MIN_GRUPA_POROWNANIA = 20; // prog raportowania, nie wartosc predykcyjna

const median = nums => {
  const a=[...nums].sort((x,y)=>x-y),k=Math.floor(a.length/2);
  return a.length%2?a[k]:(a[k-1]+a[k])/2;
};
function validSnapshot(x) {
  return Array.isArray(x)&&x.length===2&&Number.isInteger(x[0])
    &&Array.isArray(x[1])&&x[1].every(r=>Number.isInteger(r));
}
function pointsAt(stan,side) {
  const map=new Map();
  for(const [key,w] of Object.entries(stan?.[side]||{})){
    if(!Array.isArray(w?.punkty)||!Number.isInteger(w.rating))continue;
    for(const p of w.punkty){
      if(!Array.isArray(p)||!Number.isInteger(p[0])||!Number.isFinite(p[1]))continue;
      const nk=String(p[0])+"|"+String(w.rating);
      const arr=map.get(nk)||[];
      arr.push({key,price:p[1]});
      map.set(nk,arr);
    }
  }
  return map;
}

/** To status WIDOCZNOSCI w odczytanej czesci pasma, NIE status na rynku. */
export function statusNaMigawce(stan,side,rating,card,t){
  if(!["ps","pc"].includes(side)||!Number.isInteger(rating)||!Number.isInteger(t))
    return "brak-podstaw";
  const snapshots=stan?.migawki?.[side]||[];
  const snap=snapshots.find(s=>validSnapshot(s)&&s[0]===t&&s[1].includes(rating));
  if(!snap)return "nieocenialne-brak-migawki-pasma";
  const key=kluczKarty(rating,card);
  if(!key)return "nieocenialne-brak-tozsamosci";
  return (stan?.[side]?.[key]?.punkty||[]).some(x=>x[0]===t)
    ?"widoczna-w-liscie":"poza-odczytana-lista";
}

const empty=()=>({paryMigawek:0,nieocenionePasma:0,obserwowanePrzejscia:0,
  pozostaly:0,zniknelyZListy:0,zniknieciaWGornejPolowie:{n:0,brak:0},
  zniknieciaWDolnejPolowie:{n:0,brak:0},
  remisCen:{n:0,brak:0}});

/**
 * Hipoteza selekcji: czy drozsza polowa kart (w obrebie tego samego ratingu
 * i platformy) znika czesciej niz tansza? Podzial liczony tylko z cen w chwili t.
 * Remisy cen tworza OSOBNA grupe, aby ranking przy cenie 650 nie byl losowy.
 */
export function audytNieobecnosci(stan,{maxOdstep=MAX_ODSTEP_MIGAWEK}={}){
  const out={wersja:WERSJA_AUDYTU,opis:"statystyka widocznosci, nie cen transakcji",
    platformy:{},ostatecznaOcena:"brak danych reprezentatywnych"};
  for(const side of ["ps","pc"]){
    const g=empty();
    const snaps=(stan?.migawki?.[side]||[]).filter(validSnapshot)
      .sort((a,b)=>a[0]-b[0]);
    const groups=pointsAt(stan,side);
    for(let i=1;i<snaps.length;i++){
      const [t0,rs0]=snaps[i-1],[t1,rs1]=snaps[i];
      if(!(t1>t0&&t1-t0<=maxOdstep))continue;
      g.paryMigawek++;
      const common=rs0.filter(r=>rs1.includes(r));
      g.nieocenionePasma+=rs0.length-common.length;
      for(const rating of common){
        const prev=groups.get(t0+"|"+rating)||[];
        const next=new Set((groups.get(t1+"|"+rating)||[]).map(x=>x.key));
        if(!prev.length)continue;
        const mid=median(prev.map(x=>x.price));
        for(const entry of prev){
          const dropped=!next.has(entry.key);
          g.obserwowanePrzejscia++;
          if(dropped)g.zniknelyZListy++;else g.pozostaly++;
          const where=entry.price<mid?"zniknieciaWDolnejPolowie"
            :entry.price>mid?"zniknieciaWGornejPolowie":"remisCen";
          g[where].n++;if(dropped)g[where].brak++;
        }
      }
    }
    for(const k of ["zniknieciaWGornejPolowie","zniknieciaWDolnejPolowie","remisCen"]){
      const a=g[k];a.udzialPct=a.n>0?+(100*a.brak/a.n).toFixed(2):null;
    }
    g.udzialZnikajacychPct=g.obserwowanePrzejscia>0
      ?+(100*g.zniknelyZListy/g.obserwowanePrzejscia).toFixed(2):null;
    const hi=g.zniknieciaWGornejPolowie,lo=g.zniknieciaWDolnejPolowie;
    g.roznicaGoraMinusDolPp=hi.n>=MIN_GRUPA_POROWNANIA
      &&lo.n>=MIN_GRUPA_POROWNANIA
      ?+(hi.udzialPct-lo.udzialPct).toFixed(2):null;
    g.statusPorownania=g.roznicaGoraMinusDolPp===null?"za-malo-danych":"opisowe-bez-przyczynowosci";
    out.platformy[side]=g;
  }
  return out;
}

/**
 * Scenariusze wczesniej zdefiniowanego wyniku BINARNEGO w jednym momencie h:
 * obserwowany sukces, obserwowany brak sukcesu lub brak obserwacji.
 * NIE interpretowac jako prawdopodobienstwa rzeczywistej sprzedazy.
 */
export function graniceWyniku({tak=0,nie=0,brak=0}={}){
  for(const x of [tak,nie,brak])if(!Number.isInteger(x)||x<0)
    throw new Error("Liczniki musza byc nieujemnymi liczbami calkowitymi");
  const n=tak+nie+brak;
  return {n,zaobserwowane:tak+nie,niezaobserwowane:brak,
    udzialTylkoZaobserwowanychPct:tak+nie>0?+(100*tak/(tak+nie)).toFixed(2):null,
    dolnaGranicaPct:n>0?+(100*tak/n).toFixed(2):null,
    gornaGranicaPct:n>0?+(100*(tak+brak)/n).toFixed(2):null,
    definicja:"granice dla zadanego wyniku W PUNKCIE CZASU; brak=nieznany, nie sprzedaz"};
}
