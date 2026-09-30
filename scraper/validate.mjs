import { readFileSync } from "node:fs";
import { onGrid, net } from "./lib/grid.mjs";

/* Bramka przed publikacją. Zły plik jest gorszy niż stary plik,
   więc przy błędzie nic nie wychodzi na produkcję. */

const BUDGETS = [30000, 100000, 300000, 1500000];
const REQUIRED = ["at","index","momentum","verdict","movers","snipe","tier","pos"];

export function validate(d){
  const err = [], warn = [];

  for (const k of REQUIRED) if (!(k in d)) err.push(`brak klucza: ${k}`);
  if (err.length) return { err, warn };

  for (const p of ["ps","pc"]){
    if (!d.index?.[p]?.value)  err.push(`index.${p}.value brak — kontrakt jest per platforma`);
    if (!d.momentum?.[p])      err.push(`momentum.${p} brak — kontrakt jest per platforma`);
  }

  if (!Number.isInteger(d.at)) err.push("at musi być liczbą całkowitą (epoch w sekundach)");
  if (d.at > 1e12) err.push("at wygląda na milisekundy — ma być w sekundach");
  const ageH = (Date.now()/1000 - d.at) / 3600;
  if (ageH > 6) warn.push(`dane mają ${ageH.toFixed(1)} h`);

  for (const p of ["ps","pc"]){
    const rows = d.snipe?.[p]?.rows;
    if (!Array.isArray(rows) || !rows.length){ err.push(`snipe.${p}.rows puste`); continue; }
    rows.forEach(([name, market, buy, list, poziom, pomiarow, sufit], i) => {
      for (const [label, v] of [["oferta",market],["snajpuj do",buy],["wystaw",list]])
        if (!onGrid(v)) err.push(`snipe.${p}[${i}] ${name}: ${label} ${v} nie leży na siatce`);
      if (net(buy, list) <= 0) err.push(`snipe.${p}[${i}] ${name}: netto ${net(buy,list)} — pozycja do niczego`);

      /* Twarda reguła asymetrii: limit kupna NIGDY powyżej ostatniej widzianej
         oferty. Poziom się spóźnia i w spadającym rynku kazałby przepłacać —
         a przepłacenie to strata monet, w odróżnieniu od za wysokiego celu,
         przy którym karta po prostu stoi. */
      if (buy > market) err.push(`snipe.${p}[${i}] ${name}: limit kupna ${buy} powyżej oferty ${market}`);

      /* Cel porównujemy z tym, z czego naprawdę powstał. Od 28.09 cel bierze się
         z poziomu karty, więc "wystawienie nie jest pod rynkiem" przy odstającej
         taniej ofercie było ostrzeżeniem o poprawnym zachowaniu. */
      const odniesienie = Number.isFinite(poziom) && poziom > 0 ? poziom : market;
      if (list >= odniesienie)
        warn.push(`snipe.${p}[${i}] ${name}: wystawienie ${list} nie jest pod ${Number.isFinite(poziom) && poziom > 0 ? `poziomem ${poziom}` : `ofertą ${market}`}`);
      if (Number.isFinite(poziom) && poziom > 0 && !(pomiarow > 0))
        err.push(`snipe.${p}[${i}] ${name}: poziom ${poziom} bez liczby pomiarów — nie wiadomo, ile za nim stoi`);

      /* Sufit licytacji — od 29.09 to główna cena wejścia na stronie, więc
         sprawdzamy ją ostrzej niż limit BIN. Sufit, przy którym po podatku nie
         zostaje marża, to zaproszenie do przelicytowania się do zera. */
      if (sufit !== undefined && sufit !== null){
        if (!onGrid(sufit)) err.push(`snipe.${p}[${i}] ${name}: sufit licytacji ${sufit} nie leży na siatce`);
        if (net(sufit, list) <= 0) err.push(`snipe.${p}[${i}] ${name}: przy suficie ${sufit} netto ${net(sufit,list)} — licytowanie do tej ceny to strata`);
        if (sufit >= list) err.push(`snipe.${p}[${i}] ${name}: sufit ${sufit} nie jest pod celem ${list}`);
        if (sufit < buy) warn.push(`snipe.${p}[${i}] ${name}: sufit licytacji ${sufit} poniżej limitu kup-teraz ${buy} — sufit powinien być wyżej, inaczej nie wygra aukcji`);
      }
    });
  }

  for (const side of ["short","long"]){
    const list = d.pos?.[side];
    if (!Array.isArray(list) || !list.length){ err.push(`pos.${side} puste`); continue; }
    list.forEach((o, i) => {
      if (!Number.isFinite(o.entry)) err.push(`pos.${side}[${i}] ${o.name}: entry nie jest liczbą`);
      else if (!onGrid(o.entry))     err.push(`pos.${side}[${i}] ${o.name}: entry ${o.entry} nie leży na siatce`);
      for (const f of ["name","price","when","sell","why","exit"])
        if (!o[f]) err.push(`pos.${side}[${i}]: brak pola ${f}`);
    });
    for (const b of BUDGETS)
      if (!list.some(o => o.entry * 10 <= b))
        err.push(`pos.${side}: przy budżecie ${b} nie ma ani jednej dostępnej pozycji — dziura w drabinie`);
  }

  if (!Array.isArray(d.movers) || d.movers.length < 5) warn.push("movers ma mniej niż 5 wierszy");

  /* Rejestr pozycji. Tu nie chodzi o kompletność, a o spójność: wiersz, który
     sam sobie przeczy, nie wywala strony — po cichu fałszuje skuteczność, czyli
     jedyną liczbę, po którą ten rejestr powstał. Dlatego to BŁĘDY, nie uwagi. */
  for (const p of ["ps", "pc"]){
    const r = d.rejestr?.[p];
    if (!r) continue;                     // rejestr narasta; pierwszy przebieg go nie ma
    for (const [k, o] of Object.entries(r.otwarte || {})){
      if (!o.def) err.push(`rejestr.${p} ${k}: wiersz bez podpisu definicji — nie da się go potem odsiać`);
      if (!Number.isFinite(o.wejscie) || o.wejscie <= 0) err.push(`rejestr.${p} ${k}: cena wejścia ${o.wejscie}`);
      if (!onGrid(o.cel0)) err.push(`rejestr.${p} ${k}: cel ${o.cel0} nie leży na siatce`);
      if (!(o.cel0 > o.wejscie)) err.push(`rejestr.${p} ${k}: cel ${o.cel0} nie jest nad wejściem ${o.wejscie}`);
      /* Opłacalność liczymy od SUFITU LICYTACJI, nie od ceny rynkowej — po cenie
         rynkowej nikt tu nie kupuje, wchodzi się aukcją niżej. Stara wersja tej
         reguły porównywała cel z ceną rynkową i wywalała zdrowe pozycje
         (30.09: pięć przebiegów z rzędu). Wiersze sprzed tej zmiany nie mają
         pola `sufit` i ich po prostu nie sprawdzamy. */
      if (Number.isFinite(o.sufit) && o.sufit > 0){
        if (!onGrid(o.sufit)) err.push(`rejestr.${p} ${k}: sufit ${o.sufit} nie leży na siatce`);
        if (net(o.sufit, o.cel0) <= 0) err.push(`rejestr.${p} ${k}: przy suficie ${o.sufit} netto ${net(o.sufit, o.cel0)} — pozycja do niczego`);
      }
    }
    (r.wyniki || []).forEach((o, i) => {
      const gdzie = `rejestr.${p}.wyniki[${i}] ${o.klucz}`;
      if (!o.def) err.push(`${gdzie}: wynik bez podpisu definicji`);
      if (o.werdykt === "cel" && !Number.isFinite(o.doCelu)) err.push(`${gdzie}: werdykt "cel" bez czasu dojścia`);
      /* Pozycja, która „doszła do celu" w zero minut, nigdy nie była pozycją —
         cel leżał na dzisiejszej cenie. Łapiemy to jako błąd, bo taki wiersz
         dopisuje fałszywe trafienie do skuteczności. */
      if (o.werdykt === "cel" && o.doCelu === 0) err.push(`${gdzie}: trafienie w zero minut — cel leżał na cenie wejścia`);
      if (o.werdykt !== "cel" && Number.isFinite(o.doCelu)) err.push(`${gdzie}: czas dojścia przy werdykcie "${o.werdykt}"`);
      if (o.werdykt === "poziom" && !(o.poziomMin <= o.wejscie)) err.push(`${gdzie}: werdykt "poziom", ale poziom ${o.poziomMin} nie zszedł do wejścia ${o.wejscie}`);
    });
    const sk = d.skutecznosc?.[p];
    if (sk){
      if (sk.znane > sk.probek) err.push(`skutecznosc.${p}: znanych ${sk.znane} więcej niż próbek ${sk.probek}`);
      if (sk.trafienie !== null && (sk.trafienie < 0 || sk.trafienie > 100)) err.push(`skutecznosc.${p}: trafienie ${sk.trafienie}%`);
      if (sk.gotowe && sk.znane === 0) err.push(`skutecznosc.${p}: ogłasza gotowość bez ani jednego znanego wyniku`);
    }
  }

  /* Podpis platformy. Koszty SBC i szereg momentum różnią się między PC i konsolą
     (28.09: 2 550 vs 3 900 na tej samej SBC), więc dane bez podpisu są liczbą bez
     jednostki. Uwaga, nie błąd — stary plik ma prawo wyjść na produkcję. */
  if (d.sbc && d.sbc.platforma !== "console") warn.push("sbc bez podpisu platformy — koszty zależą od platformy");
  if (d.obserwacja && d.obserwacja.platforma !== "console") warn.push("obserwacja bez podpisu platformy — ceny zależą od platformy");

  return { err, warn };
}

if (process.argv[1]?.endsWith("validate.mjs")){
  const file = process.argv[2] || "data.json";
  const { err, warn } = validate(JSON.parse(readFileSync(file, "utf8")));
  warn.forEach(w => console.log("  uwaga:", w));
  if (err.length){ err.forEach(e => console.log("  BŁĄD :", e)); console.log(`\n${file}: ${err.length} błędów — nie publikować`); process.exit(1); }
  console.log(`\n${file}: OK${warn.length ? ` (${warn.length} uwag)` : ""}`);
}
