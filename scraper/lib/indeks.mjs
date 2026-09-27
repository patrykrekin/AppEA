/* Własny indeks rynku, liczony z dna pasm — tych samych, które pobiera cykl fast.
   Dwie liczby, bo jedna kłamie:
     · wartość  — koszyk pasm 83–89 względem pierwszego pomiaru (100 = start)
     · szerokość — ile pasm rośnie, a ile spada względem doby wstecz

   Szerokość jest ważniejsza od kierunku. Koszyk w górę o 2%, ale tylko jedno pasmo
   rosnące, to nie jest rynek do góry — to jedna karta, która pociągnęła średnią. */

export const KOSZYK = [83, 84, 85, 86, 87, 88, 89];
const DOBA = 86400;

/** Wyciąga dno każdego pasma z danych fut.gg. */
export function floorsZPasm(bands){
  const out = {};
  for (const r of KOSZYK){
    const c = (bands[r] || [])[0];
    if (c && Number.isFinite(c.price)) out[r] = c.price;
  }
  return out;
}

/** Średnia zmiana względna koszyka między dwoma pomiarami. Pasma bez pary są pomijane. */
function zmiana(odniesienie, teraz){
  const pary = KOSZYK.filter(r => odniesienie[r] > 0 && teraz[r] > 0);
  if (!pary.length) return null;
  const suma = pary.reduce((a, r) => a + (teraz[r] / odniesienie[r] - 1), 0);
  return suma / pary.length;
}

function szerokosc(odniesienie, teraz){
  let gora = 0, dol = 0, plask = 0;
  for (const r of KOSZYK){
    if (!(odniesienie[r] > 0 && teraz[r] > 0)) continue;
    const d = teraz[r] / odniesienie[r] - 1;
    if (d > 0.005) gora++; else if (d < -0.005) dol++; else plask++;
  }
  return { gora, dol, plask, razem: gora + dol + plask };
}

/**
 * hist: [{ at, floors }] rosnąco po czasie, z bieżącym pomiarem na końcu.
 * Zwraca null, dopóki nie ma z czym porównywać — strona pokaże wtedy, że zbieramy dane.
 */
export function policz(hist){
  if (!Array.isArray(hist) || hist.length < 2) return null;

  const teraz = hist[hist.length - 1];
  const start = hist[0];

  // punkt odniesienia dla doby: najbliższy pomiar sprzed >= 24 h, inaczej najstarszy jaki mamy
  const doba = [...hist].reverse().find(h => teraz.at - h.at >= DOBA) || start;

  const odStartu = zmiana(start.floors, teraz.floors);
  const odDoby   = zmiana(doba.floors,  teraz.floors);
  const sz       = szerokosc(doba.floors, teraz.floors);

  const pelnaDoba = teraz.at - doba.at >= DOBA;
  const godzin = Math.max(1, Math.round((teraz.at - doba.at) / 3600));

  return {
    wartosc: odStartu === null ? null : +(100 * (1 + odStartu)).toFixed(2),
    zmiana:  odDoby   === null ? null : +(odDoby * 100).toFixed(2),
    okno:    pelnaDoba ? "24 h" : godzin + " h",
    szerokosc: sz,
    pomiarow: hist.length,
    odKiedy: start.at
  };
}

/** Dopisuje pomiar i przycina historię do dwóch dób (48 pomiarów co 30 min). */
export function dopisz(hist, at, floors, limit = 96){
  const h = Array.isArray(hist) ? [...hist] : [];
  if (Object.keys(floors).length) h.push({ at, floors });
  return h.slice(-limit);
}
