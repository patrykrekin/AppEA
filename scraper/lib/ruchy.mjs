/* Szereg cen z listy momentum — nasze śledzenie odbić.

   DLACZEGO STĄD, A NIE ZE STRONY KARTY (sprawdzone 28.09.2026):
   · strona pojedynczej karty bierze ceny przez /api/fut/price-access/sign/,
     a potem /api/fut/player-prices/27/{id}/?verify=<token>. To samo zapytanie
     bez tokenu wraca 403 ze stroną Cloudflare. Z runnera bramka nie przechodzi
     i każdy odczyt wracał pusty. Obchodzenia tego nie robimy.
   · lista momentum woła /api/fut/players/v2/momentum/24/ — inny, niepodpisany
     endpoint, z którego czytamy "Największe ruchy cen" od tygodnia. Działa.

   DLACZEGO MOMENTUM, A NIE PASMA: lista najtańszych w paśmie pokazuje ~11 kart
   na pasmo, więc karta, która odbija, z niej wypada — gubimy ją dokładnie wtedy,
   gdy robi to, co nas interesuje. Momentum to nie lista najtańszych, tylko lista
   ruszających się: karta, która spadła, siedzi na pierwszych stronach, a gdy
   odbije, wychodzi na ostatnich. Cały czas ją widać.
   Zasięg zmierzony na żywo: 30 wierszy na stronę, 10 stron, ostatnia 7 —
   277 graczy, od −11,11% do +47,96%.

   O PRECYZJI, bo to nie jest kosmetyka: fut.gg podaje tu ceny skrócone
   ("17.5K", "680K", "1.2M"). Przy 680K krok wynosi 1000 monet, czyli 0,15%;
   przy 1.2M już 100 000, czyli 8%. Ruchu mniejszego niż krok zaokrąglenia
   NIE WOLNO czytać jako ruchu ceny — dlatego każdy wpis niesie swój krok,
   a odbicie uznajemy dopiero powyżej niego. */

export const LIMIT = 30;                // ile kart trzymamy w szeregu
export const OKNO = 12 * 3600;          // jak długo karta zostaje po ostatnim widzeniu
export const HIST_LIMIT = 72;           // 6 h przy odczycie co 5 minut
export const OKNO_TRENDU = 1800;        // 30 minut — tyle wystarczy, żeby zobaczyć zawracanie
export const WYNIKI_LIMIT = 400;        // ~tydzień zamkniętych obserwacji

/** "17.5K" → { cena: 17500, krok: 100 }. Krok to wartość ostatniej podanej cyfry,
 *  czyli najmniejsza różnica, jaką ten zapis w ogóle potrafi pokazać. */
export function cenaZTekstu(tekst){
  const t = String(tekst || "").trim().replace(/[\s ]/g, "").toUpperCase();
  const m = t.match(/^([\d.,]+)([KM])?$/);
  if (!m) return null;
  const surowa = m[1].replace(/,/g, "");
  const liczba = parseFloat(surowa);
  if (!Number.isFinite(liczba) || liczba <= 0) return null;
  const mnoznik = m[2] === "M" ? 1000000 : m[2] === "K" ? 1000 : 1;
  const poKropce = (surowa.split(".")[1] || "").length;
  const krok = mnoznik / Math.pow(10, poKropce);
  return { cena: Math.round(liczba * mnoznik), krok: Math.max(1, krok) };
}

