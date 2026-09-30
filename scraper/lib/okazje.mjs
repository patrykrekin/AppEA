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
import { listBelow, snapDown, net, stepFor } from "./grid.mjs";

export const PROG = 0.10;          // ile pod WŁASNYM poziomem karty liczy się za okazję
export const ALFA = 0.05;          // waga nowego odczytu w poziomie karty (~1 h półtrwania)
export const MIN_ODCZYTOW = 6;     // pół godziny obserwacji, zanim uwierzymy w poziom karty

/* Wersja definicji okazji. 1 — tanio względem dna pasma (dawało wieczne "okazje"
   w rodzaju Gabriela). 2 — tanio względem własnego poziomu karty. Liczby z jednej
   definicji nie znaczą tego samego co z drugiej i sklejać ich nie wolno.

   Do 28.09.2026 rozwiązywaliśmy to KASOWANIEM całego rejestru przy zmianie
   wersji. To był błąd i widać go dopiero, gdy rejestr zaczyna do czegoś służyć:
   zmiana progu wyrzucała dokładnie ten materiał, na którym dałoby się sprawdzić,
   czy zmiana progu pomogła. Dowód ginął razem z powodem, dla którego się go
   zbierało — a każde wdrożenie startowało od zera.

   Teraz każda karta w rejestrze nosi podpis definicji, pod którą jej licznik
   rośnie. Zmiana definicji nie kasuje rejestru; zeruje licznik POJEDYNCZEJ karty
   przy pierwszym odczycie w nowej definicji (bo mieszanie jej widzeń z dwóch
   progów byłoby zwykłym fałszem), a resztę zostawia z podpisem starym, do
   osobnego rachunku. */
export const WERSJA = 2;
export const LOG_LIMIT = 288;      // doba przy przebiegu co 5 minut
export const KART_LIMIT = 80;      // ile kart trzymamy w rejestrze przeżywalności
export const KART_WIEK = 3 * 86400;

/** Podpis definicji okazji. Wchodzą parametry, które zmieniają znaczenie wpisu:
 *  wersja definicji, próg i ile odczytów musi mieć poziom, żebyśmy mu wierzyli. */
export function definicjaOkazji(){
  return `w${WERSJA}-p${Math.round(PROG * 100)}-o${MIN_ODCZYTOW}`;
}

/* ── Poziom DOBOWY i pozycje inwestycyjne ────────────────────────────────────

   Po co drugi poziom, skoro mamy już własny poziom karty: bo one odpowiadają na
   dwa różne pytania. Poziom z alfą 0,05 ma pół godziny–godzinę pamięci i łapie
   MIGNIĘCIA — czyjeś tanie wystawienie, które żyje minuty i które i tak zabierze
   bot. Poziom dobowy ma kilkanaście godzin pamięci i łapie PRZECENĘ: kartę, która
   naprawdę zeszła niżej i stoi tam od godzin.

   Pierwsze jest okazją snajperską, drugie pozycją inwestycyjną. Do tej pory
   strona miała tylko to pierwsze i dlatego w nagłówku wiecznie siedział flip.

   Alfa 0,005 przy odczycie co 5 minut to około 11,5 h półtrwania. Nowy poziom
   zasiewamy szybkim poziomem tej samej karty, a nie ceną z jednego odczytu —
   inaczej pierwszego dnia każda karta miałaby poziom równy swojej cenie i nic
   by się nie zgłaszało. */
export const ALFA_D = 0.005;
/* 30.09.2026, po dobie pomiaru. Było 0,08 i przez to rejestr miał WYŁĄCZNIE karty
   po 32 000–152 000. Przyczyna nie jest oczywista: procent zderza się z siatką cen.

     karta    650, krok  50  →  8% to 1,04 kroku, więc realnie potrzeba DWÓCH = 15,4%
     karta  1 800, krok 100  →  8% to 1,44 kroku, więc dwóch                  = 11,1%
     karta  3 900, krok 100  →  8% to 3,12 kroku, więc czterech               = 10,3%
     karta 32 000, krok 250  →  8% to 10,2 kroku — płynnie, bez zaokrągleń

   Czyli na tanim foderze próg 8% oznaczał w praktyce wymaganie piętnastoprocentowej
   przeceny, a na drogich kartach dokładnie to, co napisane. Nie mierzyliśmy tego
   samego zjawiska w obu przedziałach, tylko dwóch różnych.

   monitor.mjs miał to od początku dobrze: procent ORAZ minimum jeden krok siatki.
   Zrównujemy — teraz oba moduły stosują to samo kryterium do tego samego pytania. */
