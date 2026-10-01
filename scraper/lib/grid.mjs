/* Siatka cen FUT. Innych wartości nie da się wpisać w grze.
   Zweryfikowane empirycznie na ~60 cenach zebranych z rynku, nie z instrukcji EA. */

const STEPS = [
  { upTo:   1000, step:   50 },
  { upTo:  10000, step:  100 },
  { upTo:  50000, step:  250 },
  { upTo: 100000, step:  500 },
  { upTo: Infinity, step: 1000 }
];

export function stepFor(price){
  for (const s of STEPS) if (price <= s.upTo) return s.step;
  return 1000;
}

export function onGrid(price){
  return Number.isInteger(price) && price > 0 && price % stepFor(price) === 0;
}

/** Zaokrągla w dół do najbliższego legalnego kroku. */
export function snapDown(price){
  const s = stepFor(price);
  return Math.floor(price / s) * s;
}

/** Cena wystawienia: jeden krok POD podanym BIN-em.
   Równo z rynkiem = kolejka za całą tańszą podażą. Wyżej = nie sprzeda się. */
export function listBelow(bin){
  const s = stepFor(bin);
  return snapDown(snapDown(bin) - s);
}

/** Netto po 5% podatku liczonym od całej ceny sprzedaży. */
export function net(buy, sell){
  return Math.round(sell * 0.95 - buy);
}

/** Minimalny wzrost, żeby wyjść na zero: 1/0,95 = +5,264%. */
export const BREAK_EVEN = 1 / 0.95;
