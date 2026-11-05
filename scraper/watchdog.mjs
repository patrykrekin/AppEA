/* Awaryjny zegar: nie duplikuje działającego zewnętrznego crona.
   Przy braku świeżych danych uruchamia tylko brakujący cykl.
   Githubowy schedule jest best effort; ten watchdog jest zabezpieczeniem,
   nie obietnicą idealnych odstępów czasowych. */
import { readFileSync } from "node:fs";
import { wybierz } from "./cykl.mjs";

export const MAX_FAST = 12 * 60;
export const MAX_SLOW = 12 * 3600;

export function wybierzRatunek(dane, teraz = Math.floor(Date.now()/1000), godzina = new Date().getUTCHours()){
  const wiekFast = teraz - Number(dane?.atFast || dane?.at || 0);
  const wiekSlow = teraz - Number(dane?.atSlow || 0);
  // Najważniejsze są ceny. Przy martwym fast nie próbujemy zamiast niego slow.
  if (!Number.isFinite(wiekFast) || wiekFast >= MAX_FAST) return "fast";
  if (wiekSlow >= MAX_SLOW && wybierz(dane, teraz, godzina) === "slow") return "slow";
  return "skip";
}

if (import.meta.url === `file://${process.argv[1]}`){
  let dane = {};
  try { dane = JSON.parse(readFileSync(process.env.FUT_DATA || "./data.json", "utf8")); }
  catch (e) { console.error("Nie dało się odczytać danych:", e.message, "— wymuszam fast"); }
  process.stdout.write(wybierzRatunek(dane));
}
