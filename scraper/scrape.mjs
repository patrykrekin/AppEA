import { open } from "./lib/browser.mjs";
import { SOURCES, SEL, CYCLES, OUT, PACING, SNIPE_BANDS, SNIPE_DISCOUNT } from "./config.js";
import { patch, read } from "./lib/store.mjs";
import { validate } from "./validate.mjs";
import { listBelow, onGrid, snapDown, net } from "./lib/grid.mjs";
import { policz, dopisz, floorsZPasm } from "./lib/indeks.mjs";
import { policzOkazje, dopiszOkazje, aktualizujPoziomy, aktualizujPoziomyD, policzInwestycje } from "./lib/okazje.mjs";
import { readSbc, dniDo, dopiszKoszty } from "./lib/sbc.mjs";
import { zWierszy, dopiszRuchy, odbicia } from "./lib/ruchy.mjs";

/* Budżet czasu na całą watchlistę. Przy zdrowej stronie karta schodzi w ~3 s,
   więc osiem sztuk to ~25 s. Budżet jest na wypadek, gdy fut.gg zwalnia i każda
   karta dobija do pełnego czekania — wtedy pętla urywa się sama, zamiast
   rozjechać pięciominutowy harmonogram tak jak cykl `top` 27.09.
   Sprawdzenie jest PRZED kartą, więc przekroczenie to najwyżej jeden odczyt. */
/* Cztery strony momentum w cyklu fast: dwie pierwsze to najwięksi spadkowicze,
   dwie ostatnie najwięksi rosnący. Dokładnie ta populacja, o którą chodzi —
   kandydaci na odbicie i potwierdzenia odbicia. Reszta rozkładu to karty, które
   prawie nie drgnęły, więc nie ma czego zapisywać.
   Budżet 45 s: cztery ładowania po ~8 s z zapasem. Sprawdzenie jest PRZED stroną,
   więc przekroczenie to najwyżej jedno wejście. */
const RUCHY_BUDZET_MS = 45000;
import { SEL as S2 } from "./config.js";

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
/* Lista momentum na fut.gg jest posortowana rosnąco po zmianie, więc strona 1 to
   sami spadający, a rosnący siedzą na OSTATNIEJ stronie. Do 28.09.2026 czytaliśmy
   tylko pierwszą i kolumna "Rosną" była pusta zawsze — nie dlatego, że rynek stał,
   tylko dlatego, że patrzyliśmy w jedno miejsce. Sprawdzone: strona 10 miała
   +37%, +40% i +46%. */
const MOVERS_SPADKI = 7;
const MOVERS_WZROSTY = 5;

