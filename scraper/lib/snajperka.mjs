/* Wiersze snajperskie: z pasm fut.gg robi konkretne "kup do X, wystaw za Y".

   Wydzielone ze scrape.mjs 28.09.2026, żeby dało się to przetestować bez
   odpalania przeglądarki — ta tabela jest najbardziej widoczną rzeczą na
   stronie i właśnie w niej siedział błąd opisany niżej.

   Zależności trzymamy w argumentach, nie w imporcie config.js: dzięki temu
   moduł jest czystą funkcją i test może podać własne progi. */

import { listBelow, onGrid, snapDown, net } from "./grid.mjs";

export const PASMA = [86, 87];   // domyślne tylko na wypadek wywołania bez argumentu
export const RABAT = 0.15;
export const MIN_ODCZYTOW = 6;
export const LIMIT = 12;         // ile wierszy oddajemy stronie

/* 28.09.2026, wieczorem. Do tej pory i cel sprzedaży, i limit kupna liczyły się
   z `c.price` — czyli z NAJTAŃSZEJ OFERTY z jednego odczytu. To jest próbka n=1,
   z definicji odstająca (jest najtańsza, bo odstaje), a przy odświeżaniu co pięć
   minut zwykle już nieistniejąca: z rejestru przeżywalności 22 z 26 tanich
   wystawień znika przed następnym odczytem.

   Co to robiło: Diogo Costa 86, odczyt 23:05, oferta 3 800 → cel 3 700. Własny
   poziom tej karty ze 118 pomiarów stał wtedy na 4 005, a sześć minut później
   fut.gg podawał 4 100. Kazaliśmy wystawić 300 monet pod normalną ceną karty.
   Zamysł formuły był dobry — podciąć rynek o krok, żeby sztuka zeszła — tylko
   podcinała ofertę sprzed sześciu minut, której już nie było.

   Poziom NIE jest inną wielkością. aktualizujPoziomy jest karmiony z tych samych
   pasm, więc poziom to wykładnicza średnia dokładnie tego samego: gdzie zwykle
   stoi najtańsza oferta tej karty. Ta sama liczba, próbka 118 zamiast 1. Ten sam
   rachunek robi już policzInwestycje (`cel = listBelow(w.p)`) — do teraz jedna
   strona liczyła cel sprzedaży tej samej karty na dwa sposoby.

   ASYMETRIA jest celowa i to ona jest tu istotna. Poziom się spóźnia: gdy pasmo
   naprawdę leci w dół, siedzi nad rynkiem godzinami. Gdyby limit kupna szedł
   z poziomu, kazalibyśmy przepłacać — a to twarda strata. Więc:

     · cel sprzedaży  ← poziom            (jedna odstająca oferta nie zaniża celu)
     · limit kupna    ← min(poziom, oferta)  (nigdy powyżej tego, co potwierdza odczyt)

   Za wysoki cel = karta stoi. Za wysoki limit = tracisz monety. Zabezpieczenie
   idzie tam, gdzie boli. Karta bez dojrzałego poziomu leci po staremu, z oferty,
   i wiersz to oznacza — lepiej powiedzieć "z jednego odczytu" niż udawać pomiar. */
export function toSnipeRows(bands, poziomy, pasma = PASMA, rabat = RABAT, minOdczytow = MIN_ODCZYTOW){
  /* Po równo z każdego pasma, nie globalny top. Sortowanie po zysku netto wypychało
     wszystkie 86-ki, bo 87-ki dają dwa razy więcej na sztukę — a to właśnie na 86
     mamy jedyne zmierzone trafienie i to ono jest w zasięgu mniejszych budżetów. */
  const naPasmo = Math.max(1, Math.floor(LIMIT / pasma.length));
  const poz = (poziomy && typeof poziomy === "object") ? poziomy : {};
  const rows = [];

  for (const band of pasma){
    const zPasma = [];
    for (const c of (bands[band] || [])){
      if (!onGrid(c.price)) continue;
      const market = c.price;

      const w = poz[`${c.name} ${band}`];
      const dojrzaly = !!(w && w.p > 0 && (w.n || 0) >= minOdczytow);
      /* Poziom zaciskamy do siatki, bo średnia wykładnicza daje 4005, a takiej
         ceny nie da się wpisać w grze. */
      const odniesienie = dojrzaly ? snapDown(Math.round(w.p)) : market;
      if (!(odniesienie > 0)) continue;

      const list = listBelow(odniesienie);
      const buy  = snapDown(Math.min(odniesienie, market) * (1 - rabat));
      if (net(buy, list) <= 0) continue;

      zPasma.push([
        `${c.name} ${band}${c.pos ? " " + c.pos : ""}`, market, buy, list,
        dojrzaly ? Math.round(w.p) : null,        // [4] poziom, z którego jest cel
        dojrzaly ? (w.n || 0) : 0                 // [5] ile pomiarów za tym stoi
      ]);
    }
    zPasma.sort((a, b) => net(b[2], b[3]) - net(a[2], a[3]));
    rows.push(...zPasma.slice(0, naPasmo));
  }

  // najtańsze wejścia na górze — tam trafia większość budżetów
  return rows.sort((a, b) => a[2] - b[2]).slice(0, LIMIT);
}