import { listBelow, onGrid, snapDown, net } from "./grid.mjs";

/* Ranking okazji, nie ofert.

   Sprawdzone na żywych kartach 27.09.2026: kupowanie po widocznym najniższym BIN-ie
   jest stratne. McTominay 86 — BIN 3 900, mediana 4 000, dyskonto 2,5%, netto −195.
   Berger 87 — BIN 6 300 przy medianie 6 250, czyli BIN powyżej rynku, netto −505.
   Rynek jest efektywny: różnica BIN-mediana to 2–3%, a podatek zjada 5,3%.

   Pieniądz jest w pojedynczych tanich wystawieniach, które żyją sekundy i nie zdążą
   trafić do żadnego cennika. Zmierzone: wejście po 3 000 przy rynku 3 700 dało +420.
   Takie sprzedaże ZOSTAJĄ w tape'ie, więc liczymy, jak często się zdarzają. */

export function parseAgoMinutes(s){
  const t = String(s).toLowerCase();
  const n = parseInt(t.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  if (t.includes("second")) return n / 60;
  if (t.includes("minute")) return n;
  if (t.includes("hour"))   return n * 60;
  if (t.includes("day"))    return n * 1440;
  return null;
}

export function median(xs){
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** sales: [{ minutesAgo, price }], najświeższe pierwsze */
export function evaluate({ bin, sales, windowMin = 10, sample = 20, minOkazji = 2, minPlynnosc = 3 }){
  if (!sales || sales.length < 10) return { ok: false, reason: "za krótki tape" };

  const fair = median(sales.slice(0, sample).map(s => s.price));
  if (!fair) return { ok: false, reason: "brak wyceny" };

  const listAt = listBelow(fair);                  // krok pod rynkiem, inaczej nie zejdzie
  const sufit  = snapDown(listAt * 0.95);          // najwyższa cena zakupu, przy której jest zysk
  if (sufit <= 0) return { ok: false, reason: "pasmo za tanie na marżę" };

  const plynnosc = sales.filter(s => s.minutesAgo !== null && s.minutesAgo <= windowMin).length;
  const tanie    = sales.filter(s => s.price <= sufit);
  const okazje   = tanie.length;

  if (plynnosc < minPlynnosc) return { ok: false, reason: `płynność ${plynnosc}/${windowMin}min` };
  if (okazje < minOkazji)     return { ok: false, reason: `okazji ${okazje} na ${sales.length} sprzedaży` };

  const zysk = net(median(tanie.map(s => s.price)), listAt);   // typowy zarobek z trafionej okazji
  if (zysk <= 0) return { ok: false, reason: "netto ≤ 0 nawet na tanich" };

  const szansa = okazje / sales.length;

  return {
    ok: true,
    fair, bin, sufit, listAt, zysk, okazje, plynnosc,
    szansa: +(szansa * 100).toFixed(1),
    probek: sales.length,
    /* Wartość oczekiwana na dziesięć minut: ile transakcji schodzi × jak często
       trafia się tania × ile z niej zostaje po podatku. */
    score: Math.round(plynnosc * szansa * zysk)
  };
}
