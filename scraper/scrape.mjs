import { open } from "./lib/browser.mjs";
import { SOURCES, SEL, CYCLES, OUT, PACING, SNIPE_BANDS, SNIPE_DISCOUNT } from "./config.js";
import { patch, read } from "./lib/store.mjs";
import { validate } from "./validate.mjs";
import { listBelow, onGrid, snapDown, net } from "./lib/grid.mjs";
import { readCard } from "./lib/card.mjs";
import { evaluate, parseAgoMinutes } from "./lib/score.mjs";
import { openPicks, settle, summarize } from "./lib/record.mjs";
import { policz, dopisz, floorsZPasm } from "./lib/indeks.mjs";
import { SEL as S2, TOP_BANDS, TOP_PER_BAND, TOP_COUNT, HOLD_DAYS } from "./config.js";

/* node scrape.mjs fast   — Index, Momentum, pasma, snajpy (oba rynki z jednego wejścia)
   node scrape.mjs slow   — ruchy dobowe
   Przy jakimkolwiek błędzie NIE nadpisujemy pliku. */

/* Ostatni prawdziwy odczyt Index 100 i Momentum z Futbina: 26.09.2026, 22:55.
   Potem Cloudflare zaczął odrzucać serwerownie i przeszliśmy na fut.gg, który tych
   dwóch liczb nie publikuje. Stała jest punktem zerowym zegara "sprzed X h" — bez niej
   pierwszy przebieg po wdrożeniu podstawiłby swój własny czas i strona skłamałaby,
   że indeks jest świeży. */
const INDEX_READ_AT = 1790456100;

const cycle = process.argv[2];
if (!CYCLES[cycle]) { console.error("użycie: node scrape.mjs " + Object.keys(CYCLES).join("|")); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const num   = s => parseInt(String(s).replace(/[^\d]/g, ""), 10);
const pl    = s => String(s).replace(".", ",");   // 124.15 → 124,15

async function go(page, url){
  for (let i = 0; i <= PACING.retries; i++){
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs });
      await page.waitForTimeout(3500);
      return;
    } catch (e) {
      if (i === PACING.retries) throw new Error(`nie wczytano ${url}: ${e.message.split("\n")[0]}`);
      await sleep(3000 * (i + 1));
    }
  }
}

/* ---------- Futbin: Index 100 i Momentum, obie platformy naraz ---------- */
async function readMarket(page){
  await go(page, SOURCES.market);
  const out = await page.evaluate(sel => {
    const grab = p => {
      const s = document.querySelector(sel.summary.replace("{p}", p));
      const m = document.querySelector(sel.momentum.replace("{p}", p));
      if (!s || !m) return null;
      // "124.15\n+3.85%\nOpen: …" → pierwsza linia to wartość indeksu
      const value  = s.innerText.trim().split("\n")[0].trim();
      const change = (s.querySelector(sel.change) || {}).innerText?.trim() || null;
      const mm     = m.innerText.match(/(\d+(?:\.\d+)?)\s*%/);
      return { value, change, momentum: mm ? mm[1] : null, mood: m.innerText.trim().split("\n").pop().trim() };
    };
    return {
      ps: grab("ps"), pc: grab("pc"),
      /* Diagnostyka na wypadek, gdy serwer dostaje inną stronę niż przeglądarka:
         Cloudflare, zgoda na ciasteczka albo przebudowa Futbina wyglądają tu inaczej. */
      _diag: {
        title: document.title,
        psOnly: document.querySelectorAll(".platform-ps-only").length,
        summaryCount: document.querySelectorAll("[class*=market-main-index-summary]").length,
        momentumCount: document.querySelectorAll("[class*=market-momentum]").length,
        tekst: document.body.innerText.replace(/\s+/g, " ").slice(0, 220)
      }
    };
  }, { summary: SEL.market.summary, change: SEL.market.change, momentum: SEL.market.momentum });
  return out;
}