export function procentZTekstu(tekst){
  const n = parseFloat(String(tekst || "").replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Wiersze z momentum → wpisy do szeregu. wiersz: [nazwa, cena, procent, delta]. */
export function zWierszy(wiersze){
  const out = [];
  for (const w of (wiersze || [])){
    if (!Array.isArray(w) || !w[0]) continue;
    const c = cenaZTekstu(w[1]);
    const p = procentZTekstu(w[2]);
    if (!c || p === null) continue;
    out.push({ klucz: String(w[0]).trim(), cena: c.cena, krok: c.krok, zmiana24: p });
  }
  return out;
}

/** Dopisuje odczyt do szeregu. Trzymamy TYLKO spadki — to one są kandydatami na
 *  odbicie, a pełne 277 kart × 72 pomiary rozdęłoby data.json kilkunastokrotnie. */
export function dopiszRuchy(stan, at, wpisy, limit = LIMIT, okno = OKNO, histLimit = HIST_LIMIT){
  const stare = (stan && stan.karty) || {};
  const karty = { ...stare };

  const kandydaci = (wpisy || [])
    .filter(w => w.zmiana24 < 0)
    .sort((a, b) => a.zmiana24 - b.zmiana24);

  /* Najpierw odświeżamy to, co już śledzimy — nawet jeśli karta wypadła ze spadków,
     bo wyjście ze spadków to właśnie jest odbicie i chcemy je mieć zapisane. */
  const poKluczu = new Map((wpisy || []).map(w => [w.klucz, w]));
  for (const k of Object.keys(karty)){
    const w = poKluczu.get(k);
    if (!w) continue;
    karty[k] = zapisz(karty[k], w, at, histLimit);
  }

  for (const w of kandydaci){
    if (karty[w.klucz]) continue;
    if (Object.keys(karty).length >= limit) break;
    karty[w.klucz] = zapisz(null, w, at, histLimit);
  }

  /* Sprzątanie po oknie. Karta, która z niego wypada, NIE znika po cichu —
     zamykamy jej obserwację i odkładamy wynik do rejestru. To on jest materiałem
     na licznik trafień; bez niego po tygodniu nadal nie wiedzielibyśmy nic. */
  const out = {};
  const wyniki = [...((stan && Array.isArray(stan.wyniki)) ? stan.wyniki : [])];
  for (const k of Object.keys(karty)){
    if ((at - (karty[k].ostatnio || 0)) <= okno) out[k] = karty[k];
    else wyniki.push(zamknij(karty[k], at));
  }
  return { at, karty: out, wyniki: wyniki.slice(-WYNIKI_LIMIT) };
}

/* Podsumowanie rejestru: ile kart doszło do celu i po jakim czasie.
   minProb pilnuje, żeby nie ogłaszać skuteczności z trzech obserwacji. */
export function skutecznosc(stan, minProb = 20){
  const w = (stan && Array.isArray(stan.wyniki)) ? stan.wyniki : [];
  if (w.length < minProb) return { probek: w.length, gotowe: false };
  const doszly = w.filter(x => Number.isFinite(x.doCelu));
  const czasy = doszly.map(x => x.doCelu).sort((a, b) => a - b);
  const doDna = w.map(x => x.doDna).filter(Number.isFinite).sort((a, b) => a - b);
  const med = a => a.length ? a[Math.floor(a.length / 2)] : null;
  return {
    probek: w.length, gotowe: true,
    doszly: doszly.length,
    trafienie: +((doszly.length / w.length) * 100).toFixed(0),
    medianaDoCelu: med(czasy),
    medianaDoDna: med(doDna)
  };
}

function zapisz(stary, w, at, histLimit){
  const hist = [...((stary && Array.isArray(stary.hist)) ? stary.hist : []), [at, w.cena]];

  /* Dno i MOMENT dna. Sam poziom dna nie wystarcza: "kiedy skupić" to pytanie
     o czas, a nie o cenę. Karta, która przed minutą zrobiła nowe dno, i karta,
     która nie robi nowego dna od godziny, mają tę samą wartość `najnizsza`
     i zupełnie inne znaczenie. */
  const bylo = stary && Number.isFinite(stary.najnizsza) ? stary.najnizsza : null;
  const noweDno = bylo === null || w.cena < bylo;
  const najnizsza = noweDno ? w.cena : bylo;
  const najnizszaAt = noweDno ? at : (stary && stary.najnizszaAt) || at;

  /* Poziom sprzed przeceny, zamrożony w chwili wejścia na listę. Późniejsza
     zmiana dobowa przesuwałaby cel pod wynik — a wtedy nie dałoby się uczciwie
     policzyć, czy karta do niego doszła. */
  const celStart = (stary && Number.isFinite(stary.celStart))
    ? stary.celStart
    : (w.zmiana24 < 0 ? Math.round(w.cena / (1 + w.zmiana24 / 100)) : null);

  const osiagnietyAt = (stary && stary.osiagnietyAt)
    || (celStart && w.cena >= celStart ? at : null);

  /* Najwyższa cena PO dnie — z tego liczymy, jak mocno odbiła, nawet gdy nie
     doszła do celu. Reset przy nowym dnie, bo poprzedni szczyt przestaje mieć
     związek z tym, co mierzymy. */
  const najwyzszaPoDnie = noweDno ? w.cena
    : Math.max((stary && stary.najwyzszaPoDnie) || w.cena, w.cena);

  return {
    klucz: w.klucz,
    cena: w.cena,
    krok: w.krok,
    zmiana24: w.zmiana24,
    wejscie: (stary && Number.isFinite(stary.wejscie)) ? stary.wejscie : w.cena,
    spadekStart: (stary && Number.isFinite(stary.spadekStart)) ? stary.spadekStart : w.zmiana24,
    celStart,
    odKiedy: (stary && stary.odKiedy) || at,
    najnizsza, najnizszaAt, najwyzszaPoDnie, osiagnietyAt,
    ostatnio: at,
    hist: hist.slice(-histLimit)
  };
}

/* Zamknięta obserwacja — jeden wiersz do rejestru wyników. Z tego policzymy,
   ile kart w ogóle wraca i po jakim czasie, czyli odpowiemy na "kiedy skupić"
   liczbą, a nie przeczuciem. */
function zamknij(w, at){
  const minut = s => Math.max(0, Math.round(s / 60));
  const odbicie = (w.najnizsza > 0 && w.najwyzszaPoDnie > 0)
    ? +(((w.najwyzszaPoDnie / w.najnizsza) - 1) * 100).toFixed(1) : null;
  return {
    klucz: w.klucz,
    spadek: w.spadekStart ?? w.zmiana24 ?? null,
    cenaStart: w.wejscie ?? null,
    cel: w.celStart ?? null,
    dno: w.najnizsza ?? null,
    doDna: (w.najnizszaAt && w.odKiedy) ? minut(w.najnizszaAt - w.odKiedy) : null,
    doCelu: w.osiagnietyAt ? minut(w.osiagnietyAt - w.odKiedy) : null,
    odbicie,
    trwala: minut(at - (w.odKiedy || at)),
    zamkniete: at
  };
}

/** Ruch ceny w ostatnich `okno` sekundach, liczony TYLKO jeśli przekracza krok
 *  zaokrąglenia fut.gg. Poniżej kroku nie wiemy, czy cena drgnęła, czy to zapis. */
export function trend(karta, at, okno = OKNO_TRENDU){
  const h = (karta && Array.isArray(karta.hist)) ? karta.hist : [];
  if (h.length < 2) return null;
  const odniesienie = h.find(x => (at - x[0]) <= okno) || h[0];
  const od = odniesienie[1], doCeny = h[h.length - 1][1];
  if (!(od > 0)) return null;
  const roznica = doCeny - od;
  if (Math.abs(roznica) < (karta.krok || 1)) return { procent: 0, poniżejKroku: true, sekund: at - odniesienie[0] };
  return {
    procent: +((roznica / od) * 100).toFixed(1),
    poniżejKroku: false,
    sekund: at - odniesienie[0]
  };
}

/** Karty, które spadły w dobę, a w ostatniej półgodzinie zawracają w górę.
 *  To jest OBSERWACJA, nie prognoza — mówimy, co się dzieje, nie co się stanie. */
export function odbicia(stan, at, okno = OKNO_TRENDU){
  const k = (stan && stan.karty) || {};
  return Object.keys(k).map(klucz => {
    const w = k[klucz];
    const t = trend(w, at, okno);
    const odDna = (w.najnizsza > 0 && w.cena > 0) ? +(((w.cena / w.najnizsza) - 1) * 100).toFixed(1) : null;
    return { ...w, trend: t, odDna, pomiarow: (w.hist || []).length };
  })
  .filter(x => x.trend && !x.trend.poniżejKroku && x.trend.procent > 0 && x.zmiana24 < 0)
  .sort((a, b) => b.trend.procent - a.trend.procent);
}

/** Do wypisania na stronie: wszystko, co śledzimy, najpierw to, co zawraca. */
export function podsumuj(stan, at, okno = OKNO_TRENDU){
  const k = (stan && stan.karty) || {};
  return Object.keys(k).map(klucz => {
    const w = k[klucz];
    const t = trend(w, at, okno);
    return {
      ...w, trend: t, pomiarow: (w.hist || []).length,
      odDna: (w.najnizsza > 0 && w.cena > 0) ? +(((w.cena / w.najnizsza) - 1) * 100).toFixed(1) : null
    };
  }).sort((a, b) => {
    const ta = (a.trend && !a.trend.poniżejKroku) ? a.trend.procent : -999;
    const tb = (b.trend && !b.trend.poniżejKroku) ? b.trend.procent : -999;
    return tb - ta;
  });
}
