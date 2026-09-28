/* Odczyt strony pojedynczej karty na fut.gg: BIN, taśma sprzedaży, żywa podaż.

   Struktura potwierdzona na żywej stronie 28.09.2026
   (https://www.fut.gg/players/234577-diogo-costa/27-234577/):
   · blok "Lowest BIN" → ["Lowest BIN", "1 minute ago", "4,000", "PR", "700 - 35K"]
   · tabela "Time Sold" / "Price" — 50 ostatnich sprzedaży, czasy względne
     ("49 seconds ago", "2 minutes ago")
   · tabela "Ending" / "Start Bid" / "BIN" — żywe aukcje, u Costy 26 sztuk.
     NIE MA kolumny z aktualną ofertą, więc strategii licytacyjnej z tego
     źródła zbudować się nie da. Bierzemy z niej tylko podaż i najtańszy BIN.
   · przyciski "Console" / "PC" z aria-pressed — cykl fast klika PC przy czytaniu
     pasm, więc przed odczytem karty upewniamy się, że wróciliśmy na konsolę.
     Inaczej podpisalibyśmy ceny PC jako konsolowe.

   Po co to w ogóle wraca do cyklu: lista najtańszych w paśmie pokazuje tylko
   ~11 kart na pasmo. Karta, która odbija, z tej listy WYPADA — czyli gubimy ją
   dokładnie wtedy, kiedy robi to, co nas interesuje. Strona karty daje cenę
   niezależnie od tego, czy karta jest akurat tania.

   27.09: surowy HTML nie zawiera ani BIN-u, ani tabeli — oba dokleja JS.
   Dlatego czekamy na konkretny element, nie na upływ czasu. */

/* 12 s × 50 kart = kwadrans, a cron puka co 5 minut — tak zakleszczyliśmy
   harmonogram 27.09. Przy watchliście 8 kart sześć sekund daje ~50 s na krok. */
const CZEKAJ_MS = 6000;

/** "49 seconds ago" → 49. Zwraca null dla tego, czego nie rozumiemy —
 *  zgadywanie zera zrobiłoby ze starej sprzedaży świeżą. */
export function sekundyTemu(tekst){
  const t = String(tekst || "").trim().toLowerCase();
  const m = t.match(/(\d+)\s*(second|minute|hour|day|week)s?\s*ago/);
  if (!m) return null;
  const k = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 }[m[2]];
  return parseInt(m[1], 10) * k;
}

export async function readCard(page, url, navTimeoutMs){
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeoutMs });

  /* Platforma: czytamy konsolę. Jeżeli strona wstała na PC — przełączamy. */
  let platforma = "ps";
  try {
    const trzeba = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")]
        .filter(x => /^(Console|PC)$/.test((x.innerText || "").trim()));
      const konsola = b.find(x => x.innerText.trim() === "Console");
      if (!konsola) return false;
      const aktywna = konsola.getAttribute("aria-pressed") || konsola.getAttribute("aria-selected");
      if (aktywna === "false"){ konsola.click(); return true; }
      return false;
    });
    if (trzeba) await page.waitForTimeout(1200);
  } catch { platforma = null; }

  let dorenderowane = true;
  try {
    await page.waitForFunction(() => {
      const txt = e => (e && e.innerText ? e.innerText : "").trim();
      return [...document.querySelectorAll("table")]
        .some(t => [...t.querySelectorAll("th")].some(h => txt(h) === "Time Sold")
                && t.querySelectorAll("tbody tr").length > 0);
    }, { timeout: CZEKAJ_MS });
  } catch { dorenderowane = false; }

  const out = await page.evaluate(() => {
    const txt = e => (e && e.innerText ? e.innerText : "").trim();
    const num = s => { const n = parseInt(String(s).replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
    const tabela = naglowek => [...document.querySelectorAll("table")]
      .find(t => [...t.querySelectorAll("th")].some(h => txt(h) === naglowek));

    let bin = null, binWiek = null;
    const label = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && txt(e) === "Lowest BIN");
    if (label){
      let box = label;
      for (let i = 0; i < 4 && box.parentElement; i++){
        box = box.parentElement;
        const l = txt(box).split("\n").map(s => s.trim());
        const cena = l.find(s => /^[\d][\d,]{2,}$/.test(s));
        if (cena){
          bin = num(cena);
          binWiek = l.find(s => /\bago\b/.test(s)) || null;
          break;
        }
      }
    }

    const tSold = tabela("Time Sold");
    const sales = tSold
      ? [...tSold.querySelectorAll("tbody tr")].map(r => {
          const c = [...r.children].map(txt);
          return { ago: c[0], price: num(c[1]) };
        }).filter(s => Number.isFinite(s.price))
      : [];

    /* Żywe aukcje: ile sztuk ktoś teraz wystawił i po ile najtaniej.
       To jest podaż — druga strona płynności liczonej z taśmy. */
    const tAuk = tabela("Ending");
    let podaz = null;
    if (tAuk){
      const biny = [...tAuk.querySelectorAll("tbody tr")]
        .map(r => num([...r.children].map(txt)[2]))
        .filter(x => Number.isFinite(x) && x > 0);
      podaz = { sztuk: biny.length, najtanszy: biny.length ? Math.min(...biny) : null };
    }

    return { bin, binWiek, sales, podaz };
  });

  return { ...out, platforma, dorenderowane };
}
