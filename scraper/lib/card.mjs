/* Odczyt strony pojedynczej karty na fut.gg: najniższy BIN + tape transakcji.
   Struktura potwierdzona na żywej stronie 26.09.2026:
   · blok "Lowest BIN" zawiera świeżość i wartość ("1 minute ago", "370,000")
   · pierwsza tabela z nagłówkami "Time Sold" / "Price" ma 50 ostatnich sprzedaży
     (jest zduplikowana dla widoku mobilnego — bierzemy pierwszą) */

export async function readCard(page, url, navTimeoutMs){
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeoutMs });
  await page.waitForTimeout(2200);

  return page.evaluate(() => {
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
}