export const PROG_INW = 0.05;      // ile pod poziomem dobowym to już przecena, nie szum
export const MIN_KROKOW = 1;       // i co najmniej tyle kroków siatki, żeby to nie było zaokrąglenie
export const MIN_ODCZYTOW_D = 24;  // dwie godziny obserwacji, zanim uwierzymy w poziom dobowy
export const INW_MARZA = 0.05;     // marża netto, której wymagamy od pozycji
export const INW_LIMIT = 12;
export const MIN_TRWALOSC = 6;        // sześć odczytów z rzędu
export const MIN_TRWALOSC_SEK = 1500; // i co najmniej 25 minut zegarowych

/* TRWAŁOŚĆ — bez tego poziom dobowy nie wystarcza i przekonałem się o tym na żywo.
   28.09 o 18:40 Fernández 86 stał po 3 000 przy poziomie dobowym 3 983 (−24,7%)
   i wyglądał jak pozycja inwestycyjna. Siedem minut później na fut.gg stał
   z powrotem po 4 100. To nie była przecena, tylko jedno tanie wystawienie —
   czyli dokładnie ten snajp, od którego chcieliśmy uciec, tylko wykryty innym
   poziomem.

   Różnica między okazją a pozycją nie leży w tym, JAK GŁĘBOKO karta stoi pod
   swoim poziomem, tylko JAK DŁUGO. Pojedyncze tanie wystawienie żyje minuty.
   Prawdziwa przecena stoi godzinami. Dlatego liczymy, ile odczytów z rzędu karta
   jest pod progiem, i zerujemy licznik, gdy tylko z niego wyjdzie. */
/** Czy karta stoi wyraźnie pod swoim poziomem: procentowo ORAZ o co najmniej
 *  krok siatki. Jeden warunek bez drugiego jest bezużyteczny — sam procent
 *  przepuszcza zaokrąglenia na tanich kartach, sam krok przepuszcza wszystko
 *  na drogich. Trwałość i pozycje MUSZĄ pytać tym samym predykatem, inaczej
 *  licznik stażu rósłby kartom, które i tak nigdy nie zostaną zgłoszone. */
export function podProgiem(cena, poziom, prog = PROG_INW, minKrokow = MIN_KROKOW){
  if (!(cena > 0) || !(poziom > 0)) return false;
  if (cena > poziom * (1 - prog)) return false;
  return (poziom - cena) >= minKrokow * stepFor(poziom);
}

export function aktualizujTrwalosc(stare, bands, poziomyD, at, prog = PROG_INW){
  const out = {};
  const s = stare && typeof stare === "object" ? stare : {};
  const p = poziomyD || {};
  /* Karty widziane w TYM odczycie. Bez tego przenoszenie starych wpisów cofałoby
     wyzerowanie: karta, która właśnie wyszła ponad próg, wracałaby ze swoim
     poprzednim stażem i pozycja nigdy by nie znikła. */
  const widziane = new Set();
  for (const r of KOSZYK){
    for (const c of (bands[r] || [])){
      if (!c || !Number.isFinite(c.price) || c.price <= 0) continue;
      const k = `${c.name} ${r}`;
      const w = p[k];
      if (!w || !(w.p > 0)) continue;
      widziane.add(k);
      const pod = podProgiem(c.price, w.p, prog);
      /* Zer NIE zapisujemy. Brak wpisu znaczy dokładnie to samo co licznik zero,
         a 28.09 na 190 kart w rejestrze 179 miało zero — 18 kB w data.json,
         który strona i tak pobiera co minutę. */
      if (pod){
        const było = s[k];
        out[k] = { n: ((było && było.n) || 0) + 1, od: (było && było.n && było.od) || at, t: at };
      }
    }
  }
  /* Karty NIEWIDZIANEJ w tym odczycie nie przenosimy — i to jest sedno.
     28.09 przy walidacji wyszło, że Foden 84 miał staż 4, ale pierwszy odczyt
     sprzed DWÓCH GODZIN. Karta wypada z jedenastu najtańszych w paśmie i wraca,
     a licznik rósł dalej — więc "6 odczytów" znaczyło "6 zauważeń rozrzuconych
     po kilku godzinach", a nie "pół godziny pod progiem".
     Skoro karty nie widzimy, nie wiemy, po ile stoi. Uczciwie jest zerwać serię. */
  return out;
}

