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

export const PROG = 0.10;          // ile pod WŁASNYM poziomem karty liczy się za okazję
export const ALFA = 0.05;          // waga nowego odczytu w poziomie karty (~1 h półtrwania)
export const MIN_ODCZYTOW = 6;     // pół godziny obserwacji, zanim uwierzymy w poziom karty

/* Wersja definicji okazji. 1 — tanio względem dna pasma (dawało wieczne "okazje"
   w rodzaju Gabriela). 2 — tanio względem własnego poziomu karty. Liczby z jednej
   definicji nie znaczą tego samego co z drugiej, więc przy zmianie rejestr startuje
   od zera zamiast sklejać dwa różne pomiary w jedną statystykę. */
export const WERSJA = 2;
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

/* Poziom karty: wykładnicza średnia jej WŁASNYCH cen.
   Do 28.09.2026 porównywaliśmy kartę z medianą dna jej pasma i to był błąd.
   Pasmo nie jest grupą porównawczą — Gabriel 89 stał 47% pod dnem pasma przez
   99 odczytów z rzędu i wyglądał jak wieczna okazja. Nie był okazją. Był kartą,
   której nikt nie chce, i jego cena po prostu TAKA jest.

   Karta jest okazją wtedy, gdy jest tania WZGLĘDEM SIEBIE. Gabriel stojący
   niezmiennie na 19 250 dostaje poziom 19 250 i przestaje być zgłaszany.
   Karta, która normalnie chodzi po 4 000 i spada na 3 000 — zgłaszana.

   Alfa 0,05 przy odczycie co 5 minut daje około godziny półtrwania: nowa cena
   staje się normą po godzinie. To celowe. Po godzinie taniości to już nie jest
   anomalia, tylko nowy poziom rynku. */
export function aktualizujPoziomy(stare, bands, at, alfa = ALFA, maxWiek = KART_WIEK){
  const out = {};
  const p = stare && typeof stare === "object" ? stare : {};
  for (const r of KOSZYK){
    for (const c of (bands[r] || [])){
      if (!c || !Number.isFinite(c.price) || c.price <= 0) continue;
      const k = `${c.name} ${r}`;
      const w = p[k];
      out[k] = w && w.p > 0
        ? { p: Math.round(w.p * (1 - alfa) + c.price * alfa), n: (w.n || 0) + 1, t: at }
        : { p: c.price, n: 1, t: at };
    }
  }
  /* Karty, które wypadły z dna pasma, trzymamy jeszcze chwilę — wrócą pod tą samą
     nazwą i szkoda tracić ich poziom. Po trzech dniach i tak nic już nie mówi. */
  for (const k of Object.keys(p)){
    if (!out[k] && (at - (p[k].t || 0)) <= maxWiek) out[k] = p[k];
  }
  return out;
}

/** bands: dane z fut.gg, poziomy: stan SPRZED tego odczytu — inaczej dzisiejsza
 *  tania cena sama obniżyłaby próg, który ma pobić. */
export function policzOkazje(bands, poziomy, prog = PROG, minOdczytow = MIN_ODCZYTOW){
  const pasma = {};
  const karty = [];
  const poz = poziomy && typeof poziomy === "object" ? poziomy : {};
  let razem = 0;
  for (const r of KOSZYK){
    const tanie = [];
    for (const c of (bands[r] || [])){
      if (!c || !Number.isFinite(c.price) || c.price <= 0) continue;
      const k = `${c.name} ${r}`;
      const w = poz[k];
      if (!w || !(w.p > 0) || (w.n || 0) < minOdczytow) continue;   // za mało obserwacji
      if (c.price > w.p * (1 - prog)) continue;
      tanie.push(c);
      karty.push({
        klucz: k, nazwa: c.name, rating: r, cena: c.price, poziom: w.p,
        rabat: +((1 - c.price / w.p) * 100).toFixed(1)
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
  /* Rejestr z poprzedniej definicji odpada w całości — patrz WERSJA. */
  const zgodna = (s.wersja || 1) === WERSJA;
  const poprz = zgodna ? (s.ostatnie || {}) : {};
  const stareKarty = zgodna ? (s.karty || {}) : {};
  const kartyPs = dopiszKarty(stareKarty.ps, ps?.karty, poprz.ps, at);
  const kartyPc = dopiszKarty(stareKarty.pc, pc?.karty, poprz.pc, at);

  /* Sam licznik nie wystarczy: "3 okazje" bez nazw jest nie do wykorzystania.
     Zapisujemy karty z BIEŻĄCEGO odczytu, żeby strona mogła je wypisać z ceną,
     poziomem i przeceną. Kilka pozycji na odczyt, więc plik tego nie odczuje. */
  const teraz = {
    ps: (ps?.karty || []).slice(0, 8),
    pc: (pc?.karty || []).slice(0, 8)
  };

  return {
    prog: PROG, wersja: WERSJA, odKiedy: s.odKiedy || at, godziny, log, teraz, terazAt: at,
    poziomy: { ps: ps?.poziomy || (s.poziomy || {}).ps || {}, pc: pc?.poziomy || (s.poziomy || {}).pc || {} },
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
