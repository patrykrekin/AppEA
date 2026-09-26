import { listBelow, onGrid, net } from "./grid.mjs";

/* Wycena i ranking z tape'u transakcji fut.gg.

   Mediana, nie średnia — w tape'ie trafiają się pojedyncze odstępstwa
   (w próbce Necib: 246 000 wśród cen 347–370 tys.). Średnia by je połknęła. */

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

/* sales: [{ minutesAgo, price }] — posortowane od najświeższych */
export function evaluate({ bin, sales, windowMin = 10, sample = 20 }){
  const fresh = sales.filter(s => s.minutesAgo !== null && s.minutesAgo <= windowMin);
  const liquidity = fresh.length;                       // ile schodzi na 10 minut
  const fair = median(sales.slice(0, sample).map(s => s.price));

  if (!fair || !bin) return { ok: false, reason: "brak ceny albo tape'u" };
  if (!onGrid(bin))  return { ok: false, reason: `BIN ${bin} poza siatką` };
  if (liquidity < 3) return { ok: false, reason: `płynność ${liquidity}/10min — nie wyjdziesz z pozycji` };

  const listAt   = listBelow(fair);                     // krok pod obecną wyceną
  const profit   = net(bin, listAt);
  const discount = (fair - bin) / fair;

  if (profit <= 0)      return { ok: false, reason: "netto po podatku ≤ 0" };
  if (discount < 0.053) return { ok: false, reason: `dyskonto ${(discount*100).toFixed(1)}% — podatek to zjada` };

  return {
    ok: true,
    fair, bin, listAt, profit, liquidity,
    discount: +(discount * 100).toFixed(1),
    // zysk razy płynność; sufit 10, żeby jedna bardzo płynna karta nie zdominowała listy
    score: Math.round(profit * Math.min(liquidity, 10))
  };
}
