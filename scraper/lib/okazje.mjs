/* Licznik tanich wystawień — nasza własna miara tego, KIEDY na rynku pojawiają się okazje.

   Skąd to się wzięło: 27.09.2026 taśma Diogo Costy 86 pokazała sprzedaż po 3 000 przy
   dnie pasma 3 900. Takie wystawienia żyją minuty i nie trafiają do żadnego cennika —
   to z nich są pieniądze. Nikt ich nie liczy, bo wszyscy patrzą na ceny, nie na to,
   jak często ceny się psują.

   Liczymy bez dodatkowych wejść na fut.gg: pasma i tak pobiera cykl fast.
   Za okazję uznajemy kartę stojącą co najmniej PROG pod medianą pięciu najtańszych
   w swoim paśmie. Mediana, a nie najtańsza sztuka — inaczej pojedyncze tanie
   wystawienie samo obniżałoby próg i chowało się przed licznikiem.

   Zapisujemy dwie rzeczy:
     · rozkład po godzinach (czas polski) — narasta, 24 wpisy, nigdy nie puchnie
     · krótki log ostatnich pomiarów — do wykresu z dzisiaj

   Godzinę liczymy w strefie Europe/Warsaw na runnerze, żeby strona nie musiała
   zgadywać przesunięcia i żeby zmiana czasu nie rozjechała kubełków. */

import { KOSZYK } from "./indeks.mjs";

export const PROG = 0.10;          // ile pod medianą dna liczy się za okazję
export const LOG_LIMIT = 288;      // doba przy przebiegu co 5 minut
export const KART_LIMIT = 80;      // ile kart trzymamy w rejestrze przeżywalności
export const KART_WIEK = 3 * 86400;

export function godzinaPL(at){
  const s = new Date(at * 1000).toLocaleString("en-GB", {
    timeZone: "Europe/Warsaw", hour: "2-digit", hour12: false
  });
  const h = parseInt(s, 10);
  return Number.isFinite(h) ? h % 24 : null;
}

/** bands: dane z fut.gg, floors: wynik floorsZPasm z TEGO SAMEGO odczytu. */
export function policzOkazje(bands, floors, prog = PROG){
  const pasma = {};
  const karty = [];
  let razem = 0;
  for (const r of KOSZYK){
    const dno = floors[r];
    if (!(dno > 0)) continue;
    const granica = dno * (1 - prog);
    const tanie = (bands[r] || []).filter(c => c && Number.isFinite(c.price) && c.price > 0 && c.price <= granica);
    for (const c of tanie){
      karty.push({
        klucz: `${c.name} ${r}`, nazwa: c.name, rating: r, cena: c.price, dno,
        rabat: +((1 - c.price / dno) * 100).toFixed(1)
      });
    }
    pasma[r] = tanie.length;
    razem += tanie.length;
  }
  return { pasma, razem, karty };
}

/** Dopisuje pomiar do rozkładu godzinowego, loga i rejestru przeżywalności.
 *  ps/pc to wynik policzOkazje — zawiera i licznik, i listę kart. */
export function dopiszOkazje(stan, at, ps, pc, limit = LOG_LIMIT){
  const s = stan && typeof stan === "object" ? stan : {};
  const godziny = { ...(s.godziny || {}) };
  const h = godzinaPL(at);
  if (h !== null){
    const b = godziny[h] || { przebiegow: 0, okazji: 0 };
    godziny[h] = {
      przebiegow: b.przebiegow + 1,
      okazji: b.okazji + (ps?.razem || 0) + (pc?.razem || 0)
    };
  }
  const log = [...(Array.isArray(s.log) ? s.log : []), [at, ps?.razem || 0, pc?.razem || 0]].slice(-limit);

  /* Rejestry trzymamy osobno per platforma — ta sama karta ma inną cenę na PC
     i na konsoli, więc mieszanie ich zafałszowałoby i rabat, i przeżywalność. */
  const poprz = s.ostatnie || {};
  const stareKarty = s.karty || {};
  const kartyPs = dopiszKarty(stareKarty.ps, ps?.karty, poprz.ps, at);
  const kartyPc = dopiszKarty(stareKarty.pc, pc?.karty, poprz.pc, at);

  return {
    prog: PROG, odKiedy: s.odKiedy || at, godziny, log,
    karty: { ps: kartyPs, pc: kartyPc },
    ostatnie: {
      ps: (ps?.karty || []).map(k => k.klucz),
      pc: (pc?.karty || []).map(k => k.klucz)
    }
  };
}

