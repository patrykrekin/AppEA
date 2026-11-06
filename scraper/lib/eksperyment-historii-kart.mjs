/* EKSPERYMENT - niepodlaczony do produkcji.
   Obserwacje fut.gg to najtansze wystawienia, nie wykonane transakcje.
   Nie zastepujemy nimi historii wszystkich kart na rynku.
 */
import { onGrid } from "./grid.mjs";

export const WERSJA = 2; // Migawki od v2; historia v1 nie ma dowodow nieobecnosci
export const PROBKA = 600;      // co 10 minut; PARAMETR DO WALIDACJI
export const RETENCJA = 48*3600;
export const OKNO = 12*3600;
export const MIN_CZAS = 8*3600;
export const MIN_PROBEK = 36;
export const MAX_LUKA = 1200;

export function kluczKarty(rating, card) {
  const id = String(card?.id || "").trim();
  const nazwa = String(card?.name || "").trim();
  if (!Number.isInteger(rating) || !/^\d+$/.test(id) || nazwa.length < 2)
    return null;
  return String(rating) + "|" + id + "|" + nazwa;
}
const mediana = xs => {
  const a = [...xs].sort((x,y)=>x-y), k = a.length >> 1;
  return a.length%2 ? a[k] : (a[k-1]+a[k])/2;
};

/** Bez I/O; nie wypelnia brakujacych cen i nie miesza rynkow. */
export function dopisz(stary, bands, at, krok = PROBKA, retencja = RETENCJA) {
  if(!Number.isInteger(at)||at<=0)throw new Error("Nieprawidlowy czas");
  /* V1 -> V2 zachowuje ceny, ale nie dopisuje fikcyjnych migawek przeszlosci. */
  const prev=stary&&[1,WERSJA].includes(stary.wersja)?stary:{ps:{},pc:{}};
  if(Number.isFinite(prev.at)&&prev.at>at)throw new Error("Odczyt sprzed archiwum");
  const out={wersja:WERSJA,at,ps:{},pc:{},migawki:{ps:[],pc:[]}};
  let dopisano=0,odrzucono=0,dodaneMigawki=0,odrzuconePasma=0;
  for(const side of ["ps","pc"]){
    for(const [key,v] of Object.entries(prev[side]||{})){
      if(!Array.isArray(v?.punkty))continue;
      const punkty=v.punkty.filter(x=>Array.isArray(x)&&Number.isFinite(x[0])
        &&Number.isFinite(x[1])&&x[0]<=at&&at-x[0]<=retencja);
      if(punkty.length)out[side][key]={...v,punkty};
    }
    const wcześniejsze=Array.isArray(prev.migawki?.[side])?prev.migawki[side]:[];
    out.migawki[side]=wcześniejsze.filter(x=>Array.isArray(x)&&Number.isFinite(x[0])
      &&x[0]<=at&&at-x[0]<=retencja).map(x=>[x[0],x[1]]);
    const poprzednia=out.migawki[side].at(-1)?.[0];
    if(Number.isFinite(poprzednia)&&at-poprzednia<krok)continue;
    const oceny=[],karty=[];
    for(const [rating,arr] of Object.entries(bands?.[side]||{})){
      if(!Number.isInteger(+rating)||!Array.isArray(arr)||!arr.length)continue;
      let ok=true;const unique=new Set(),temp=[];
      for(const card of arr){
        const key=kluczKarty(+rating,card);
        if(!key||!onGrid(card.price)||unique.has(key)){
          ok=false;odrzucono++;continue;
        }
        unique.add(key);temp.push({key,rating:+rating,card});
      }
      /* Wadliwy rekord dyskwalifikuje pasmo jako dowod NIEOBECNOSCI.
         Pomijamy cala migawke pasma, nie usuwamy poprawnej historii. */
      if(!ok){odrzuconePasma++;continue;}
      oceny.push(+rating);karty.push(...temp);
    }
    if(!oceny.length)continue;
    out.migawki[side].push([at,oceny.sort((a,b)=>a-b)]);
    dodaneMigawki++;
    for(const {key,rating,card} of karty){
      const last=out[side][key]?.punkty||[];
      if(last.length&&last.at(-1)[0]>=at)continue;
      out[side][key]={id:String(card.id),rating,nazwa:card.name,
        punkty:[...last,[at,card.price]]};
      dopisano++;
    }
  }
  return {stan:out,statystyki:{dopisano,odrzucono,dodaneMigawki,odrzuconePasma,
    ps:Object.keys(out.ps).length,pc:Object.keys(out.pc).length}};
}

/** Wszystkie estymatory otrzymuja te same PRZESZLE punkty; odczyt t nie wchodzi.
 *  Wynik gotowe=false oznacza BRAK WYCENY zamiast liczby z przerwanej historii.
 *  To tylko eksperyment - nie jest dokladna cena transakcji ani sygnalem kupna.
 */
export function porownaj(stan,side,rating,card,t,{
  okno=OKNO,minCzas=MIN_CZAS,minProbek=MIN_PROBEK,maxLuka=MAX_LUKA
}={}){
  if(!["ps","pc"].includes(side))return{gotowe:false,powod:"rynek"};
  const klucz=kluczKarty(rating,card);
  const wszystkie=stan?.[side]?.[klucz]?.punkty||[];
  const x=wszystkie.filter(z=>z[0]<t&&z[0]>=t-okno).sort((a,b)=>a[0]-b[0]);
  if(x.length<minProbek)return{gotowe:false,powod:"za malo probek",liczba:x.length};
  const pokrycie=x.at(-1)[0]-x[0][0];
  if(pokrycie<minCzas)return{gotowe:false,powod:"za krotkie okno",liczba:x.length,pokrycie};
  if(t-x.at(-1)[0]>maxLuka)return{gotowe:false,powod:"stale notowanie"};
  for(let i=1;i<x.length;i++)
    if(x[i][0]-x[i-1][0]>maxLuka)return{gotowe:false,powod:"luka",liczba:x.length};
  const med=mediana(x.map(z=>z[1]));
  let ema=x[0][1];
  for(let i=1;i<x.length;i++){
    const alfa=-Math.expm1(Math.log1p(-0.005)*(x[i][0]-x[i-1][0])/300);
    ema+=alfa*(x[i][1]-ema);
  }
  return{gotowe:true,liczba:x.length,pokrycie,ostatnio:x.at(-1)[0],
    mediana12:med,ema12:ema,hybryda:0.5*(med+ema),
    definicja:"obserwowane najtansze oferty; test estymatorow, nie cena transakcji"};
}
