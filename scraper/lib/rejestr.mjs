/* Rejestr wyników pozycji inwestycyjnych — czy nasze typy w ogóle wychodzą.

   Po co to istnieje. Do 28.09.2026 strona umiała powiedzieć "ta karta stoi 15%
   pod swoim poziomem dobowym od pół godziny". Czego nie umiała powiedzieć: czy
   z takiej pozycji kiedykolwiek były pieniądze. Bez tego cała sekcja
   inwestycyjna to rozumowanie, a nie pomiar — brzmi sensownie i może być
   kompletnie nietrafna.

   Rejestr zamyka tę dziurę: każda wykryta pozycja dostaje wiersz, po dobie
   wiersz się zamyka z werdyktem, a z zamkniętych liczymy skuteczność.

   Dwa sposoby, w jakie pozycja może się nie udać — i to jest sedno:

     · cena nie wraca do poziomu            → zwykłe pudło
     · POZIOM schodzi do ceny               → rynek przecenił kartę, a nasz
                                              poziom dobowy (~11,5 h pamięci)
                                              był po prostu spóźniony

   To drugie jest groźniejsze, bo z zewnątrz wygląda identycznie jak pozycja:
   tania karta, która nie znika. Dlatego rejestr pilnuje NAJNIŻSZEGO poziomu po
   wejściu, nie tylko ceny. Bez tej jednej liczby nie da się odróżnić "rynek się
   mylił" od "my się myliliśmy".

   Czego ten rejestr NIE zmierzy uczciwie, i trzeba o tym pamiętać przy czytaniu
   wyników: widzimy tylko ~11 najtańszych kart w paśmie (lekcja z Kim Min Jae).
   Karta, której cena naprawdę wróciła do poziomu, często właśnie dlatego WYPADA
   z tego okna — i wtedy tracimy ją z oczu w momencie wygranej. Dlatego drugą
   nogą jest momentum (277 zawodników z ceną, bez limitu pasma), a wynik bez
   potwierdzenia ląduje w kubełku "urwane", który trzymamy OSOBNO i wyrzucamy z
   mianownika skuteczności. Gdyby wpadł do pudeł, zaniżałby wynik tym mocniej,
   im lepiej by nam wychodziło.

   Rejestr NIE jest kasowany przy wdrożeniu. Każdy wiersz nosi podpis definicji
   (`def`), pod którą powstał, więc zmiana progu nie zeruje historii — tylko
   dzieli ją na "ta definicja" i "starsze". Zerowanie rejestru przy każdej
   zmianie parametru odbierałoby nam dokładnie ten dowód, dla którego zmianę
   robimy. */

import { PROG_INW, MIN_KROKOW, ALFA_D, MIN_ODCZYTOW_D, MIN_TRWALOSC, MIN_TRWALOSC_SEK } from "./okazje.mjs";
import { onGrid } from "./grid.mjs";

export const HORYZONT = 24 * 3600;   // doba na rozstrzygnięcie pozycji
export const LUKA = 2 * 3600;        // tyle bez widoku ceny i zamykamy jako "urwane"
export const WYNIKI_LIMIT = 150;     // pozycje są rzadkie — to raczej miesiące niż dni
export const HIST_LIMIT = 40;        // próbki zapisujemy tylko przy zmianie
export const MIN_PROB = 15;          // poniżej tego nie ogłaszamy żadnej skuteczności
/* 03.10.2026 — ile odczytów Z RZĘDU cena musi stać na celu, żeby to było
   trafienie. Do dziś wystarczyła JEDNA obserwacja, podczas gdy wejście
   wymagało sześciu przez 25 minut. Ta asymetria produkowała 96% skuteczności
   przy medianie 150 s.

   Zmierzone na 761 odczytach z 22 otwartych pozycji: z 331 skoków w górę
   o co najmniej krok siatki aż 235 cofało się już w następnym odczycie.
   Siedem na dziesięć ruchów to mignięcie przy przestawianiu kolejki ofert,
   a nie ruch ceny.

   Dwa, nie sześć: pojedyncze mignięcie odpada, a prawdziwy ruch nie musi
   czekać pół godziny na potwierdzenie. Czas do celu liczymy od PIERWSZEGO
   dotknięcia, nie od potwierdzenia — bo wtedy cena faktycznie tam była,
   a drugi odczyt tylko mówi, że to nie było mrugnięcie. */