/** Godziny posortowane po tym, ile okazji wypada na jeden przebieg.
 *  minPrzebiegow odcina kubełki, w których mamy za mało pomiarów, żeby cokolwiek twierdzić. */
export function najlepszeGodziny(stan, minPrzebiegow = 6){
  const g = (stan && stan.godziny) || {};
  return Object.keys(g)
    .map(h => ({ godzina: +h, ...g[h], naPrzebieg: g[h].przebiegow ? +(g[h].okazji / g[h].przebiegow).toFixed(2) : 0 }))
    .filter(x => x.przebiegow >= minPrzebiegow)
    .sort((a, b) => b.naPrzebieg - a.naPrzebieg);
}

/* ── Przeżywalność: nasza miara tego, na KTÓRE karty nikt nie poluje ──────────

   Lista snajperska rzadko siada, bo boty zjadają tanie wystawienia w sekundy.
   Ale nie wszystkie — tylko te, których ktoś pilnuje. Tego się nie da kupić
   w żadnym cenniku; trzeba mieć własny szereg pomiarów co pięć minut. Mamy go.

   Zasada: karta oznaczona jako tania w jednym odczycie i tania ZNOWU w następnym
   to karta, której nikt nie sprząta. Uczciwa nazwa to "utrzymuje się", nie
   "wystawienie przetrwało" — bez identyfikatorów aukcji nie odróżnimy, czy to ta
   sama sztuka, czy kolejna równie tania. Dla gracza to jedno i to samo: wchodzi
   i ona tam jest.

   Uwaga na czytanie tych liczb: sama przeżywalność nie wystarczy. Karta, której
   nikt nie poluje, bywa kartą, której nikt nie kupuje — dlatego przy wysokim
   wyniku trzeba jeszcze sprawdzić, czy w ogóle schodzi. */

/** Aktualizuje rejestr kart. poprzednie: tablica kluczy z poprzedniego odczytu. */
export function dopiszKarty(stanKart, kartyTeraz, poprzednie, at, limit = KART_LIMIT, maxWiek = KART_WIEK){
  const karty = { ...(stanKart && typeof stanKart === "object" ? stanKart : {}) };
  const byly = new Set(Array.isArray(poprzednie) ? poprzednie : []);

  for (const k of (kartyTeraz || [])){
    const w = karty[k.klucz] || { widziano: 0, utrzymal: 0, rabat: 0, najlepszyRabat: 0 };
    w.widziano += 1;
    if (byly.has(k.klucz)) w.utrzymal += 1;
    w.rabat = k.rabat;
    w.najlepszyRabat = Math.max(w.najlepszyRabat || 0, k.rabat);
    w.rating = k.rating;
    w.cena = k.cena;
    w.ostatnio = at;
    karty[k.klucz] = w;
  }

  /* Najpierw wiek, potem twardy limit — rejestr ma nie puchnąć przy 288 przebiegach
     dziennie, a karta sprzed trzech dni i tak nic już nie mówi o dzisiejszym rynku. */
  const zywe = Object.keys(karty).filter(k => (at - (karty[k].ostatnio || 0)) <= maxWiek);
  zywe.sort((a, b) => (karty[b].ostatnio || 0) - (karty[a].ostatnio || 0));
  const zostaw = zywe.slice(0, limit);
  const out = {};
  for (const k of zostaw) out[k] = karty[k];
  return out;
}

/** Karty, na które nikt nie poluje: utrzymują się mimo taniej ceny.
 *  minWidzen odcina te, które mignęły raz — z jednego wystąpienia nic nie wynika. */
export function najmniejPolowane(stanKart, minWidzen = 3){
  const k = stanKart || {};
  return Object.keys(k)
    .map(klucz => {
      const w = k[klucz];
      const widziano = w.widziano || 0;
      return {
        klucz, ...w,
        przezywalnosc: widziano > 1 ? +((w.utrzymal || 0) / (widziano - 1) * 100).toFixed(0) : 0
      };
    })
    .filter(x => x.widziano >= minWidzen)
    .sort((a, b) => b.przezywalnosc - a.przezywalnosc || b.najlepszyRabat - a.najlepszyRabat);
}
