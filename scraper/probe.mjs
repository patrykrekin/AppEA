import { open } from "./lib/browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { SOURCES, PACING } from "./config.js";

/* Zrzuca realną strukturę stron, żeby dało się uzupełnić SELECTORS
   patrząc na to, co jest, a nie na to, co się komuś wydaje. */


const sleep = ms => new Promise(r => setTimeout(r, ms));

const { browser, page } = await open();
mkdirSync("probe", { recursive: true });

for (const [key, url] of Object.entries(SOURCES)){
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs });
    await page.waitForTimeout(4000);

    const report = await page.evaluate(() => {
      const path = el => {
        const out = [];
        for (let e = el; e && e.nodeType === 1 && out.length < 4; e = e.parentElement){
          let s = e.tagName.toLowerCase();
          if (e.id) { out.unshift("#" + e.id); break; }
          if (e.className && typeof e.className === "string")
            s += "." + e.className.trim().split(/\s+/).slice(0, 2).join(".");
          out.unshift(s);
        }
        return out.join(" > ");
      };
      return {
        title: document.title,
        tables: [...document.querySelectorAll("table")].slice(0, 6).map(t => ({
          selector: path(t),
          headers: [...t.querySelectorAll("th")].map(h => h.innerText.trim()).slice(0, 12),
          firstRow: [...(t.querySelector("tbody tr")?.children || [])].map(c => c.innerText.trim()).slice(0, 12),
          rows: t.querySelectorAll("tbody tr").length
        })),
        // wszystko, co wygląda na liczbę z przecinkiem lub cenę — kandydaci na Index/Momentum
        numbers: [...document.querySelectorAll("span,div,strong,b,p,h1,h2,h3")]
          .filter(e => e.children.length === 0 && /^[+-]?[\d\s.,]+%?$/.test(e.innerText.trim()) && e.innerText.trim().length > 1)
          .slice(0, 40)
          .map(e => ({ text: e.innerText.trim(), selector: path(e) }))
      };
    });

    writeFileSync(`probe/${key}.json`, JSON.stringify(report, null, 2));
    console.log(`${key}: "${report.title}" — ${report.tables.length} tabel, ${report.numbers.length} kandydatów na liczby → probe/${key}.json`);
  } catch (e) {
    console.log(`${key}: BŁĄD — ${e.message.split("\n")[0]}`);
  }
  await sleep(PACING.betweenPagesMs);
}

await browser.close();
console.log("\nOtwórz pliki w ./probe/ i uzupełnij SELECTORS w config.js.");
