/* Kontrolki sensu — asercje na ZNACZENIE liczb, nie na ich kształt.

Skąd to się wzięło. 01.10.2026 rejestr pokazał `trafienie: 100` na 84 próbkach.
Walidator przepuścił to bez mrugnięcia, bo z jego punktu widzenia wszystko było
w porządku: liczba całkowita, w przedziale 0–100, znanych nie więcej niż próbek.
Formalnie bez zarzutu. Faktycznie: 43 z 84 „trafień" zapadało w dwie minuty,
najszybsze w trzy sekundy, a 17 pozycji miało cel odległy o JEDEN krok siatki
od ceny wejścia. Mierzyliśmy to, że najtańsza oferta znikła z listy.

I to nie był wyjątek. Przejrzałem wszystko, co w tym projekcie poszło źle:

· puste `planOptions()` — znalezione przy czytaniu kodu
· wyciek cookie platformy — znaleziony ręcznym porównaniem z fut.gg
· cel przyklejony do jednej oferty — znaleziony ze screena z telefonu
· dziewięć padniętych przebiegów — znalezione, bo przyszedł mail
· martwy cykl `top` — znaleziony cztery dni po fakcie
· trafienie 100% — znalezione przy ręcznym przeglądzie

Sześć na sześć wykrył CZŁOWIEK. Zero wykrył walidator. Nie dlatego, że walidator
jest zły — on pilnuje kontraktu danych i robi to dobrze. Po prostu żaden z tych
błędów nie łamał kontraktu. `trafienie: 100` to poprawny integer. `rows: []` to
poprawna tablica. `MIN_KROKOW = 1` to poprawna liczba. Wszystkie były formalnie
bez zarzutu i semantycznie bez sensu, a sensu nie pilnował nikt.

Ten plik pilnuje sensu. Reguła przy pisaniu każdej kontrolki była jedna:
MUSI łapać konkretny błąd, który już nam się zdarzył. Żadnych asercji „na
wszelki wypadek" — od nich walidator robi się hałaśliwy, a hałaśliwy walidator
to walidator, którego się wyłącza.

Progi są liberalne celowo. Lepiej przepuścić wątpliwy przebieg niż zatrzymać
zdrowy: fałszywy alarm co godzinę nauczy nas ignorować czerwone kropki,
a wtedy cały ten plik jest wart tyle, co jego brak.

PODZIAŁ NA BŁĘDY I UWAGI — to nie jest kwestia tego, co groźniejsze.

Błąd zatrzymuje publikację, czyli zostawia na stronie POPRZEDNI plik. To jest
dobre dokładnie wtedy, gdy nowy plik niósłby treść FAŁSZYWĄ: cel leżący na
cenie wejścia, ceny z PC podpisane jako konsola, przecena sprzed doby podana
jako dzisiejsza. Wtedy stary plik jest lepszy od nowego i blokada pomaga.

Ale martwy cykl `top` to nie fałszywa treść, tylko brakująca. Gdybym zrobił
z tego błąd, walidator zatrzymywałby KAŻDY przebieg aż do naprawy — czyli
zamroziłby wszystkie ceny na stronie, bo jedna sekcja się nie odświeża.
Lekarstwo gorsze od choroby i ta sama rodzina pomyłki, którą ten plik ma
wykrywać. Dlatego awarie infrastruktury są UWAGAMI: widać je w logu Actions,
nic nie blokują.

Krótko: fałsz blokuje, brak nie blokuje. */

import { stepFor } from "./grid.mjs";

/* ── Progi ───────────────────────────────────────────────────────────────── */

/** Ile kroków siatki musi dzielić cenę wejścia od celu, żeby pozycja w ogóle
 * coś znaczyła. Jeden krok to na karcie 5 800 sto monet, czyli 1,7% — ruch
 * w granicach szumu. Takie „trafienie" opisuje wyłącznie to, że ktoś kupił
 * najtańszą sztukę i następna jest o krok wyżej.
 *
 * Dlaczego JEDEN, a nie trzy jak MIN_KROKOW w okazje.mjs — bo to są dwie różne
 * liczby i pierwsza wersja tego pliku je pomyliła. MIN_KROKOW mierzy dystans
 * POZIOM − CENA, a tutaj mierzymy CEL − CENA, a cel leży już krok pod poziomem.
 * Do tego poziom nie musi leżeć na siatce, więc `snapDown` zjada jeszcze
 * kawałek. Gwarancja silnika przy MIN_KROKOW = 3 wychodzi tak:
 *
 *   cena  ≤ poziom − 3·krok
 *   cel    = snapDown(poziom) − krok ≥ poziom − δ − krok   (δ < krok)
 *   cel − cena ≥ 2·krok − δ  >  1·krok
 *
 * Czyli silnik gwarantuje WIĘCEJ niż jeden krok, ale NIE gwarantuje trzech.
 * Gdybym zostawił tu trójkę, walidator wywalałby zdrowe pozycje i zatrzymywał
 * publikację — ten sam fałszywy alarm, co przy progach wieku cykli. Pytamy
 * o to, co silnik naprawdę obiecuje, i o to, co faktycznie jest śmieciem. */
