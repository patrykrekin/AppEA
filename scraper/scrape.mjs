import { open } from "./lib/browser.mjs";
import { SOURCES, SEL, CYCLES, OUT, PACING, SNIPE_BANDS, SNIPE_DISCOUNT } from "./config.js";
import { patch, read } from "./lib/store.mjs";
import { validate } from "./validate.mjs";
import { policz, dopisz, floorsZPasm } from "./lib/indeks.mjs";
import { policzOkazje, dopiszOkazje, aktualizujPoziomy, aktualizujPoziomyD, policzInwestycje, aktualizujTrwalosc, MIN_ODCZYTOW } from "./lib/okazje.mjs";
import { readSbc, dopiszKoszty } from "./lib/sbc.mjs";
import { zWierszy, dopiszRuchy, odbicia } from "./lib/ruchy.mjs";
import { zbuduj as zbudujKalendarz } from "./lib/kalendarz.mjs";
import { dopiszRejestr, zrodloCen, skutecznoscInw } from "./lib/rejestr.mjs";
import { toSnipeRows } from "./lib/snajperka.mjs";
import { dopiszSzereg, policzMonitor } from "./lib/monitor.mjs";

/* SBC co godzinę, nie dwa razy na dobę. 28.09: SBC z terminem 24 h potrafi
   wygasnąć i zostać zastąpiona nową, a cykl `slow` pokazywał nieistniejącą
   przez pół doby. Jedno wejście na fut.gg co dwunasty przebieg — tanio. */
const SBC_WIEK_MS = 55 * 60 * 1000;

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

/* ---------- platforma na fut.gg ----------
   Wybór platformy siedzi w ciasteczku `futgg_platform` (konsola = "ps5", PC = "pc")
   i obowiązuje CAŁĄ sesję przeglądarki, nie tylko stronę, na której się kliknęło.

   Sprawdzone na żywo 28.09.2026 i to był realny błąd w danych: readBandsGG
   przełączał na PC, żeby odczytać drugie pasmo, i tam ciasteczko zostawało.
   Wszystko, co czytaliśmy PÓŹNIEJ w tym samym przebiegu — momentum i koszty SBC —
   było więc z PC, a strona podpisywała to jako konsolę. Różnice nie są kosmetyczne:
   Destined for Glory Challenge 1 kosztowała 2 550 na PC i 3 900 na konsoli (+53%),
   TOTW Upgrade 12 000 vs 11 050, Renato Veiga 23 000 vs 21 050.

   Dlatego platformę ustawiamy JAWNIE przed każdym krokiem, który od niej zależy,
   i sprawdzamy ciasteczko po kliknięciu, zamiast zakładać, że się udało. */
const CIASTKO = { Console: "ps5", PC: "pc" };

const czytajCiastko = page => page.evaluate(() =>
  (document.cookie.split(";").map(x => x.trim()).find(x => x.startsWith("futgg_platform=")) || "").split("=")[1] || "");

