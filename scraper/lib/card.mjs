/* Odczyt strony pojedynczej karty na fut.gg: najniższy BIN + tape transakcji.
   Struktura potwierdzona na żywej stronie 26.09.2026:
   · blok "Lowest BIN" zawiera świeżość i wartość ("1 minute ago", "370,000")
   · pierwsza tabela z nagłówkami "Time Sold" / "Price" ma 50 ostatnich sprzedaży
     (jest zduplikowana dla widoku mobilnego — bierzemy pierwszą)

   27.09.2026: cykl top odrzucał wszystkie 50 kart w każdym przebiegu. Sprawdzone
   na żywej stronie, że surowy HTML pobrany fetchem NIE zawiera ani BIN-u, ani tabeli
   — oba pojawiają się dopiero po dorenderowaniu przez JS. Stałe `waitForTimeout(2200)`
   to zakład o to, że runner zdąży; jak nie zdążył, `sales` wracało puste i evaluate
   odpowiadał "za krótki tape" dla każdej karty po kolei.
   Zamiast czekać na ślepo, czekamy na konkretny element i mówimy wprost, gdy go nie ma. */

/* 12 s × 50 kart = kwadrans, a cron puka co 5 minut. Sześć sekund wystarcza
   na dorenderowanie (zmierzone: tabela jest po ~0,7 s), a w najgorszym razie
   połowi długość całego cyklu. */
const CZEKAJ_MS = 6000;

export async function readCard(page, url, navTimeoutMs){
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeoutMs });

  /* Czekamy na tabelę sprzedaży, nie na upływ czasu. Brak tabeli po CZEKAJ_MS to
     informacja diagnostyczna (pustyTape), a nie cicha zerowa lista. */
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
    const num = s => parseInt(String(s).replace(/[^\d]/g, ""), 10);

    let bin = null;
    const label = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && txt(e) === "Lowest BIN");
    if (label){
      let box = label;
      for (let i = 0; i < 4 && box.parentElement; i++){
        box = box.parentElement;
        const line = txt(box).split("\n").map(s => s.trim()).find(s => /^[\d][\d,]{2,}$/.test(s));
        if (line){ bin = num(line); break; }
      }
    }

    const table = [...document.querySelectorAll("table")]
      .find(t => [...t.querySelectorAll("th")].some(h => txt(h) === "Time Sold"));
    const sales = table
      ? [...table.querySelectorAll("tbody tr")].map(r => {
          const c = [...r.children].map(txt);
          return { ago: c[0], price: num(c[1]) };
        }).filter(s => Number.isFinite(s.price))
      : [];

    return { bin, sales };
  });

  return { ...out, dorenderowane };
}