/* ---------- Futbin: najtańsze karty w pasmach, obie platformy ---------- */
async function readBands(page){
  await go(page, SOURCES.cheapest);
  return page.evaluate(sel => {
      /* Futbin i fut.gg skracają ceny: "650", "2K", "3.8K", "27.25K", "1.84M".
         Samo wycięcie nie-cyfr dawało 38 zamiast 3 800 — sprawdzone na żywej stronie. */
      const cena = s => {
        const t = String(s || "").trim().replace(/[\s\u00A0]/g, "").toUpperCase();
        const m = t.match(/^([\d.,]+)([KM])?$/);
        if (!m) return NaN;
        let n = parseFloat(m[1].replace(/,/g, ""));
        if (m[2] === "K") n *= 1000;
        if (m[2] === "M") n *= 1000000;
        return Math.round(n);
      };
      const read = p => {
      const cols = [...document.querySelectorAll(sel.column.replace("{p}", p))];
      const out = {};
      for (const col of cols){
        const head = col.querySelector(sel.head);
        if (!head) continue;
        const rating = parseInt(head.innerText.trim(), 10);
        if (!Number.isFinite(rating)) continue;
        out[rating] = [...col.querySelectorAll(sel.row)].map(r => ({
          name:  (r.querySelector(sel.name) || {}).innerText?.trim(),
          pos:   ((r.querySelector(sel.pos) || {}).innerText || "").replace(/[()]/g, "").trim(),
          price: cena((r.querySelector(sel.price) || {}).innerText)
        })).filter(x => x.name && Number.isFinite(x.price));
      }
      return out;
    };
    return { ps: read("ps"), pc: read("pc") };
  }, { column: SEL.cheapest.column, head: SEL.cheapest.head, row: SEL.cheapest.row,
       name: SEL.cheapest.name, pos: SEL.cheapest.pos, price: SEL.cheapest.price });
}

/* ---------- fut.gg: ruchy dobowe ---------- */
async function readMovers(page){
  await go(page, SOURCES.movers);
  return page.evaluate(sel => {
    return [...document.querySelectorAll(sel.row)].slice(0, 7).map(r => {
      const alt = (r.querySelector(sel.img) || {}).alt || "";        // "Necib - 87 - Base Hero"
      const [name, rating] = alt.split(" - ");
      const lines = r.innerText.trim().split("\n").map(s => s.trim()).filter(Boolean);
      /* Kolejność linii w wierszu jest stała: pozycja, rating fut.gg, cena, zmiana %, delta.
         Szukanie "pierwszej liczby" łapało rating (87.4) zamiast ceny (370K). */
      const pos   = lines[0] || "";
      const price = lines[2] || "";
      const pct   = lines.find(l => /%$/.test(l)) || "";
      const delta = lines[lines.length - 1] || "";
      return [`${name} ${rating} ${pos}`.trim(), price, pct, delta];
    }).filter(r => r[0] && r[1]);
  }, { row: SEL.movers.row, img: SEL.movers.img });
}

/* Z dna pasma robi wiersz snajperski.
   Sufit zakupu jest PONIŻEJ dna rynku — kupujesz taniej niż najtańsza oferta,
   inaczej nie ma z czego wziąć marży. Wystawienie: jeden krok pod rynkiem. */
function toSnipeRows(bands){
  /* Po równo z każdego pasma, nie globalny top. Sortowanie po zysku netto wypychało
     wszystkie 86-ki, bo 87-ki dają dwa razy więcej na sztukę — a to właśnie na 86
     mamy jedyne zmierzone trafienie i to ono jest w zasięgu mniejszych budżetów. */
  const naPasmo = Math.max(1, Math.floor(12 / SNIPE_BANDS.length));
  const rows = [];

  for (const band of SNIPE_BANDS){
    const zPasma = [];
    for (const c of (bands[band] || [])){
      if (!onGrid(c.price)) continue;
      const market = c.price;
      const buy    = snapDown(market * (1 - SNIPE_DISCOUNT));
      const list   = listBelow(market);
      if (net(buy, list) <= 0) continue;
      zPasma.push([`${c.name} ${band}${c.pos ? " " + c.pos : ""}`, market, buy, list]);
    }
    zPasma.sort((a, b) => net(b[2], b[3]) - net(a[2], a[3]));
    rows.push(...zPasma.slice(0, naPasmo));
  }

  // najtańsze wejścia na górze — tam trafia większość budżetów
  return rows.sort((a, b) => a[2] - b[2]).slice(0, 12);
}

/* ---------- fut.gg: dno pasm, obie platformy ----------
   Futbin odpada dla serwerów — Cloudflare zwraca "Just a moment...".
   fut.gg przepuszcza. Format cen tutaj to "1,700" i "19,000", nie "1.7K".
   Platformę przełącza się kliknięciem; stan siedzi w ciasteczku, URL się nie zmienia.
   Wszystko poniżej odczytane z żywej strony 27.09.2026. */