function zbierzMovers(page){
  return page.evaluate(sel => {
    return [...document.querySelectorAll(sel.row)].map(r => {
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

const procent = w => parseFloat(String(w[2] || "").replace("%", "").replace(",", "."));

/* Numery stron do przeczytania w cyklu fast: dwie pierwsze i dwie ostatnie.
   Liczbę stron czytamy z paginacji, a nie wpisujemy na sztywno — 28.09 było ich
   dziesięć, ale to zależy od tego, ile kart akurat się rusza. */
async function stronyMomentum(page){
  await go(page, SOURCES.movers);
  const ostatnia = await page.evaluate(() => {
    const n = [...document.querySelectorAll('a[href*="momentum"]')]
      .map(a => { const m = (a.getAttribute("href") || "").match(/page=(\d+)/); return m ? +m[1] : 1; });
    return n.length ? Math.max(...n) : 1;
  });
  /* Wiersze pierwszej strony oddajemy od razu — jesteśmy już na niej, więc
     wchodzenie na nią drugi raz w pętli byłoby darmowym marnowaniem sekund. */
  const chce = [2, ostatnia - 1, ostatnia].filter(n => n >= 2 && n <= ostatnia);
  return { pozostale: [...new Set(chce)], wiersze1: await zbierzMovers(page) };
}

async function readMovers(page){
  await go(page, SOURCES.movers);
  const spadki = (await zbierzMovers(page)).filter(w => procent(w) < 0).slice(0, MOVERS_SPADKI);

  const ostatnia = await page.evaluate(() => {
    const n = [...document.querySelectorAll('a[href*="momentum"]')]
      .map(a => { const m = (a.getAttribute("href") || "").match(/page=(\d+)/); return m ? +m[1] : 1; });
    return n.length ? Math.max(...n) : 1;
  });

  /* Ogon bywa krótki — bierzemy dwie ostatnie strony, żeby nie zostać z jednym wierszem. */
  const wzrosty = [];
  for (const nr of [ostatnia, ostatnia - 1]){
    if (nr < 2 || wzrosty.length >= MOVERS_WZROSTY) continue;
    try {
      await go(page, `${SOURCES.movers}?page=${nr}`);
      for (const w of await zbierzMovers(page)) if (procent(w) > 0) wzrosty.push(w);
    } catch (e) { console.log(`ruchy: strona ${nr} nie wczytana — ${String(e.message || e).split("\n")[0]}`); }
  }
  wzrosty.sort((a, b) => procent(b) - procent(a));

  console.log(`ruchy: ${spadki.length} spadających, ${wzrosty.length} rosnących`);
  return [...spadki, ...wzrosty.slice(0, MOVERS_WZROSTY)];
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

/* Strona potrzebuje nazw konkretnych kart do kalendarza, nie samej ceny pasma.
   Bierzemy kilku najtańszych graczy z każdego ratingu i platformy. */
function cardsForCalendar(bands){
  const cards = {};
  for (const rating of [83, 84, 85, 86, 87, 88, 89]){
    cards[rating] = (bands[rating] || []).slice(0, 5).map(c => ({
      name: `${c.name} ${rating}${c.pos ? ` ${c.pos}` : ""}`.trim(),
      price: c.price
    }));
  }
  return cards;
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
    const floorsPs = floorsZPasm(bands.ps);
    const floorsPc = floorsZPasm(bands.pc);
    const histPs = dopisz(histPrev.ps, at, floorsPs);
    const histPc = dopisz(histPrev.pc, at, floorsPc);

    /* Okazja to karta tania WZGLĘDEM SIEBIE, nie względem pasma. Najpierw liczymy
       na poziomach sprzed tego odczytu — inaczej dzisiejsza tania cena sama
       obniżyłaby próg, który ma pobić — a dopiero potem poziomy aktualizujemy. */
    const poprzPoziomy = (prev.okazje && prev.okazje.poziomy) || {};
    const okazjePs = policzOkazje(bands.ps, poprzPoziomy.ps);
    const okazjePc = policzOkazje(bands.pc, poprzPoziomy.pc);
    okazjePs.poziomy = aktualizujPoziomy(poprzPoziomy.ps, bands.ps, at);
    okazjePc.poziomy = aktualizujPoziomy(poprzPoziomy.pc, bands.pc, at);

    /* Drugi, wolniejszy poziom: kilkanaście godzin pamięci zamiast godziny.
       Z niego liczymy pozycje inwestycyjne — kartę, która naprawdę zeszła niżej
       i stoi tam od godzin, a nie mignięcie, które zabierze bot. Pozycje liczymy
       na poziomach SPRZED tego odczytu, tak samo jak okazje. */
    const poprzD = (prev.okazje && prev.okazje.poziomyD) || {};
    const inwestycje = {
      ps: policzInwestycje(bands.ps, poprzD.ps),
      pc: policzInwestycje(bands.pc, poprzD.pc)
    };
    okazjePs.poziomyD = aktualizujPoziomyD(poprzD.ps, poprzPoziomy.ps, bands.ps, at);
    okazjePc.poziomyD = aktualizujPoziomyD(poprzD.pc, poprzPoziomy.pc, bands.pc, at);
    console.log(`inwestycje: konsola ${inwestycje.ps.length} (w zasięgu ${inwestycje.ps.filter(x => x.wzasiegu).length}), PC ${inwestycje.pc.length}`);
    console.log(`okazje: konsola ${okazjePs.razem}, PC ${okazjePc.razem} (>10% pod własnym poziomem)`);

    /* Szereg cen z momentum. Zastąpił watchlistę na stronach kart, bo tamte ceny
       stoją za podpisanym zapytaniem (403 z runnera) — szczegóły w lib/ruchy.mjs.
       Krok jest opcjonalny: własny try i własny budżet czasu. Nieudany odczyt
       ruchów NIE może zabrać pasm, indeksu ani okazji. */
    let obserwacja = prev.obserwacja || null;
    /* Diagnostyka leci do data.json, nie tylko do loga w Actions — awarię widać
       wtedy z zewnątrz, bez przeklejania logów. */
    const diag = [];
    try {
      const start = Date.now();
      const { pozostale, wiersze1 } = await stronyMomentum(page);
      const wiersze = [...wiersze1];
      diag.push(`strona 1: ${wiersze1.length} wierszy`);
      for (const nr of pozostale){
        if (Date.now() - start > RUCHY_BUDZET_MS){
          diag.push(`budżet czasu wyczerpany po ${wiersze.length} wierszach`);
          break;
        }
        try {
          await go(page, `${SOURCES.movers}?page=${nr}`);
          const w = await zbierzMovers(page);
          wiersze.push(...w);
          diag.push(`strona ${nr}: ${w.length} wierszy`);
        } catch (e) {
          diag.push(`strona ${nr}: BŁĄD ${String(e.message || e).split("\n")[0].slice(0, 100)}`);
        }
      }
      const wpisy = zWierszy(wiersze);
      diag.push(`wierszy=${wiersze.length} sparsowanych=${wpisy.length} spadków=${wpisy.filter(x => x.zmiana24 < 0).length}`);
      if (wpisy.length){
        obserwacja = dopiszRuchy(prev.obserwacja, at, wpisy);
        const wraca = odbicia(obserwacja, at).length;
        console.log(`ruchy: ${wpisy.length} wpisów, ${Object.keys(obserwacja.karty).length} w szeregu, ${wraca} zawraca, ${Math.round((Date.now() - start) / 1000)} s`);
      } else {
        console.log("ruchy: nic nie sparsowałem — zostawiam poprzedni szereg");
      }
    } catch (e) {
      const m = String(e.message || e).split("\n")[0].slice(0, 200);
      diag.push("KROK PRZERWANY: " + m);
      console.log("ruchy: " + m + " — zostawiam poprzedni szereg");
    }
    obserwacja = { at, karty: (obserwacja && obserwacja.karty) || {}, diag: diag.slice(0, 12) };

    fields = {
      at, atFast: at,
      hist: { ps: histPs, pc: histPc },
      nasz: { ps: policz(histPs), pc: policz(histPc) },
      okazje: dopiszOkazje(prev.okazje, at, okazjePs, okazjePc),
      inwestycje,
      ...(obserwacja ? { obserwacja } : {}),
      /* Index 100 i Momentum są tylko na Futbinie, a ten blokuje serwerownie.
         Przenosimy poprzednie wartości bez zmian i zapisujemy, kiedy były świeże,
         żeby strona mogła uczciwie pokazać ich wiek zamiast udawać, że są z teraz. */
      index:    prev.index,
      momentum: prev.momentum,
      mood:     prev.mood,
      /* Żaden przebieg nie czyta już Futbina, więc znacznik nie może być nowszy niż
         stała. Zaciskamy go w dół, bo wcześniejsza wersja zdążyła wpisać czas swojego
         własnego przebiegu i sam warunek "|| stała" by tego nie odkręcił. */
      indexAt:  Math.min(prev.indexAt || INDEX_READ_AT, INDEX_READ_AT),

      snipe: { ps: { label: `konsola · ${stamp}`, rows: ps },
               pc: { label: `PC · ${stamp}`,      rows: pc } },
      tier: {
        ...prev.tier,
        cards: { ps: cardsForCalendar(bands.ps), pc: cardsForCalendar(bands.pc) },
        p83: String(bands.ps[83]?.[0]?.price ?? ""),
        p84: String(bands.ps[84]?.[0]?.price ?? ""),
        p85: String(bands.ps[85]?.[0]?.price ?? ""),
        s86: (bands.ps[86] || []).slice(0, 3).map(c => `${c.name} ${c.price}`).join(", "),
        s87: (bands.ps[87] || []).slice(0, 3).map(c => `${c.name} ${c.price}`).join(", ")
      }
    };
  } else {
    const movers = await readMovers(page);
    if (movers.length < 5) throw new Error(`tylko ${movers.length} wierszy ruchów — nie nadpisuję`);
    /* Lista SBC jedzie w wolnym cyklu — terminy zmieniają się raz na dobę, nie co
       pięć minut. Nieudany odczyt SBC NIE może zabrać ruchów cen, dlatego osobny
       try: wolimy stare terminy i świeże ceny niż nic. */
    let sbc = null;
    try {
      const r = await readSbc(page, undefined, PACING.navTimeoutMs);
      if (!r.dorenderowane) console.log("SBC: strona nie dorenderowała listy — zostawiam poprzednie terminy");
      else if (!r.lista.length) console.log("SBC: pusta lista po parsowaniu — zostawiam poprzednie terminy");
      else {
        /* Koszt rozwiązania porównujemy z poprzednim wolnym cyklem — jego ruch to
           nasza miara popytu na fodder, jedyna dostępna, bo wymogu składu fut.gg
           nie podaje. Bez poprzedniego pliku po prostu nie ma z czym porównać. */
        const lista = dopiszKoszty(r.lista, read(OUT).sbc);
        sbc = { at, lista };
        const naj = lista.find(x => x.wygasaAt);
        const ruszone = lista.filter(x => Number.isFinite(x.kosztZmiana) && Math.abs(x.kosztZmiana) >= 5).length;
        console.log(`SBC: ${lista.length} pozycji, z kosztem ${lista.filter(x => x.koszt).length}, ruszone ${ruszone}`
          + (naj ? `, najbliższy termin: ${naj.nazwa} za ${dniDo(naj, at)} dni` : ""));
      }
    } catch (e) {
      console.log("SBC: " + String(e.message || e).split("\n")[0] + " — zostawiam poprzednie terminy");
    }

    fields = sbc ? { at, atSlow: at, movers, sbc } : { at, atSlow: at, movers };
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