export const MIN_KROKOW_CELU = 1;

/** Trafienie szybsze niż dwa przebiegi scrapera to nie jest ruch ceny, tylko
 * rotacja ofert na liście. Pojedyncze takie się zdarza i nie ma w tym nic
 * złego — ale gdy stanowią jedną trzecią wszystkich, definicja jest zepsuta. */
export const SZYBKIE_TRAFIENIE = 300;
export const MAX_UDZIAL_SZYBKICH = 0.30;

/** Poniżej tylu próbek nie twierdzimy niczego o rozkładzie — przy ośmiu
 * wynikach jedna trzecia to trzy sztuki i może być przypadkiem. */
export const MIN_PROBEK = 20;

/** Skuteczność powyżej tego progu przy medianie poniżej dziesięciu minut nie
 * jest sukcesem, tylko miernikiem mierzącym własny ogon. Dla porównania:
 * definicja `p8` dawała na tych samych danych 57% przy medianie 895 s. */
export const MAX_TRAFIENIE = 85;
export const MIN_MEDIANA = 600;

/** Ile może mieć znacznik cyklu, zanim uznamy go za martwy.

 * Progi policzone z `cykl.mjs`, nie wzięte z sufitu — i to jest ważne, bo
 * pierwsza wersja tego pliku miała tu 30 minut i 6 godzin, czyli wartości,
 * które zapalałyby się na zdrowym repo kilka razy dziennie.
 *
 * `fast`: cron puka co 5 minut, ale przebieg wybrany na `slow` nie dotyka
 * znacznika szybkiego. Godzina z zapasem.
 *
 * `slow`: PRZETERMINOWANY to 10 h, ale okno godzinowe (5–12 i 17–24 UTC) umie
 * tę przerwę wydłużyć. Najgorszy przypadek: przebieg o 05:00, przeterminowanie
 * o 15:00, okno zamknięte do 17:00 — czyli 12 h bez żadnej awarii. Osiemnaście
 * godzin to realna awaria.
 *
 * `top` tu NIE MA i to nie przeoczenie — patrz MARTWE_KLUCZE niżej. */
export const WIEK_CYKLU = { atFast: 2 * 3600, atSlow: 18 * 3600 };

/** Sekcje, które zostały w pliku, choć nic ich już nie czyta.

 * 01.10.2026: `atTop` stał 100 godzin i wyglądał na awarię. Nie był awarią.
 * `cykl.mjs` umie zwrócić wyłącznie "slow" albo "fast" — `top` został z niego
 * wypisany i komentarz w pliku mówi to wprost. Workflow też go nie oferuje
 * (`options: [auto, fast, slow]`), a strona nie czyta `data.top` ani razu
 * w 105 tysiącach znaków. Cykl nie jest zepsuty, tylko wycofany — a mimo to
 * jego wydmuszka jedzie dalej w każdym odczycie.
 *
 * To osobna kategoria usterki i warto ją nazwać: nie fałszywa treść, nie
 * brakująca treść, tylko treść, której nikt nie odbiera. Kosztuje transfer
 * przy każdym pobraniu pliku i — co gorsze — wygląda przy przeglądzie jak
 * awaria, czyli kradnie uwagę. Uwaga, nie błąd: usunięcie to porządki,
 * nie gaszenie pożaru. */
export const MARTWE_KLUCZE = ["top", "record"];

/** Okres półtrwania poziomu dobowego przy ALFA_D = 0,005 i odczycie co 5 minut
 * to około 11,5 h. Karta pod progiem DŁUŻEJ niż to, i nadal bez zwrotu, nie
 * jest przeceniona — ona po prostu tyle teraz kosztuje, a to poziom się
 * spóźnia. Pokazywanie tego jako „−18%" wysyła człowieka po nową cenę rynkową
 * w przekonaniu, że ma zniżkę. */
export const POLTRWANIE_D = 12 * 3600;

/** Ceny na PC i na konsoli NIGDY nie są masowo identyczne. Gdy są, to znaczy,
 * że oba odczyty przyszły z jednej platformy — dokładnie to zrobił 28.09
 * wyciekły cookie `futgg_platform` (ta sama SBC: 2 550 na PC, 3 900 na
 * konsoli, obie podpisane jako konsola). */