async function readBandsGG(page){
  await go(page, SOURCES.poolGG);

  const zbierz = () => page.evaluate(sel => {
    const txt = e => (e && e.innerText ? e.innerText : "").trim();
    const cena = s => {
      const t = String(s || "").trim().replace(/[\s\u00A0]/g, "").toUpperCase();
      const m = t.match(/^([\d.,]+)([KM])?$/);
      if (!m) return NaN;
      let n = parseFloat(m[1].replace(/,/g, ""));
      if (m[2] === "K") n *= 1000;
      if (m[2] === "M") n *= 1000000;
      return Math.round(n);
    };
    const re = new RegExp(sel.hrefTest);
    const out = {};
    for (const a of document.querySelectorAll(sel.row)){
      if (!re.test(a.getAttribute("href") || "")) continue;
      const l = txt(a).split("\n").map(x => x.trim()).filter(Boolean);
      const rating = parseInt(l[3], 10), price = cena(l[1]);
      if (!l[0] || !Number.isFinite(rating) || !Number.isFinite(price)) continue;
      (out[rating] = out[rating] || []).push({
        name: l[0], price, pos: l[2],
        url: new URL(a.getAttribute("href"), location.origin).href
      });
    }
    return out;
  }, S2.pool);

  const ps = await zbierz();                                   // Console jest domyślne

  const przelaczone = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => (x.innerText || "").trim() === "PC");
    if (!b) return false;
    b.click();
    return true;
  });
  if (!przelaczone) throw new Error("nie znalazłem przycisku PC na fut.gg");
  await sleep(2500);
  const pc = await zbierz();

  if (!Object.keys(ps).length || !Object.keys(pc).length) throw new Error("puste pasma z fut.gg");
  return { ps, pc };
}

/* ---------- ranking "Kup teraz" ---------- */

/* Pula kandydatów z fut.gg — wiersz jest linkiem do karty, więc nazwa i URL idą razem. */
async function readPool(page){
  await go(page, SOURCES.poolGG);
  return page.evaluate(sel => {
    const txt = e => (e && e.innerText ? e.innerText : "").trim();
      /* Futbin i fut.gg skracają ceny: "650", "2K", "3.8K", "27.25K", "1.84M".
         Samo wycięcie nie-cyfr dawało 38 zamiast 3 800 — sprawdzone na żywej stronie. */
      const cena = s => {
        const t = String(s || "").trim().replace(/[\s\u00A0]/g, "").toUpperCase();
        const m = t.match(/^([\d.,]+)([KM])?$/);
        if (!m) return NaN;
        let n = parseFloat(m[1].replace(/,/g, ""));
        if (m[2] === "K") n *= 1000;
        if (m[2] === "M") n *= 1000000;
        return Math.round(n);
      };
    const re = new RegExp(sel.hrefTest);
    return [...document.querySelectorAll(sel.row)]
      .filter(a => re.test(a.getAttribute("href") || ""))
      .map(a => {
        const l = txt(a).split("\n").map(x => x.trim()).filter(Boolean);
        return { name: l[0], price: cena(l[1]),
                 pos: l[2], rating: parseInt(l[3], 10),
                 url: new URL(a.getAttribute("href"), location.origin).href };
      })
      .filter(x => x.name && Number.isFinite(x.rating));
  }, S2.pool);
}

async function buildTop(page){
  const pool = await readPool(page);

  const candidates = [];
  for (const band of TOP_BANDS){
    candidates.push(...pool.filter(c => c.rating === band).slice(0, TOP_PER_BAND));
  }
  if (!candidates.length) throw new Error("pusta pula kandydatów");

  const scored = [], skipped = [];
  for (const c of candidates){
    try {
      await sleep(900);                                   // nie waliMY w serwis bez przerwy
      const { bin, sales } = await readCard(page, c.url, PACING.navTimeoutMs);
      const ev = evaluate({ bin, sales: sales.map(s => ({ minutesAgo: parseAgoMinutes(s.ago), price: s.price })) });
      if (!ev.ok){ skipped.push(`${c.name} ${c.rating}: ${ev.reason}`); continue; }
      scored.push({ name: `${c.name} ${c.rating}${c.pos ? " " + c.pos : ""}`, url: c.url, rating: c.rating, ...ev });
    } catch (e) { skipped.push(`${c.name} ${c.rating}: ${e.message.split("\n")[0]}`); }
  }

  scored.sort((a, b) => b.score - a.score);
  return { picks: scored.slice(0, TOP_COUNT), checked: candidates.length, skipped };
}