export function aktualizujPoziomyD(stareD, szybkie, bands, at, alfa = ALFA_D, maxWiek = KART_WIEK){
  const out = {};
  const p = stareD && typeof stareD === "object" ? stareD : {};
  const s = szybkie && typeof szybkie === "object" ? szybkie : {};
  for (const r of KOSZYK){
    for (const c of (bands[r] || [])){
      if (!c || !Number.isFinite(c.price) || c.price <= 0) continue;
      const k = `${c.name} ${r}`;
      const w = p[k];
      if (w && w.p > 0){
        out[k] = { p: Math.round(w.p * (1 - alfa) + c.price * alfa), n: (w.n || 0) + 1, t: at };
      } else {
        const zasiew = (s[k] && s[k].p > 0) ? s[k].p : c.price;
        out[k] = { p: zasiew, n: (s[k] && s[k].n) || 1, t: at };
      }
    }
  }
  for (const k of Object.keys(p)){
    if (!out[k] && (at - (p[k].t || 0)) <= maxWiek) out[k] = p[k];
  }
  return out;
}

/* Pozycje inwestycyjne: karta stojąca wyraźnie pod swoim poziomem dobowym.
   Cel wyjścia to ten poziom (krok siatki niżej, żeby schodziło), a cena wejścia
   jest liczona wstecz od celu tak, żeby po 5% podatku została marża. */
