/**
 * ETAP 8 — jednorazowy PRZYCZEPIONY TYLKO NA GALEZI BADAWCZEJ test integracyjny.
 * Nie wykonuje zapytan, nie aktualizuje produkcyjnych funkcji ani poziomow.
 * Tylko po jawnej zmiennej FUT_SHADOW_AUDIT_PATH zapisuje artefakt w izolowanym runnerze.
 */
import { writeFileSync } from "node:fs";
import { zbudujMigawkeDecyzji } from "./shadow-decyzje.mjs";
import { definicjaOkazji } from "./okazje.mjs";
import { definicja } from "./rejestr.mjs";
import { KOSZYK } from "./indeks.mjs";

export function przeprowadzProbeShadow({
  at, bands, preFast, preSlow, trwaloscPo, okazje, inwestycje, sciezka, commit
}){
  if(typeof sciezka!=="string" || !sciezka.startsWith("/") || !sciezka.endsWith(".json"))
    throw new Error("shadow-probe: plik wynikowy tylko w jawnej sciezce absolutnej .json");
  if(typeof commit!=="string" || !/^[0-9a-f]{40}$/.test(commit))
    throw new Error("shadow-probe: wymagana pelna sygnatura commitu checkout");
  const wejscie={at,bands,preFast,preSlow,trwaloscPo,okazje,inwestycje};
  const przed=JSON.stringify(wejscie);
  const started=process.hrtime.bigint();
  // Badamy rzeczywista populacje strategii, tylko te OVR sa analizowane
  // przez policzOkazje, policzInwestycje i aktualizujPoziomyD.
  // Ratingi spoza koszyka NIE sa kontrola inwestycyjna; nie walidujemy ich.
  const selected = Object.fromEntries(["ps","pc"].map(side=>[side,
    Object.fromEntries(Object.entries(bands[side]||{}).filter(([r])=>KOSZYK.includes(Number(r))))]));
  const {migawka,statystyki}=zbudujMigawkeDecyzji({
    ...wejscie,bands:selected,definicje:{
      szybka:definicjaOkazji(),inwestycja:definicja(),commit
    }
  });
  const czasMs=Number(process.hrtime.bigint()-started)/1_000_000;
  if(JSON.stringify(wejscie)!==przed) throw new Error("shadow-probe: wykryto mutacje produkcyjnych danych");
  const metryki={};
  for(const side of ["ps","pc"]){
    const rows=migawka[side], KOSZYK=[83,84,85,86,87,88,89];
    const wskazniki=(inwestycje[side]||[]).map(x=>[x.klucz,String(x.id),x.cel,x.kupnoDo]);
    const szybkie=(okazje[side]?.karty||[]).map(x=>x.klucz);
    metryki[side]={
      obserwowane:rows.length,
      pominietePasmaPozaStrategia:Object.keys(bands[side]||{}).filter(k=>!KOSZYK.includes(Number(k))).length,
      decyzjaRozpatrywana:rows.filter(x=>KOSZYK.includes(x[0])).length,
      pozaKoszykiem:rows.filter(x=>!KOSZYK.includes(x[0])).length,
      zEMAprzedSzybka:rows.filter(x=>x[3]!=null).length,
      zEMAprzedDobowa:rows.filter(x=>x[7]!=null).length,
      zTrwalosciaPo:rows.filter(x=>x[11]!=null).length,
      szybkieWAlgorytmie:szybkie.length,topInwestycjeWAlgorytmie:wskazniki.length,
      szybkieKlucze:szybkie,wybraneInwestycje:wskazniki
    };
  }
  const artefakt={
    test:"shadow-integracja-predecision",
    protokol:1,
    zapisaneAt:new Date().toISOString(),
    czasMs, statystyki, metryki,migawka
  };
  writeFileSync(sciezka,JSON.stringify(artefakt)+"\n","utf8");
  console.log("SHADOW_ETAP8 "+JSON.stringify({
    czasMs:Number(czasMs.toFixed(3)),bajty:statystyki.bajty,
    ps:metryki.ps.obserwowane,pc:metryki.pc.obserwowane,
    sygnalyPS:metryki.ps.szybkieWAlgorytmie,inwestycjePS:metryki.ps.topInwestycjeWAlgorytmie,
    sygnalyPC:metryki.pc.szybkieWAlgorytmie,inwestycjePC:metryki.pc.topInwestycjeWAlgorytmie,
    niezmienioneWejscie:true
  }));
}