export const MIN_TRWALOSC_CELU = 2;

/** Podpis definicji pozycji. Wchodzą tu WYŁĄCZNIE parametry, które zmieniają
 *  znaczenie wiersza — próg, pamięć poziomu, wymagana obserwacja i trwałość.
 *  Zmiana któregokolwiek sprawia, że stare wiersze mierzyły coś innego. */
export function definicja(){
  return [
    `p${Math.round(PROG_INW * 100)}`,
    `k${MIN_KROKOW}`,
    `a${Math.round(ALFA_D * 1000)}`,
    `o${MIN_ODCZYTOW_D}`,
    `t${MIN_TRWALOSC}`,
    `s${MIN_TRWALOSC_SEK}`,
     `c${MIN_TRWALOSC_CELU}`
  ].join("-");
}

export const SWIEZOSC = 600;         // starszej ceny z momentum nie uznajemy

/** Ceny widziane W TYM przebiegu, z dwóch źródeł. Pasma są świeższe, więc mają
 *  pierwszeństwo; momentum dokłada karty, które wypadły z jedenastki.
 *
 *  Szereg momentum trzyma karty przez 12 h, więc jego wpisy mogą być z odczytu
 *  sprzed godzin. Cena sprzed godziny nie może potwierdzić dojścia do celu —
 *  ogłosilibyśmy trafienie na podstawie kursu, którego już nie ma. Dlatego liczy
 *  się tylko wpis dotknięty w tym przebiegu.
 *
 *  UWAGA na platformę: momentum wolno podać tylko przy rejestrze tej platformy,
 *  która była ustawiona w chwili odczytu (ciasteczko futgg_platform — patrz
 *  scrape.mjs). Wstawienie tu szeregu z PC do rejestru konsoli produkowałoby
 *  trafienia z cudzego rynku. */
export function zrodloCen(bands, ruchy, at = null, swiezosc = SWIEZOSC){
  const out = {};
  for (const k of Object.keys((ruchy && ruchy.karty) || {})){
    const c = ruchy.karty[k];
    if (!c || !Number.isFinite(c.cena) || c.cena <= 0) continue;
    if (at !== null && !(Number.isFinite(c.ostatnio) && (at - c.ostatnio) <= swiezosc)) continue;
    out[k] = { cena: c.cena, skad: "momentum" };
  }
  for (const r of Object.keys(bands || {})){
    for (const c of (bands[r] || [])){
      if (c && Number.isFinite(c.price) && c.price > 0) out[`${c.name} ${r}`] = { cena: c.price, skad: "pasmo" };
    }
  }
  return out;
}

function minuty(s){ return Math.max(0, Math.round(s / 60)); }

/** Werdykt liczony w chwili zamknięcia. Kolejność warunków jest treścią, nie
 *  stylem: trafienie bije wszystko, potem zjazd poziomu (nasz błąd, nie rynku),
 *  potem brak widoku, a "głębiej" i "płasko" dopiero na końcu. */
export function werdykt(r, at){
  if (r.osiagnietyAt) return "cel";
  if (Number.isFinite(r.poziomMin) && r.poziomMin <= r.wejscie) return "poziom";
  if ((at - (r.ostatnio || r.od)) > LUKA) return "urwane";
  if (Number.isFinite(r.min) && r.min < r.wejscie) return "glebiej";
  return "plasko";
}

function zamknij(r, at){
  return {
    klucz: r.klucz, rating: r.rating ?? null, def: r.def,
    wejscie: r.wejscie, sufit: r.sufit ?? null, cel: r.cel0, poziom: r.poziom0, rabat: r.rabat0,
    dno: Number.isFinite(r.min) ? r.min : null,
    doDna: r.minAt ? minuty(r.minAt - r.od) : null,
    szczyt: Number.isFinite(r.max) ? r.max : null,
    poziomMin: Number.isFinite(r.poziomMin) ? r.poziomMin : null,
    doCelu: r.osiagnietyAt ? minuty(r.osiagnietyAt - r.od) : null,
    potwierdzil: r.osiagnietyAt ? (r.skadCelu || null) : null,
    werdykt: werdykt(r, at),
    trwala: minuty(at - r.od),
    zamkniete: at
  };
}

