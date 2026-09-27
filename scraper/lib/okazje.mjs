/* Licznik tanich wystawień — nasza własna miara tego, KIEDY na rynku pojawiają się okazje.

   Skąd to się wzięło: 27.09.2026 taśma Diogo Costy 86 pokazała sprzedaż po 3 000 przy
   dnie pasma 3 900. Takie wystawienia żyją minuty i nie trafiają do żadnego cennika —
   to z nich są pieniądze. Nikt ich nie liczy, bo wszyscy patrzą na ceny, nie na to,
   jak często ceny się psują.

   Liczymy bez dodatkowych wejść na fut.gg: pasma i tak pobiera cykl fast.
   Za okazję uznajemy kartę stojącą co najmniej PROG pod medianą pięciu najtańszych
   w swoim paśmie. Mediana, a nie najtańsza sztuka — inaczej pojedyncze tanie
   wystawienie samo obniżałoby próg i chowało się przed licznikiem.

   Zapisujemy dwie rzeczy:
     · rozkład po godzinach (czas polski) — narasta, 24 wpisy, nigdy nie puchnie
     · krótki log ostatnich pomiarów — do wykresu z dzisiaj

   Godzinę liczymy w strefie Europe/Warsaw na runnerze, żeby strona nie musiała
   zgadywać przesunięcia i żeby zmiana czasu nie rozjechała kubełków. */

import { KOSZYK } from "./indeks.mjs";

export const PROG = 0.10;          // ile pod medianą dna liczy się za okazję
export const LOG_LIMIT = 288;      // doba przy przebiegu co 5 minut

export function godzinaPL(at){
  const s = new Date(at * 1000).toLocaleString("en-GB", {
    timeZone: "Europe/Warsaw", hour: "2-digit", hour12: false
  });
  const h = parseInt(s, 10);
  return Number.isFinite(h) ? h % 24 : null;
}

/** bands: dane z fut.gg, floors: wynik floorsZPasm z TEGO SAMEGO odczytu. */
export function policzOkazje(bands, floors, prog = PROG){
  const pasma = {};
  let razem = 0;
  for (const r of KOSZYK){
    const dno = floors[r];
    if (!(dno > 0)) continue;
    const granica = dno * (1 - prog);
    const n = (bands[r] || []).filter(c => c && Number.isFinite(c.price) && c.price > 0 && c.price <= granica).length;
    pasma[r] = n;
    razem += n;
  }
  return { pasma, razem };
}

/** Dopisuje pomiar do rozkładu godzinowego i do loga. */
export function dopiszOkazje(stan, at, ps, pc, limit = LOG_LIMIT){
  const s = stan && typeof stan === "object" ? stan : {};
  const godziny = { ...(s.godziny || {}) };
  const h = godzinaPL(at);
  if (h !== null){
    const b = godziny[h] || { przebiegow: 0, okazji: 0 };
    godziny[h] = {
      przebiegow: b.przebiegow + 1,
      okazji: b.okazji + (ps?.razem || 0) + (pc?.razem || 0)
    };
  }
  const log = [...(Array.isArray(s.log) ? s.log : []), [at, ps?.razem || 0, pc?.razem || 0]].slice(-limit);
  return { prog: PROG, odKiedy: s.odKiedy || at, godziny, log };
}

/** Godziny posortowane po tym, ile okazji wypada na jeden przebieg.
 *  minPrzebiegow odcina kubełki, w których mamy za mało pomiarów, żeby cokolwiek twierdzić. */
export function najlepszeGodziny(stan, minPrzebiegow = 6){
  const g = (stan && stan.godziny) || {};
  return Object.keys(g)
    .map(h => ({ godzina: +h, ...g[h], naPrzebieg: g[h].przebiegow ? +(g[h].okazji / g[h].przebiegow).toFixed(2) : 0 }))
    .filter(x => x.przebiegow >= minPrzebiegow)
    .sort((a, b) => b.naPrzebieg - a.naPrzebieg);
}
