/* Który cykl odpalić w tym przebiegu.

   Nie pytamy GitHuba, który cron przyszedł. 27.09.2026 dostarczył crona z 05:11
   dopiero o 10:30 — przebieg zmarnował się na ruchy dobowe, a pasma i snajpy stały
   w miejscu, więc nasz indeks nie miał z czego policzyć drugiego pomiaru.
   Dokumentacja GitHuba mówi to wprost: zdarzenie `schedule` bywa opóźniane przy
   dużym obciążeniu, a najgorsze są pełne godziny.

   Zamiast ufać etykiecie crona patrzymy, co jest najbardziej przeterminowane.
   Zostały dwa cykle: `fast` co pięć minut i `slow` dwa razy na dobę. Okno godzinowe
   pilnuje, żeby `slow` wypadał w rozsądnej porze, a nie w środku nocy.

   Wypisuje jedno słowo na stdout — workflow bierze je jako argument scrape.mjs. */

import { readFileSync } from "node:fs";

const PRZETERMINOWANY = 10 * 3600;      // slow chodzi dwa razy na dobę
const plik = process.env.FUT_DATA || "../data.json";

let d = {};
try { d = JSON.parse(readFileSync(plik, "utf8")); } catch { /* brak pliku = pierwszy raz */ }

const teraz = Math.floor(Date.now() / 1000);
const h     = new Date().getUTCHours();
const stary = t => !t || (teraz - t) >= PRZETERMINOWANY;

const oknoSlow = (h >= 5 && h < 12) || (h >= 17 && h < 24);

export function wybierz(dane = d, kiedy = teraz, godzina = h){
  const st = t => !t || (kiedy - t) >= PRZETERMINOWANY;
  const oS = (godzina >= 5 && godzina < 12) || (godzina >= 17 && godzina < 24);
  if (st(dane.atSlow) && oS) return "slow";
  return "fast";
}

if (import.meta.url === `file://${process.argv[1]}`){
  process.stdout.write(wybierz(d, teraz, h));
}

export { PRZETERMINOWANY, oknoSlow };