/** Dopisuje przebieg do rejestru.
 *  inwestycje: wynik policzInwestycje z TEGO odczytu (źródło nowych wierszy)
 *  ceny: wynik zrodloCen (aktualne ceny obserwowanych kart)
 *  poziomyD: poziomy dobowe PO tym odczytu (do pilnowania zjazdu poziomu) */
export function dopiszRejestr(stan, at, inwestycje, ceny, poziomyD, def = definicja()){
  const s = stan && typeof stan === "object" ? stan : {};
  const otwarte = {};
    /* 01.10.2026: wiersz z celem poza siatką nie przechodzi dalej.

     Do tego dnia `listBelow` potrafiło zwrócić cenę, której w grze nie da się
     wpisać — poziom 10 010–10 240 dawał cel 9750, a poniżej 10 000 legalne są
     tylko setki. Samo `grid.mjs` tego nie leczy: cel zamrażamy w chwili wejścia
     i słusznie, więc raz zapisana zła liczba zostaje w pliku na zawsze. A że
     walidator taki plik odrzuca, nic się nie zapisuje i wiersz wraca przy
     każdym przebiegu. Pętla bez wyjścia aż do HORYZONTU — doba bez cen.

     Wiersz WYRZUCAMY, nie naprawiamy. Przeliczenie celu w dół obniżyłoby
     poprzeczkę pozycji, która już trwa, i mogłoby dopisać trafienie, którego
     nie było. Lepiej stracić jeden pomiar niż sfabrykować wynik.

     Zostaje na stałe, nie jako jednorazowa migracja: każdy przyszły cel poza
     siatką wypadnie tak samo, zamiast zatrzymać zapis na dobę. */
  for (const k of Object.keys(s.otwarte || {})){
    const r = s.otwarte[k];
    if (r && Number.isFinite(r.cel0) && !onGrid(r.cel0)) continue;
    otwarte[k] = { ...r };
  }
  const wyniki = Array.isArray(s.wyniki) ? [...s.wyniki] : [];
  const c = ceny || {};
  const p = poziomyD || {};

  /* 1. Nowe pozycje. Cel i poziom ZAMRAŻAMY w chwili wejścia — gdyby cel jechał
        za poziomem, pozycja "dochodziłaby do celu" przez sam spadek poziomu. */
  for (const w of (inwestycje || [])){
    if (!w || !w.klucz || otwarte[w.klucz]) continue;
    otwarte[w.klucz] = {
      klucz: w.klucz, rating: w.rating ?? null, def,
      wejscie: w.cena, poziom0: w.poziom, cel0: w.cel, rabat0: w.rabat,
      /* 30.09: sufit licytacji, czyli cena, po której NAPRAWDĘ się wchodzi.
         `wejscie` to cena rynkowa w chwili wykrycia — dobra do opisu sytuacji,
         ale bezużyteczna do liczenia opłacalności, bo nikt po niej nie kupuje.
         Bez tego pola walidator liczył zysk jako cel − cena rynkowa i słusznie
         wychodziło mu ujemnie: Barella 87 netto −105, Kohler 89 −200. Pozycje
         były zdrowe, nieprawdziwe było pytanie. */
      sufit: Number.isFinite(w.kupnoDo) ? w.kupnoDo : null,
      od: at, ostatnio: at,
      cena: w.cena, min: w.cena, minAt: at, max: w.cena,
      poziom: w.poziom, poziomMin: w.poziom,
      osiagnietyAt: null, skadCelu: null,
      hist: [[at, w.cena, w.poziom]]
    };
  }

  /* 2. Aktualizacja otwartych. Wiersz z INNĄ definicją dalej żyje i dalej go
        liczymy — zamknie się z własnym podpisem i trafi do "starszych". */
  for (const k of Object.keys(otwarte)){
    const r = otwarte[k];
    const widok = c[k];
    if (widok){
      r.cena = widok.cena;
      r.ostatnio = at;
      if (!Number.isFinite(r.min) || widok.cena < r.min){ r.min = widok.cena; r.minAt = at; }
      if (!Number.isFinite(r.max) || widok.cena > r.max) r.max = widok.cena;
      /* Cel musi się UTRZYMAĆ. Jedno dotknięcie to w 71% przypadków mignięcie
   przy przestawianiu kolejki ofert — patrz MIN_TRWALOSC_CELU wyżej.
   Zejście poniżej celu zrywa serię i liczymy od nowa, dokładnie tak samo
   jak przy trwałości wejścia w okazje.mjs. */
if (!r.osiagnietyAt && r.cel0 > 0){
  if (widok.cena >= r.cel0){
    if (!r.celOd) r.celOd = at;
    r.celN = (r.celN || 0) + 1;
    if (r.celN >= MIN_TRWALOSC_CELU){
      r.osiagnietyAt = r.celOd;
      r.skadCelu = widok.skad;
    }
  } else {
    r.celOd = null;
    r.celN = 0;
  }
}
      const ost = r.hist[r.hist.length - 1];
      if (!ost || ost[1] !== widok.cena) r.hist = [...r.hist, [at, widok.cena, r.poziom]].slice(-HIST_LIMIT);
    }
    const poz = p[k];
    if (poz && Number.isFinite(poz.p) && poz.p > 0){
      r.poziom = poz.p;
      if (!Number.isFinite(r.poziomMin) || poz.p < r.poziomMin) r.poziomMin = poz.p;
    }
  }

  /* 3. Zamknięcia. Trafienie zamyka od razu — dalsze losy ceny nie zmieniają
        odpowiedzi na pytanie "czy dało się wyjść na celu". */
  const dalej = {};
  for (const k of Object.keys(otwarte)){
    const r = otwarte[k];
    const koniec = r.osiagnietyAt
      || (at - r.od) >= HORYZONT
      || (at - (r.ostatnio || r.od)) > LUKA;
    if (koniec) wyniki.push(zamknij(r, at));
    else dalej[k] = r;
  }

  return { def, at, otwarte: dalej, wyniki: wyniki.slice(-WYNIKI_LIMIT) };
}

