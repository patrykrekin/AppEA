import { open } from "./lib/browser.mjs";
import { appendFileSync } from "node:fs";
import { SOURCES, SELECTORS, PACING } from "./config.js";

/* Ile realnie warto odpytywać? Nie zgadujemy — mierzymy.
   Loguje wartość co minutę i raportuje, co ile FAKTYCZNIE się zmienia.
   node calibrate.mjs 180   → mierz przez 3 godziny */

const minutes = parseInt(process.argv[2] || "180", 10);
const { browser, page } = await open();

let prev = null, changes = [], last = Date.now();

for (let i = 0; i < minutes; i++){
  try {
    await page.goto(SOURCES.market, { waitUntil:"domcontentloaded", timeout: PACING.navTimeoutMs });
    await page.waitForTimeout(2500);
    const v = await page.$eval(SELECTORS.momentum || "body", e => e.innerText.trim());
    const now = Date.now();
    if (prev !== null && v !== prev){
      const gap = (now - last) / 60000;
      changes.push(gap); last = now;
      console.log(`${new Date().toISOString()}  ZMIANA: ${prev} → ${v}  (po ${gap.toFixed(0)} min)`);
    }
    appendFileSync("calibrate.log", `${new Date().toISOString()}\t${v}\n`);
    prev = v;
  } catch (e) { console.log("błąd odczytu:", e.message.split("\n")[0]); }
  await new Promise(r => setTimeout(r, 60000));
}

await browser.close();
if (changes.length){
  const avg = changes.reduce((a,b)=>a+b,0) / changes.length;
  console.log(`\n${changes.length} zmian w ${minutes} min. Średni odstęp: ${avg.toFixed(1)} min, najkrótszy: ${Math.min(...changes).toFixed(0)} min.`);
  console.log(`Sensowny cron dla cyklu fast: co ${Math.max(5, Math.round(Math.min(...changes)))} min. Częściej = ten sam wynik i niepotrzebny ruch.`);
} else {
  console.log(`\nŻadnej zmiany w ${minutes} min — źródło odświeża się rzadziej niż mierzyliśmy. Wydłuż pomiar.`);
}