/* ---------- przebieg ---------- */
const { browser, page } = await open();
const at = Math.floor(Date.now() / 1000);
const stamp = new Date().toLocaleString("pl-PL", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
let fields = {};

try {
  if (cycle === "fast"){
    const bands = await readBandsGG(page);
    const ps = toSnipeRows(bands.ps), pc = toSnipeRows(bands.pc);
    if (!ps.length || !pc.length) throw new Error("brak wierszy snajperskich po filtrach");

    const prev = read(OUT);

    /* Własny indeks z dna pasm. PC i konsola liczone osobno — to dwa rynki.
       Historia siedzi w data.json, więc szereg czasowy buduje się sam. */
    const histPrev = prev.hist || {};
    const histPs = dopisz(histPrev.ps, at, floorsZPasm(bands.ps));
    const histPc = dopisz(histPrev.pc, at, floorsZPasm(bands.pc));

    fields = {
      at,
      hist: { ps: histPs, pc: histPc },
      nasz: { ps: policz(histPs), pc: policz(histPc) },
      /* Index 100 i Momentum są tylko na Futbinie, a ten blokuje serwerownie.
         Przenosimy poprzednie wartości bez zmian i zapisujemy, kiedy były świeże,
         żeby strona mogła uczciwie pokazać ich wiek zamiast udawać, że są z teraz. */
      index:    prev.index,
      momentum: prev.momentum,
      mood:     prev.mood,
      indexAt:  prev.indexAt || INDEX_READ_AT,

      snipe: { ps: { label: `konsola · ${stamp}`, rows: ps },
               pc: { label: `PC · ${stamp}`,      rows: pc } },
      tier: {
        ...prev.tier,
        p83: String(bands.ps[83]?.[0]?.price ?? ""),
        p84: String(bands.ps[84]?.[0]?.price ?? ""),
        p85: String(bands.ps[85]?.[0]?.price ?? ""),
        s86: (bands.ps[86] || []).slice(0, 3).map(c => `${c.name} ${c.price}`).join(", "),
        s87: (bands.ps[87] || []).slice(0, 3).map(c => `${c.name} ${c.price}`).join(", ")
      }
    };
  } else if (cycle === "top"){
    const { picks, checked, skipped } = await buildTop(page);
    console.log(`sprawdzone ${checked} kart, przeszło ${picks.length}`);
    skipped.slice(0, 8).forEach(x => console.log("  odrzut:", x));
    if (!picks.length) console.log("Żadna karta nie przeszła progów. Publikuję pustą listę — to uczciwsza odpowiedź niż naciągana piątka.");

    const prev = read(OUT);
    const rec0 = prev.record || { open: [], closed: [] };
    const rec1 = { ...rec0, open: openPicks(rec0, picks, at) };
    const rec2 = await settle(rec1, at, HOLD_DAYS, async o => {
      try {
        const { sales } = await readCard(page, o.url, PACING.navTimeoutMs);
        const prices = sales.slice(0, 20).map(s => s.price).sort((a, b) => a - b);
        return prices.length ? prices[prices.length >> 1] : null;
      } catch { return null; }
    });

    fields = {
      at,
      /* checked jedzie razem z wierszami, żeby strona umiała odróżnić
         "jeszcze nie sprawdzaliśmy" od "sprawdziliśmy i nic nie przeszło". */
      top: { label: stamp, checked, rows: picks.map(p => ({
        name: p.name, sufit: p.sufit, fair: p.fair, listAt: p.listAt,
        zysk: p.zysk, okazje: p.okazje, probek: p.probek, szansa: p.szansa, plynnosc: p.plynnosc,
        sellBy: new Date((at + HOLD_DAYS * 86400) * 1000).toLocaleDateString("pl-PL", { weekday:"long", day:"2-digit", month:"2-digit" })
      })) },
      record: { ...rec2, summary: summarize(rec2.closed) }
    };
  } else {
    const movers = await readMovers(page);
    if (movers.length < 5) throw new Error(`tylko ${movers.length} wierszy ruchów — nie nadpisuję`);
    fields = { at, movers };
  }

  const { err, warn } = validate({ ...read(OUT), ...fields });
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
