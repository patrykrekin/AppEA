import { open } from "./lib/browser.mjs";
import { SOURCES, SELECTORS, PLATFORM_SWITCH, CYCLES, OUT, PACING } from "./config.js";
import { patch, read } from "./lib/store.mjs";
import { validate } from "./validate.mjs";
import { listBelow, onGrid, snapDown } from "./lib/grid.mjs";

/* node scrape.mjs fast   — puls rynku i ceny, na które reagujesz w minutach
   node scrape.mjs slow   — okna dobowe i tezy
   Zasada: przy jakimkolwiek błędzie NIE nadpisujemy pliku. */

const cycle = process.argv[2];
if (!CYCLES[cycle]) { console.error("użycie: node scrape.mjs fast|slow"); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const need = k => {
  const s = SELECTORS[k];
  if (!s) throw new Error(`selektor "${k}" nieustawiony — uruchom "node probe.mjs" i uzupełnij config.js`);
  return s;
};

async function go(page, url){
  for (let i = 0; i <= PACING.retries; i++){
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs });
      await page.waitForTimeout(3000);
      return;
    } catch (e) {
      if (i === PACING.retries) throw new Error(`nie wczytano ${url}: ${e.message.split("\n")[0]}`);
      await sleep(3000 * (i + 1));
    }
  }
}

const txt = (page, sel) => page.$eval(sel, e => e.innerText.trim());

/* ---------- ekstraktory ---------- */

async function readMarket(page){
  await go(page, SOURCES.market);
  return {
    index:    { value: await txt(page, need("indexValue")), change: await txt(page, need("indexChange")) },
    momentum: await txt(page, need("momentum"))
  };
}

async function readBands(page, platform){
  await page.evaluate(`(${PLATFORM_SWITCH})(${JSON.stringify(platform)})`);
  await page.waitForTimeout(2500);
  await go(page, SOURCES.cheapest);
  return page.$$eval(need("cheapestRow"), (rows, s) => rows.map(r => ({
    name:   r.querySelector(s.name)?.innerText.trim(),
    rating: parseInt(r.querySelector(s.rating)?.innerText.trim(), 10),
    price:  parseInt((r.querySelector(s.price)?.innerText || "").replace(/[^\d]/g, ""), 10)
  })).filter(x => x.name && x.price), {
    name: need("cheapestName"), rating: need("cheapestRating"), price: need("cheapestPrice")
  });
}

async function readMovers(page){
  await go(page, SOURCES.momentum);
  return page.$$eval(need("moverRow"), (rows, s) => rows.slice(0, 7).map(r => [
    r.querySelector(s.name)?.innerText.trim(),
    r.querySelector(s.price)?.innerText.trim(),
    r.querySelector(s.pct)?.innerText.trim(),
    r.querySelector(s.delta)?.innerText.trim()
  ]), { name: need("moverName"), price: need("moverPrice"), pct: need("moverPct"), delta: need("moverDelta") });
}

/* Z surowych cen pasm buduje wiersze snajperskie.
   Sufit zakupu = dno pasma zaokrąglone w dół (kupujesz TANIEJ niż dno, inaczej nie ma marży).
   Wystawienie = jeden krok pod rynkiem. Wiersze bez sensownego netto wypadają. */
function toSnipeRows(cards){
  return cards
    .filter(c => c.rating >= 86 && onGrid(c.price))
    .map(c => {
      const market = c.price;
      const buy    = snapDown(market * 0.85);
      const list   = listBelow(market);
      return [`${c.name} ${c.rating}`, market, buy, list];
    })
    .filter(([, m, b, l]) => l * 0.95 - b > 0)
    .sort((a, b) => (b[3] * 0.95 - b[2]) - (a[3] * 0.95 - a[2]))
    .slice(0, 12);
}

/* ---------- przebieg ---------- */

const { browser, page } = await open();
const at = Math.floor(Date.now() / 1000);
const stamp = new Date().toLocaleString("pl-PL", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
let fields = {};

try {
  if (cycle === "fast"){
    const m = await readMarket(page);
    await sleep(PACING.betweenPagesMs);

    const ps = toSnipeRows(await readBands(page, "ps"));
    await sleep(PACING.betweenPagesMs);
    const pc = toSnipeRows(await readBands(page, "pc"));
    await page.evaluate(`(${PLATFORM_SWITCH})("ps")`);

    if (!ps.length || !pc.length) throw new Error("puste pasma — nie nadpisuję");

    fields = { at, index: m.index, momentum: m.momentum,
               snipe: { ps: { label:`konsola · ${stamp}`, rows: ps },
                        pc: { label:`PC · ${stamp}`,      rows: pc } } };
    // tier i pos zostają z poprzedniego pliku — zmienia je cykl slow
  } else {
    fields = { at, movers: await readMovers(page) };
  }

  const next = { ...read(OUT), ...fields };
  const { err, warn } = validate(next);
  warn.forEach(w => console.log("uwaga:", w));
  if (err.length){ err.forEach(e => console.log("BŁĄD :", e)); throw new Error(`${err.length} błędów walidacji — nic nie zapisuję`); }

  patch(OUT, fields);
  console.log(`${cycle}: zapisano ${OUT} (${stamp})`);
} catch (e) {
  console.error(`${cycle}: PRZERWANE — ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