export const MIN_WSPOLNYCH = 40;
export const MAX_UDZIAL_IDENTYCZNYCH = 0.80;

/* ── Pomocnicze ──────────────────────────────────────────────────────────── */

function mediana(xs){
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

function pct(n, z){ return z > 0 ? Math.round((n / z) * 100) : 0; }

/** Wiersze rejestru liczone pod BIEŻĄCĄ definicją. Wierszy spod starych
 * podpisów nie sprawdzamy i nie wolno ich sprawdzać: one mierzyły inny próg,
 * leżą tam jako historia i mają prawo łamać dzisiejsze reguły. Właśnie po to
 * są stemple `def`. */
function biezace(lista, def){
  return (lista || []).filter(o => o && o.def === def);
}

/* ── Kontrolki ───────────────────────────────────────────────────────────── */

export function kontrolki(d, teraz = Math.floor(Date.now() / 1000)){
  const err = [], warn = [];
  if (!d || typeof d !== "object") return { err: ["kontrolki: brak danych"], warn };

  /* 1. Martwy cykl ─────────────────────────────────────────────────────────
     Scraper raportuje zielono, cron puka co pięć minut, a jedna gałąź stoi —
     bo nikt nie porównuje znacznika z zegarem. Dotyczy wyłącznie cykli, które
     naprawdę mają chodzić; wycofane łapie kontrolka 2. */
  for (const [pole, limit] of Object.entries(WIEK_CYKLU)){
    if (!Number.isFinite(d[pole])) continue;      // starszy plik może nie mieć znacznika
    const wiek = teraz - d[pole];
    if (wiek > limit){
      warn.push(`cykl ${pole}: ostatni przebieg ${(wiek / 3600).toFixed(1)} h temu, limit ${(limit / 3600).toFixed(1)} h — cykl nie chodzi`);
    }
  }

  /* 2. Sekcje, których nikt nie czyta ──────────────────────────────────────
     Zgłaszamy raz i znika, gdy klucz wypadnie ze scrape.mjs. Sens jest taki,
     żeby przy następnym przeglądzie nikt — ja ani ty — nie stracił pół godziny
     na diagnozowanie „awarii", która jest po prostu niesprzątniętym wycofaniem. */
  for (const k of MARTWE_KLUCZE){
    if (d[k] !== undefined){
      warn.push(`klucz "${k}" jedzie w pliku, ale nic go nie czyta — wycofana sekcja do usunięcia ze scrape.mjs`);
    }
  }

  for (const p of ["ps", "pc"]){
    const r = d.rejestr?.[p];
    if (!r || !r.def) continue;                   // rejestr narasta; pierwszy przebieg go nie ma
    const def = r.def;

    /* 3. Cel za blisko wejścia ────────────────────────────────────────────
       Rdzeń sprawy z 01.10. Cel odległy o jeden krok siatki trafia się sam,
       bo tyle wynosi zwykła rotacja najtańszej oferty. Sprawdzamy OTWARTE
       wiersze, czyli to, co silnik produkuje TERAZ — jeżeli ktoś kiedyś
       znowu ruszy próg bez ruszenia MIN_KROKOW, pierwszy przebieg stanie. */
    for (const [k, o] of Object.entries(r.otwarte || {})){
      if (o.def !== def) continue;
      if (!Number.isFinite(o.wejscie) || !Number.isFinite(o.cel0)) continue;
      const krok = stepFor(o.wejscie);
      const kroki = (o.cel0 - o.wejscie) / krok;
      /* Ostro większe, nie „co najmniej": równo jeden krok to właśnie ten
         przypadek, który chcemy łapać — rotacja najtańszej oferty. */
      if (kroki <= MIN_KROKOW_CELU){
        err.push(`rejestr.${p} ${k}: cel ${o.cel0} leży ${kroki.toFixed(1)} kroku nad wejściem ${o.wejscie} — poniżej tego pozycja trafia sama z siebie`);
      }
    }

    /* 4. Rozkład czasu do celu ────────────────────────────────────────────
       Kontrolka 3 pilnuje nowych pozycji, ta pilnuje już zebranej statystyki.
       Obie są potrzebne: 3 nie zadziała wstecz na wyniki, które już leżą
       w pliku, a 4 nie zadziała, dopóki wyników nie uzbiera się dość. */
    const cele = biezace(r.wyniki, def).filter(o => o.werdykt === "cel" && Number.isFinite(o.doCelu));
    if (cele.length >= MIN_PROBEK){
      const szybkie = cele.filter(o => o.doCelu <= SZYBKIE_TRAFIENIE).length;
      const udzial = szybkie / cele.length;
      if (udzial > MAX_UDZIAL_SZYBKICH){
        err.push(`rejestr.${p}: ${szybkie} z ${cele.length} trafień (${pct(szybkie, cele.length)}%) zapadło w ≤${SZYBKIE_TRAFIENIE} s — to rotacja ofert, nie ruch ceny`);
      }
      const med = mediana(cele.map(o => o.doCelu));
      if (med !== null && med < MIN_MEDIANA && cele.length / Math.max(1, biezace(r.wyniki, def).length) > 0.9){
        warn.push(`rejestr.${p}: mediana dojścia do celu ${med} s przy ${pct(cele.length, biezace(r.wyniki, def).length)}% trafień — sprawdź, czy cel nie leży za blisko`);
      }
    }

    /* 5. Skuteczność nie do uwierzenia ────────────────────────────────────
       Ostatnia linia obrony, gdyby 3 i 4 jakoś przepuściły. Rynek, na którym
       dziewięć na dziesięć pozycji wychodzi w kwadrans, nie istnieje — gdyby
       istniał, nie potrzebowalibyśmy tego narzędzia. */
    const sk = d.skutecznosc?.[p];
    if (sk && sk.gotowe && (sk.probek || 0) >= MIN_PROBEK
        && Number.isFinite(sk.trafienie) && sk.trafienie >= MAX_TRAFIENIE
        && Number.isFinite(sk.medianaDoCelu) && sk.medianaDoCelu < MIN_MEDIANA){
      err.push(`skutecznosc.${p}: ${sk.trafienie}% trafień przy medianie ${sk.medianaDoCelu} s na ${sk.probek} próbkach — miernik mierzy sam siebie, nie rynek`);
    }
  }

  /* 6. Przecena, która się już dokonała ────────────────────────────────────
     Monitor ma takie wiersze odsiewać u siebie; tu sprawdzamy, czy odsiał.
     Karta pod progiem 13 h bez cienia zwrotu to nowa cena rynku, a nie okazja
     — poziom dobowy po prostu jeszcze jej nie dogonił. */
  for (const p of ["ps", "pc"]){
    for (const w of (d.monitor?.[p] || [])){
      if (!Number.isFinite(w.odSekund)) continue;
      if (w.odSekund > POLTRWANIE_D && !w.zawraca){
        err.push(`monitor.${p} ${w.klucz}: pod progiem od ${(w.odSekund / 3600).toFixed(1)} h bez zwrotu — to nie rabat, to nowa cena`);
      }
    }
  }

  /* 7. Platformy sklejone w jedną ──────────────────────────────────────────
     Detektor wycieku cookie. Bierzemy poziomy dobowe, bo tam są setki kart —
     na dwunastu wierszach monitora taki test byłby loterią. Identyczna cena
     na PC i konsoli zdarza się pojedynczym kartom; masowo nie zdarza się
     nigdy. */
  const pd = d.okazje?.poziomyD;
  if (pd?.ps && pd?.pc){
    const wspolne = Object.keys(pd.ps).filter(k => pd.pc[k]);
    if (wspolne.length >= MIN_WSPOLNYCH){
      const takie_same = wspolne.filter(k => pd.ps[k]?.p === pd.pc[k]?.p).length;
      if (takie_same / wspolne.length > MAX_UDZIAL_IDENTYCZNYCH){
        err.push(`platformy: ${takie_same} z ${wspolne.length} kart (${pct(takie_same, wspolne.length)}%) ma identyczną cenę na PC i konsoli — podejrzenie wycieku cookie platformy`);
      }
    }
  }

  /* 8. Nagłówek przeczy tabeli ─────────────────────────────────────────────
     Nie błąd danych, błąd opowieści. „Rynek stoi w miejscu 0,0%" nad listą
     dwunastu kart po −18% jest dla czytającego sprzecznością, nawet jeśli obie
     liczby policzono poprawnie z różnych koszyków. Uwaga, nie błąd — stary
     plik ma prawo wyjść na produkcję. */
  for (const p of ["ps", "pc"]){
    const zmiana = d.nasz?.[p]?.zmiana;
    if (!Number.isFinite(zmiana) || Math.abs(zmiana) >= 1) continue;
    const glebokie = (d.monitor?.[p] || []).filter(w => (w.rabat || 0) >= 10).length;
    if (glebokie >= 5){
      warn.push(`nasz.${p}: indeks mówi ${zmiana}%, a monitor pokazuje ${glebokie} kart ≥10% pod poziomem — jedna strona, dwie sprzeczne historie`);
    }
  }

  return { err, warn };
}