async function platforma(page, ktora){
  /* Brak ciasteczka = konsola. Świeża przeglądarka wchodzi na fut.gg z aktywnym
     przyciskiem Console i bez ciasteczka — ustawia je dopiero pierwszy klik.
     Dlatego "pusto" traktujemy jak konsolę i nie klikamy po nic: każdy klik to
     przeładowanie strony i 2,5 s z pięciominutowego budżetu przebiegu. */
  const teraz = await czytajCiastko(page);
  if (teraz === CIASTKO[ktora] || (ktora === "Console" && !teraz)) return teraz || CIASTKO.Console;

  const klik = await page.evaluate(nazwa => {
    const b = [...document.querySelectorAll("button")].find(x => (x.innerText || "").trim() === nazwa);
    if (!b) return false;
    b.click();
    return true;
  }, ktora);
  if (!klik) throw new Error(`nie znalazłem przycisku ${ktora} na fut.gg`);
  await sleep(2500);
  /* Klik przeładowuje stronę, więc ciasteczko czytamy PO przeładowaniu. */
  const po = await czytajCiastko(page);
  if (po !== CIASTKO[ktora])
    throw new Error(`przełączenie na ${ktora} nie weszło — ciasteczko ${po || "puste"}`);
  return po;
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

  /* Konsola jest domyślna w świeżej przeglądarce, ale nie zakładamy tego —
     ustawiamy jawnie, żeby jedno nieudane przełączenie nie podpisało cen z PC
     jako konsolowych. */
  await platforma(page, "Console");
  const ps = await zbierz();

  await platforma(page, "PC");
  const pc = await zbierz();

  /* I wracamy na konsolę, bo ciasteczko obowiązuje resztę przebiegu — momentum
     i SBC czytamy po tym kroku. */
  await platforma(page, "Console");

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

    /* Wiersze snajperskie liczymy DOPIERO TERAZ, bo cel sprzedaży bierze się
       z poziomu karty, a nie z pojedynczej oferty — szczegóły przy toSnipeRows.
       Poziom podajemy ten PO tym odczycie: do celu sprzedaży dzisiejsza cena ma
       się liczyć, w odróżnieniu od okazji, gdzie sama obniżałaby próg, który ma pobić. */
    const ps = toSnipeRows(bands.ps, okazjePs.poziomy, SNIPE_BANDS, SNIPE_DISCOUNT, MIN_ODCZYTOW);
    const pc = toSnipeRows(bands.pc, okazjePc.poziomy, SNIPE_BANDS, SNIPE_DISCOUNT, MIN_ODCZYTOW);
    if (!ps.length || !pc.length) throw new Error("brak wierszy snajperskich po filtrach");
    const zPoziomu = r => r.filter(x => x[5] > 0).length;
    console.log(`snajperka: konsola ${ps.length} wierszy (${zPoziomu(ps)} z poziomu karty), PC ${pc.length} (${zPoziomu(pc)} z poziomu)`);

    /* Drugi, wolniejszy poziom: kilkanaście godzin pamięci zamiast godziny.
       Z niego liczymy pozycje inwestycyjne — kartę, która naprawdę zeszła niżej
       i stoi tam od godzin, a nie mignięcie, które zabierze bot. Pozycje liczymy
       na poziomach SPRZED tego odczytu, tak samo jak okazje. */
    const poprzD = (prev.okazje && prev.okazje.poziomyD) || {};
    const poprzT = (prev.okazje && prev.okazje.trwalosc) || {};
    /* Trwałość aktualizujemy PRZED policzeniem pozycji, żeby karta stojąca tanio
       już szósty odczyt z rzędu została zgłoszona w tym przebiegu, a nie dopiero
       w następnym. Poziomy zostają na wersji sprzed odczytu — tak jak przy okazjach. */
    const trwaloscPs = aktualizujTrwalosc(poprzT.ps, bands.ps, poprzD.ps, at);
    const trwaloscPc = aktualizujTrwalosc(poprzT.pc, bands.pc, poprzD.pc, at);
    const inwestycje = {
      ps: policzInwestycje(bands.ps, poprzD.ps, trwaloscPs, at),
      pc: policzInwestycje(bands.pc, poprzD.pc, trwaloscPc, at)
    };
    okazjePs.poziomyD = aktualizujPoziomyD(poprzD.ps, poprzPoziomy.ps, bands.ps, at);
    okazjePc.poziomyD = aktualizujPoziomyD(poprzD.pc, poprzPoziomy.pc, bands.pc, at);
    okazjePs.trwalosc = trwaloscPs;
    okazjePc.trwalosc = trwaloscPc;

    /* Karty warte obserwacji z NASZYCH pasm. Sekcja "pod obserwacją" stała
       dotąd wyłącznie na szeregu momentum z fut.gg, a tam najtańsza karta
       kosztuje 15 000 — przy regule 10% banku wszystko było wyszarzone przy
       każdym realnym budżecie. To źródło nie zawiera fodderu w ogóle.
       Tu liczymy to samo dla pasm 83–89, bez ani jednego wejścia na fut.gg:
       cena z pasma, poziom dobowy jako norma, szereg szybkiego poziomu jako
       sygnał zwrotu. Szczegóły w lib/monitor.mjs. */
    const poprzSzereg = (prev.okazje && prev.okazje.szereg) || {};
    okazjePs.szereg = dopiszSzereg(poprzSzereg.ps, okazjePs.poziomy, at);
    okazjePc.szereg = dopiszSzereg(poprzSzereg.pc, okazjePc.poziomy, at);
    const monitor = {
      ps: policzMonitor(bands.ps, okazjePs.poziomyD, okazjePs.szereg, trwaloscPs, at),
      pc: policzMonitor(bands.pc, okazjePc.poziomyD, okazjePc.szereg, trwaloscPc, at)
    };
    console.log(`monitor: konsola ${monitor.ps.length} kart (${monitor.ps.filter(x => x.zawraca).length} zawraca, ${monitor.ps.filter(x => x.leci).length} leci), PC ${monitor.pc.length}`);
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
    /* Momentum czytamy z ciasteczkiem ustawionym na konsolę (patrz platforma()),
       więc szereg jest KONSOLOWY i tak go podpisujemy. Bez tego podpisu strona
       stawiała ceny z jednego rynku obok liczb z drugiego. */
    obserwacja = { at, platforma: "console", karty: (obserwacja && obserwacja.karty) || {}, diag: diag.slice(0, 12) };

    /* Rejestr wyników pozycji — jedyna rzecz, która zamienia sekcję inwestycyjną
       z rozumowania w pomiar. Wiersz otwiera się przy wykryciu pozycji, zamyka
       po dobie albo po dojściu do celu, i zostaje z werdyktem. Szczegóły i pułapki
       w lib/rejestr.mjs.

       Momentum podajemy TYLKO do rejestru konsoli — to jego platforma. Dla PC
       zostają same pasma, więc kubełek "urwane" będzie tam większy; lepiej mieć
       mniej danych niż trafienia policzone z cudzego rynku. */
    const poprzRej = prev.rejestr || {};
    const rejestr = {
      ps: dopiszRejestr(poprzRej.ps, at, inwestycje.ps, zrodloCen(bands.ps, obserwacja, at), okazjePs.poziomyD),
      pc: dopiszRejestr(poprzRej.pc, at, inwestycje.pc, zrodloCen(bands.pc, null, at), okazjePc.poziomyD)
    };
    const skutecznosc = { ps: skutecznoscInw(rejestr.ps), pc: skutecznoscInw(rejestr.pc) };
    for (const [nazwa, sk] of [["konsola", skutecznosc.ps], ["PC", skutecznosc.pc]]){
      console.log(`rejestr ${nazwa}: ${sk.otwartych} otwartych, ${sk.probek} zamkniętych`
        + (sk.gotowe
            ? ` — trafień ${sk.trafienie}% ze ${sk.znane} znanych (cel ${sk.cel}, poziom zszedł ${sk.poziom}, głębiej ${sk.glebiej}, płasko ${sk.plasko}, urwane ${sk.urwane})`
            : ` — za mało na skuteczność (próg ${sk.minProb})`));
    }

    /* SBC w cyklu fast, ale tylko raz na godzinę. Własny try — nieudany odczyt
       terminów nie może zabrać cen, indeksu ani okazji. */
    let sbcOut = prev.sbc || null;
    try {
      const wiek = prev.sbc && prev.sbc.at ? (at - prev.sbc.at) * 1000 : Infinity;
      if (wiek >= SBC_WIEK_MS){
        const r = await readSbc(page, undefined, PACING.navTimeoutMs);
        if (!r.dorenderowane) console.log("SBC: strona nie dorenderowała — zostawiam poprzednie terminy");
        else if (!r.lista.length) console.log("SBC: pusta lista — zostawiam poprzednie terminy");
        else {
          const lista = dopiszKoszty(r.lista, prev.sbc);
          /* Koszty SBC ZALEŻĄ od platformy — 28.09 Destined for Glory Challenge 1
             kosztowała 2 550 na PC i 3 900 na konsoli. Czytamy po powrocie na
             konsolę, więc to koszty konsolowe, i tak je podpisujemy. */
          sbcOut = { at, platforma: "console", lista };
          console.log(`SBC: ${lista.length} pozycji, z kosztem ${lista.filter(x => x.koszt).length}`);
        }
      }
    } catch (e) {
      console.log("SBC: " + String(e.message || e).split("\n")[0] + " — zostawiam poprzednie terminy");
    }

    /* Kalendarz liczymy z tego, co właśnie odczytaliśmy. Okno startuje od dnia
       przebiegu, więc przesuwa się samo — nie ma listy do utrzymywania. */
    const ostatnieFloors = histPs.length ? histPs[histPs.length - 1].floors : null;
    const kalendarz = zbudujKalendarz(sbcOut, prev.okazje, ostatnieFloors, at);
    console.log(`kalendarz: ${kalendarz.length} dni z wpisami`);

    fields = {
      at, atFast: at,
      ...(sbcOut ? { sbc: sbcOut } : {}),
      kalendarz,
      hist: { ps: histPs, pc: histPc },
      nasz: { ps: policz(histPs), pc: policz(histPc) },
      okazje: dopiszOkazje(prev.okazje, at, okazjePs, okazjePc),
      inwestycje,
      monitor,
      rejestr,
      skutecznosc,
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
    /* SBC przeniesione do cyklu fast (raz na godzinę) — terminy 24-godzinne
       starzały się tu przez pół doby. Wolny cykl robi już tylko ruchy dobowe. */

    fields = { at, atSlow: at, movers };
  }

  const { err, warn } = validate({ ...read(OUT), ...fields });
  warn.forEach(w => console.log("uwaga:", w));
  if (err.length){
    err.forEach(e => console.log("BŁĄD :", e));
    /* Sama liczba błędów nic nie daje — 30.09 przez godzinę wiedzieliśmy tylko,
       że jest ich pięć. Doczepiamy listę do wyjątku, żeby trafiła do data.json
       razem z powodem awarii. Osiem wystarczy: jak jest ich więcej, to i tak
       jedna przyczyna. */
    const wyjatek = new Error(`${err.length} błędów walidacji — nic nie zapisuję`);
    wyjatek.szczegoly = err.slice(0, 8);
    throw wyjatek;
  }

  /* awaria: null kasuje ślad po poprzednim nieudanym przebiegu — inaczej komunikat
     o awarii wisiałby na stronie długo po tym, jak wszystko wróciło do normy. */
  patch(OUT, { ...fields, awaria: null });
  console.log(`${cycle}: zapisano ${OUT} (${stamp})`);
} catch (e) {
  const powod = String((e && e.message) || e).split("\n")[0].slice(0, 300);
  console.error(`${cycle}: PRZERWANE — ${powod}`);

  /* 30.09.2026: dziewięć przebiegów z rzędu padło na „Pobierz ceny" i przez godzinę
     nie dało się powiedzieć DLACZEGO. Tekst błędu szedł wyłącznie do logu Actions,
     a log wymaga tokena — czyli dokładnie w chwili, gdy diagnoza jest najbardziej
     potrzebna, byliśmy ślepi. To już drugi raz (27.09 to samo z watchlistą).
     Od teraz powód awarii ląduje w data.json.

     Czego NIE robimy: nie ruszamy `at`. Dane dalej mają być oznaczone jako stare,
     bo stare są. Dokładamy wyłącznie jeden klucz. patch() zapisuje przez plik
     tymczasowy i atomową podmianę, więc nawet awaria w tym miejscu nie zostawi
     obciętego data.json. */
  try {
    patch(OUT, { awaria: { at, cykl: cycle, powod, szczegoly: (e && e.szczegoly) || null } });
    console.error("powód awarii zapisany do data.json");
  } catch (e2) {
    console.error("nie udało się zapisać nawet powodu awarii — " + String((e2 && e2.message) || e2));
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