export function policzInwestycje(bands, poziomyD, trwalosc, at, prog = PROG_INW, minOdczytow = MIN_ODCZYTOW_D, limit = INW_LIMIT, minTrwalosc = MIN_TRWALOSC){
  const p = poziomyD || {};
  const tr = trwalosc || {};
  const out = [];
  for (const r of KOSZYK){
    for (const c of (bands[r] || [])){
      if (!c || !Number.isFinite(c.price) || c.price <= 0) continue;
      const klucz = `${c.name} ${r}`;
      const w = p[klucz];
      if (!w || !(w.p > 0) || (w.n || 0) < minOdczytow) continue;
      if (!podProgiem(c.price, w.p, prog)) continue;

      /* Pod progiem od co najmniej pół godziny — inaczej to nie pozycja,
         tylko czyjeś tanie wystawienie, które zniknie, zanim zdążysz spojrzeć. */
      const t = tr[klucz];
      if (!t || (t.n || 0) < minTrwalosc) continue;
      /* Dwa warunki, nie jeden: tyle odczytów ORAZ tyle czasu. Sam licznik można
         uzbierać na przeskokach, sam czas nie mówi, czy patrzyliśmy. */
      if (!(t.od > 0) || (at - t.od) < MIN_TRWALOSC_SEK) continue;

      const cel = listBelow(w.p);
      if (!(cel > 0)) continue;

      /* 30.09.2026, godzinę po obniżeniu progu do 5%: cel MUSI być nad dzisiejszą
         ceną. Brzmi banalnie, a bez tego warunku silnik produkował pozycje-zombi.

         Mechanizm: cel to krok siatki pod poziomem, a przy tanich kartach krok
         jest gruby względem przeceny. Foden 84 po 650 przy poziomie 700 dawał
         cel = listBelow(700) = 650 — czyli dokładnie tyle, ile karta kosztuje.
         Rejestr otwierał wiersz i natychmiast go zamykał, bo warunek trafienia
         brzmi `cena >= cel`: werdykt „cel", czas do celu 0 minut, trwała 0.
         Każda taka karta dopisywałaby FAŁSZYWE trafienie do skuteczności —
         czyli psułaby dokładnie tę liczbę, dla której cały ten tydzień mierzymy.

         Przy progu 8% to się nie zdarzało, bo przecena zawsze przekraczała krok
         z zapasem. Obniżenie progu odsłoniło dziurę, która siedziała tam od początku. */
      if (!(cel > c.price)) continue;
      const kupnoDo = snapDown(Math.floor(cel * 0.95 / (1 + INW_MARZA)));
      const netto = net(kupnoDo, cel);
      if (!(kupnoDo > 0) || netto <= 0) continue;

      out.push({
        klucz, nazwa: c.name, rating: r, pos: c.pos || null,
        cena: c.price, poziom: w.p, odczytow: w.n,
        rabat: +((1 - c.price / w.p) * 100).toFixed(1),
        cel, kupnoDo, netto,
        podProgiem: t.n, odSekund: (at && t.od) ? Math.max(0, at - t.od) : null,
        wzasiegu: c.price <= kupnoDo,
        zwrot: +((netto / kupnoDo) * 100).toFixed(1)
      });
    }
  }
  /* Najpierw to, co da się wziąć TERAZ, potem po zwrocie — nagłówek ma być
     czynnością, nie ciekawostką. */
  return out.sort((a, b) => (b.wzasiegu - a.wzasiegu) || (b.zwrot - a.zwrot)).slice(0, limit);
}

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
      if (!podProgiem(c.price, w.p, prog)) continue;
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
  /* Rejestru NIE kasujemy przy zmianie definicji — patrz komentarz przy WERSJA.
     Podpis jedzie na każdej karcie i to on pilnuje, żeby nie liczyć dwóch
     progów jako jednej statystyki. */
  const def = definicjaOkazji();
  const poprz = s.ostatnie || {};
  const stareKarty = s.karty || {};
  const kartyPs = dopiszKarty(stareKarty.ps, ps?.karty, poprz.ps, at, KART_LIMIT, KART_WIEK, def);
  const kartyPc = dopiszKarty(stareKarty.pc, pc?.karty, poprz.pc, at, KART_LIMIT, KART_WIEK, def);

  /* Sam licznik nie wystarczy: "3 okazje" bez nazw jest nie do wykorzystania.
     Zapisujemy karty z BIEŻĄCEGO odczytu, żeby strona mogła je wypisać z ceną,
     poziomem i przeceną. Kilka pozycji na odczyt, więc plik tego nie odczuje. */
  const teraz = {
    ps: (ps?.karty || []).slice(0, 8),
    pc: (pc?.karty || []).slice(0, 8)
  };

  return {
    prog: PROG, wersja: WERSJA, def, odKiedy: s.odKiedy || at, godziny, log, teraz, terazAt: at,
    poziomy: { ps: ps?.poziomy || (s.poziomy || {}).ps || {}, pc: pc?.poziomy || (s.poziomy || {}).pc || {} },
    /* Poziom dobowy jedzie tą samą drogą co szybki — bez tego wracałby do zera
       przy każdym przebiegu i pozycje inwestycyjne nigdy by się nie ustabilizowały. */
    poziomyD: { ps: ps?.poziomyD || (s.poziomyD || {}).ps || {}, pc: pc?.poziomyD || (s.poziomyD || {}).pc || {} },
    trwalosc: { ps: ps?.trwalosc || (s.trwalosc || {}).ps || {}, pc: pc?.trwalosc || (s.trwalosc || {}).pc || {} },
    /* Szereg szybkiego poziomu — ta sama droga co poziomy. Bez przeniesienia
       przy pustym odczycie kasowałby się co przebieg i sygnał zwrotu nigdy by
       nie powstał, bo potrzebuje sześciu kolejnych wartości. */
    szereg: { ps: ps?.szereg || (s.szereg || {}).ps || {}, pc: pc?.szereg || (s.szereg || {}).pc || {} },
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

/** Aktualizuje rejestr kart. poprzednie: tablica kluczy z poprzedniego odczytu.
 *  def: podpis bieżącej definicji — karta z innym podpisem liczy od nowa, ale
 *  reszta rejestru zostaje na miejscu. */
export function dopiszKarty(stanKart, kartyTeraz, poprzednie, at, limit = KART_LIMIT, maxWiek = KART_WIEK, def = definicjaOkazji()){
  const karty = { ...(stanKart && typeof stanKart === "object" ? stanKart : {}) };
  const byly = new Set(Array.isArray(poprzednie) ? poprzednie : []);

  for (const k of (kartyTeraz || [])){
    const stary = karty[k.klucz];
    /* Karta zliczana pod inną definicją startuje od zera — jej dotychczasowe
       widzenia mierzyły inny próg. Kasujemy jedną kartę, nie rejestr. */
    const w = (stary && stary.def === def)
      ? stary
      : { widziano: 0, utrzymal: 0, rabat: 0, najlepszyRabat: 0, def };
    w.widziano += 1;
    if (byly.has(k.klucz) && w.widziano > 1) w.utrzymal += 1;
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
 *  minWidzen odcina te, które mignęły raz — z jednego wystąpienia nic nie wynika.
 *  def: gdy podany, liczymy tylko karty zmierzone pod tą definicją. */
export function najmniejPolowane(stanKart, minWidzen = 3, def = null){
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
    .filter(x => x.widziano >= minWidzen && (!def || x.def === def))
    .sort((a, b) => b.przezywalnosc - a.przezywalnosc || b.najlepszyRabat - a.najlepszyRabat);
}
