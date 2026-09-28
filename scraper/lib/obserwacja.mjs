/* Watchlista: kilka kart czytanych ze STRONY KARTY co pięć minut.

   Po co, skoro i tak mamy odczyt co pięć minut: bo lista najtańszych w paśmie
   pokazuje tylko ~11 kart na pasmo (sprawdzone 28.09: 13 pasm, 148 linków).
   Karta, która odbija, przestaje być jedną z najtańszych i WYPADA nam z widoku
   w momencie, który jest całym sensem obserwacji. Częstotliwość nie była
   problemem — zasięg był.

   Dlatego watchlista jest LEPKA: raz wybrana karta zostaje na liście przez
   OKNO godzin niezależnie od tego, czy nadal jest tania. Dopiero to pozwala
   zobaczyć, co się z nią stało.

   Czego tu nie ma: pozycji użytkownika. Siedzą w localStorage przeglądarki,
   a to leci na runnerze GitHuba — scraper ich nie widzi i widzieć nie będzie.
   Strona dopasowuje je po nazwie do tego, co obserwujemy. */

export const LIMIT = 8;                 // 8 × ~6 s ≈ 50 s, mieści się w cyklu 5-minutowym
export const OKNO = 12 * 3600;          // jak długo trzymamy kartę na liście
export const HIST_LIMIT = 144;          // 12 h przy odczycie co 5 minut
export const MIN_ODCZYTOW = 6;          // tyle pomiarów poziomu, zanim uwierzymy w przecenę

/** Ile sztuk na godzinę schodzi, policzone z taśmy 50 ostatnich sprzedaży.
 *
 *  Uwaga na czytanie tej liczby: taśma ma sufit 50 pozycji. Jak wszystkie 50
 *  zeszło w kwadrans, to prawdziwa płynność jest WYŻSZA niż policzona i mówimy
 *  o tym wprost (obciete), zamiast podawać dolne oszacowanie jako fakt. */
export function plynnosc(sales, sekundyTemu){
  const wieki = (sales || [])
    .map(s => sekundyTemu(s.ago))
    .filter(x => Number.isFinite(x) && x >= 0);
  if (wieki.length < 3) return null;

  const okno = Math.max(...wieki);
  if (okno <= 0) return null;

  const wGodzine = wieki.filter(x => x <= 3600).length;
  const ceny = (sales || [])
    .filter(s => { const w = sekundyTemu(s.ago); return Number.isFinite(w) && w <= 3600; })
    .map(s => s.price)
    .sort((a, b) => a - b);
  const mediana = ceny.length ? ceny[Math.floor(ceny.length / 2)] : null;

  return {
    naGodzine: Math.round(wieki.length / okno * 3600),
    wGodzine,
    mediana,
    oknoSek: okno,
    obciete: wieki.length >= 50 && okno < 3600
  };
}

/** Kandydaci do obserwacji: karty najbardziej przecenione względem WŁASNEGO
 *  poziomu. Nie względem pasma — pasmo to nie grupa porównawcza. */
export function kandydaci(bands, poziomy, minOdczytow = MIN_ODCZYTOW){
  const out = [];
  const p = poziomy || {};
  for (const rating of Object.keys(bands || {})){
    for (const c of (bands[rating] || [])){
      if (!c || !c.url || !Number.isFinite(c.price) || c.price <= 0) continue;
      const klucz = `${c.name} ${rating}`;
      const w = p[klucz];
      if (!w || !(w.p > 0) || (w.n || 0) < minOdczytow) continue;
      const rabat = (1 - c.price / w.p) * 100;
      if (rabat <= 0) continue;
      out.push({ klucz, nazwa: c.name, rating: +rating, url: c.url, cena: c.price, poziom: w.p, rabat: +rabat.toFixed(1) });
    }
  }
  return out.sort((a, b) => b.rabat - a.rabat);
}

/** Kogo czytamy w tym przebiegu. Najpierw ci, którzy już są na liście i którym
 *  nie minęło okno — dopiero wolne miejsca dobieramy z kandydatów. */
