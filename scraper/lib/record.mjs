import { listBelow, net } from "./grid.mjs";

/* Tabela wyników. Każdy pick zapisany z ceną wejścia i datą; po HOLD_DAYS
   rozliczany po tym, co faktycznie stoi na rynku. Bez tego Top 5 to
   ładna lista bez pokrycia — mamy jeden zmierzony wynik, nie serię. */

const DAY = 86400;

export function openPicks(rec, picks, at){
  const open = [...(rec.open || [])];
  for (const p of picks){
    if (open.some(o => o.name === p.name)) continue;          // już otwarty
    open.push({ name: p.name, url: p.url, at, buy: p.bin, target: p.listAt, expected: p.profit });
  }
  return open;
}

/** Rozlicza pozycje starsze niż holdDays. `priceNow` zwraca aktualną wycenę albo null. */
export async function settle(rec, at, holdDays, priceNow){
  const open = [], closed = [...(rec.closed || [])];
  for (const o of (rec.open || [])){
    if (at - o.at < holdDays * DAY){ open.push(o); continue; }
    const fair = await priceNow(o);
    if (fair == null){ open.push(o); continue; }              // nie udało się sprawdzić — zostaje otwarty
    const got = net(o.buy, listBelow(fair));
    closed.push({ ...o, closedAt: at, fair, result: got, hit: got > 0 });
  }
  return { open, closed: closed.slice(-60) };                 // trzymamy 60 ostatnich
}

export function summarize(closed){
  if (!closed.length) return { n: 0, hit: 0, avg: 0, note: "Brak rozliczonych pozycji. Pierwsze wyniki po trzech dniach." };
  const hit = closed.filter(c => c.hit).length;
  const avg = Math.round(closed.reduce((a, c) => a + c.result, 0) / closed.length);
  return { n: closed.length, hit, avg,
           note: `${hit} z ${closed.length} wyszło, średnio ${avg >= 0 ? "+" : ""}${avg} na kartę.` };
}
