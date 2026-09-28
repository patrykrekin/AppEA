/* Który cykl odpalić w tym przebiegu.

   Nie pytamy GitHuba, który cron przyszedł. 27.09.2026 dostarczył crona z 05:11
   dopiero o 10:30 — przebieg zmarnował się na ruchy dobowe, a pasma i snajpy stały
   w miejscu, więc nasz indeks nie miał z czego policzyć drugiego pomiaru.
   Dokumentacja GitHuba mówi to wprost: zdarzenie `schedule` bywa opóźniane przy
   dużym obciążeniu, a najgorsze są pełne godziny.

   Zamiast ufać etykiecie crona patrzymy, co jest najbardziej przeterminowane.
   Okna godzinowe są bezpiecznikiem: gdyby drogi cykl `top` zaczął padać, poza oknem
   i tak pójdzie `fast`, więc ceny na stronie nie zamarzną przez zepsuty ranking.

   Wypisuje jedno słowo na stdout — workflow bierze je jako argument scrape.mjs. */

import { readFileSync } from "node:fs";

const PRZETERMINOWANY = 10 * 3600;      // top i slow chodzą dwa razy na dobę
const plik = process.env.FUT_DATA || "../data.json";

let d = {};
try { d = JSON.parse(readFileSync(plik, "utf8")); } catch { /* brak pliku = pierwszy raz */ }

const teraz = Math.floor(Date.now() / 1000);
const h     = new Date().getUTCHours();
const stary = t => !t || (teraz - t) >= PRZETERMINOWANY;

const oknoTop  = (h >= 6 && h < 12) || (h >= 16 && h < 22);   // 08–14 i 18–24 w PL
const oknoSlow = (h >= 5 && h < 12) || (h >= 17 && h < 24);

export function wybierz(dane = d, kiedy = teraz, godzina = h){
  const st = t => !t || (kiedy - t) >= PRZETERMINOWANY;
  const oT = (godzina >= 6 && godzina < 12) || (godzina >= 16 && godzina < 22);
  const oS = (godzina >= 5 && godzina < 12) || (godzina >= 17 && godzina < 24);
  /* top NIE jest już wybierany automatycznie. Trwa kilkanaście minut, a puka się
     co pięć — przy jednym torze blokował wszystko, przy osobnym i tak zjadałby
     minuty w kółko, bo po anulowaniu atTop nigdy się nie odświeżał i selektor
     wybierał go bez końca. Odpalamy go osobnym wywołaniem z cycle=top. */
  if (st(dane.atSlow) && oS) return "slow";
  return "fast";
}

if (import.meta.url === `file://${process.argv[1]}`){
  process.stdout.write(wybierz(d, teraz, h));
}

export { PRZETERMINOWANY, oknoTop, oknoSlow };