export function doOdczytu(stan, kand, at, limit = LIMIT, okno = OKNO){
  const s = (stan && stan.karty) || {};
  const zostaja = Object.keys(s)
    .filter(k => (at - (s[k].odKiedy || 0)) <= okno && s[k].url)
    .sort((a, b) => (s[b].rabatWejscia || 0) - (s[a].rabatWejscia || 0))
    .slice(0, limit)
    .map(k => ({ klucz: k, nazwa: s[k].nazwa, rating: s[k].rating, url: s[k].url, nowa: false }));

  const juz = new Set(zostaja.map(x => x.klucz));
  const wolne = Math.max(0, limit - zostaja.length);
  const nowi = (kand || []).filter(x => !juz.has(x.klucz)).slice(0, wolne)
    .map(x => ({ ...x, nowa: true }));

  return [...zostaja, ...nowi];
}

/** Dopisuje odczyty do rejestru. odczyty: [{klucz, nazwa, rating, url, nowa,
 *  cena, poziom, rabat, bin, plynnosc, podaz}] — już po wizycie na stronie karty. */
export function dopiszObserwacje(stan, at, odczyty, limit = LIMIT, okno = OKNO, histLimit = HIST_LIMIT){
  const stare = (stan && stan.karty) || {};
  const karty = {};

  for (const o of (odczyty || [])){
    if (!o || !o.klucz) continue;
    const w = stare[o.klucz];
    const cena = Number.isFinite(o.bin) && o.bin > 0 ? o.bin : null;

    /* Nowa karta bez ceny to nie jest obserwacja, tylko nieudany odczyt —
       nie zakładamy wpisu, żeby nie zaśmiecać listy pustymi wierszami. */
    if (!w && cena === null) continue;

    const hist = [...((w && Array.isArray(w.hist)) ? w.hist : [])];
    if (cena !== null) hist.push([at, cena]);

    karty[o.klucz] = {
      nazwa: o.nazwa || (w && w.nazwa) || o.klucz,
      rating: o.rating || (w && w.rating) || null,
      url: o.url || (w && w.url) || null,
      odKiedy: (w && w.odKiedy) || at,
      wejscie: (w && Number.isFinite(w.wejscie)) ? w.wejscie : cena,
      rabatWejscia: (w && Number.isFinite(w.rabatWejscia)) ? w.rabatWejscia : (Number.isFinite(o.rabat) ? o.rabat : 0),
      poziom: Number.isFinite(o.poziom) ? o.poziom : (w && w.poziom) || null,
      cena: cena !== null ? cena : (w && w.cena) || null,
      ostatnio: cena !== null ? at : (w && w.ostatnio) || null,
      plynnosc: o.plynnosc || (w && w.plynnosc) || null,
      podaz: o.podaz || (w && w.podaz) || null,
      hist: hist.slice(-histLimit)
    };
  }

  /* Karty spoza tego przebiegu zostają, dopóki nie minie im okno — inaczej
     jeden nieudany odczyt kasowałby historię zbieraną przez pół dnia. */
  for (const k of Object.keys(stare)){
    if (karty[k]) continue;
    if ((at - (stare[k].odKiedy || 0)) <= okno) karty[k] = stare[k];
  }

  return { at, karty };
}

/** Do wypisania na stronie: ruch od wejścia i to, czy karta w ogóle schodzi. */
export function podsumuj(stan){
  const k = (stan && stan.karty) || {};
  return Object.keys(k).map(klucz => {
    const w = k[klucz];
    const zmiana = (Number.isFinite(w.wejscie) && w.wejscie > 0 && Number.isFinite(w.cena))
      ? +(((w.cena / w.wejscie) - 1) * 100).toFixed(1) : null;
    const doPoziomu = (Number.isFinite(w.poziom) && w.poziom > 0 && Number.isFinite(w.cena))
      ? +(((w.cena / w.poziom) - 1) * 100).toFixed(1) : null;
    return { klucz, ...w, zmiana, doPoziomu, pomiarow: (w.hist || []).length };
  }).sort((a, b) => (b.zmiana ?? -999) - (a.zmiana ?? -999));
}
