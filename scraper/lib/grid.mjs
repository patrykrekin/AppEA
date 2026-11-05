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

/** Ostatnia legalna cena <= podanej wartości (również na granicy widełek). */
export function snapDown(price){
  if (!Number.isFinite(price) || price <= 0) return 0;
  const s = stepFor(price);
  return Math.floor(price / s) * s;
}

/** Pierwsza legalna cena >= podanej wartości. Krok może zmieniać się na progu. */
export function snapUp(price){
  if (!Number.isFinite(price) || price <= 0) return 0;
  const down = snapDown(price);
  return down >= price ? down : down + stepFor(down + 1);
}

/** Jedna LEGALNA cena poniżej podanego BIN-u — także przy progach 1k/10k/50k/100k.
    Nie odejmujemy kroku wyznaczonego z BIN-u, bo poniżej progu krok jest inny. */
export function listBelow(bin){
  const near = snapDown(bin);
  return near > 0 ? snapDown(near - 1) : 0;
}

/** Netto po 5% podatku liczonym od całej ceny sprzedaży. */
export function net(buy, sell){
  return Math.round(sell * 0.95 - buy);
}

/** Minimalny wzrost, żeby wyjść na zero: 1/0,95 = +5,264%. */
export const BREAK_EVEN = 1 / 0.95;