function policz(rows){
  const kubelki = { cel: 0, poziom: 0, glebiej: 0, plasko: 0, urwane: 0 };
  for (const r of rows) if (kubelki[r.werdykt] !== undefined) kubelki[r.werdykt] += 1;
  /* Mianownik bez "urwanych": tam po prostu nie wiemy, jak się skończyło.
     Wrzucenie ich do pudeł zaniżałoby wynik tym mocniej, im lepiej by wychodziło —
     bo karta, która wróciła do poziomu, właśnie dlatego wypada z jedenastki. */
  const znane = rows.length - kubelki.urwane;
  const czasy = rows.map(r => r.doCelu).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    probek: rows.length, znane, ...kubelki,
    trafienie: znane > 0 ? +((kubelki.cel / znane) * 100).toFixed(0) : null,
    medianaDoCelu: czasy.length ? czasy[Math.floor(czasy.length / 2)] : null
  };
}

/** Skuteczność pozycji. Osobno dla bieżącej definicji i osobno dla starszych —
 *  jedna liczba z dwóch różnych definicji byłaby zlepkiem dwóch pomiarów. */
export function skutecznoscInw(stan, def = definicja(), minProb = MIN_PROB){
  const wsz = Array.isArray(stan && stan.wyniki) ? stan.wyniki : [];
  const biez = wsz.filter(r => r.def === def);
  const stare = wsz.filter(r => r.def !== def);
  return {
    def,
    otwartych: Object.keys((stan && stan.otwarte) || {}).length,
    ...policz(biez),
    gotowe: biez.length >= minProb,
    minProb,
    starsze: stare.length ? policz(stare) : null
  };
}
