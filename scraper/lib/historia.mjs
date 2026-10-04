/* Długa rzadka historia dna pasm — fundament pod inwestycje z katalizatorem.

   Po co, skoro mamy już `hist` w indeks.mjs: bo tamta trzyma 96 punktów i po
   przerzedzeniu pokrywa niecałe dwie doby. Do pytań, które naprawdę chcemy
   zadać, to za mało:

   · czy w czwartek rano fodder jest tańszy, i o ile
   · czy ceny rosną przed wygaśnięciem SBC, i ile dni wcześniej
   · jaki jest rozkład zwrotu po 48 h dla karty kupionej X% pod normą tygodnia

   Na każde z nich trzeba widzieć kilka tygodni, nie dwie doby. Wpisy o rytmie
   tygodnia w kalendarz.mjs do dziś noszą podpis „źródło zewnętrzne, nie nasz
   pomiar" — właśnie dlatego, że nigdy nie mieliśmy czym ich sprawdzić.

   DLACZEGO OSOBNY PLIK, a nie kolejny klucz w data.json: data.json ma już
   ponad 300 kB i strona pobiera go przy każdym wejściu. Trzydzieści dni po
   jednym punkcie na godzinę to kilkanaście tysięcy liczb — doklejone do
   data.json podwoiłyby transfer dla czegoś, czego strona w ogóle nie czyta.
   Historia jest materiałem do analizy, nie treścią strony, więc idzie obok.

   To jest zresztą pierwszy realny krok rozdziału stanu scrapera od danych
   strony, który odkładamy od 1.10.

   FORMAT: jeden punkt to [czas, dno83, dno84, ... dno89] — tablica, nie obiekt.
   Przy 720 punktach na platformę nazwy pasm powtórzone w każdym wpisie to
   kilkadziesiąt kilobajtów samych kluczy. Kolejność pasm siedzi raz, w polu
   `pasma`. */

import { KOSZYK } from "./indeks.mjs";

export const WERSJA = 1;
export const KROK = 3600;   // jeden punkt na godzinę
export const LIMIT = 720;   // 720 godzin = 30 dni

/* Granice rozsądku dla ceny karty. Nie sprawdzamy siatki, i to jest świadome:
   dno pasma to MEDIANA pięciu najtańszych, a mediana dwóch sąsiednich cen
   (3 700 i 3 800) daje 3 750 — wartość, której w grze nie da się wpisać, ale
   jako estymator poziomu jak najbardziej poprawna. Gdybym tu wymagał siatki,
   odrzuciłbym co drugi zdrowy pomiar i historia nigdy by nie urosła. */
const MIN_CENA = 50;
const MAX_CENA = 10000000;

/** Czy odczyt dna pasm nadaje się do zapamiętania NA ZAWSZE.

 *  Próg jest wyższy niż przy zwykłym odczycie i to jest celowe: historia jest
 *  materiałem dowodowym na tygodnie do przodu, a jeden śmieciowy punkt zatruwa
 *  każdą statystykę liczoną z tego okresu. Wolimy mieć dziurę niż kłamstwo —
 *  dziurę widać, kłamstwa nie. Lekcja z `najlepszyRabat`, który jest
 *  maksimum ze wszystkiego, co kiedykolwiek przyszło, i przez jeden zły odczyt
 *  pokazuje przeceny rzędu −80% na kartach stojących w miejscu. */
export function zdrowe(floors){
  if (!floors || typeof floors !== "object") return false;
  for (const r of KOSZYK){
    const v = floors[r];
    if (!Number.isFinite(v) || v < MIN_CENA || v > MAX_CENA) return false;
  }
  return true;
}

/** Dopisuje punkt do jednej serii. Bez podmieniania ostatniego wpisu —
 *  w odróżnieniu od indeks.mjs, gdzie ostatni punkt musi być świeży, bo z niego
 *  liczy się bieżąca wartość indeksu. Tutaj chodzi o równą siatkę godzinową
 *  przez trzydzieści dni i ruchomy koniec tylko by ją rozjeżdżał. */
export function dopisz(seria, at, floors, krok = KROK, limit = LIMIT){
  const s = Array.isArray(seria) ? seria : [];
  if (!zdrowe(floors)) return s;
  const ost = s[s.length - 1];
  if (ost && (at - ost[0]) < krok) return s;
  return [...s, [at, ...KOSZYK.map(r => floors[r])]].slice(-limit);
}

/** Cały plik historii po tym odczycie. */
export function dopiszHistorie(stan, at, floorsPs, floorsPc, krok = KROK, limit = LIMIT){
  const s = (stan && typeof stan === "object") ? stan : {};
  /* `(s.wersja || WERSJA)` byłoby błędem i test to złapał: wersja 0 jest
     fałszywa w JS, więc plik w formacie zerowym uznałby się za zgodny
     i skleiłby dwa różne układy w jedną serię. */
  const w = Number.isFinite(s.wersja) ? s.wersja : WERSJA;
  const zgodna = w === WERSJA;
  return {
    wersja: WERSJA,
    at,
    pasma: [...KOSZYK],
    ps: dopisz(zgodna ? s.ps : null, at, floorsPs, krok, limit),
    pc: dopisz(zgodna ? s.pc : null, at, floorsPc, krok, limit)
  };
}

/** Punkt z powrotem na obiekt — do liczenia, nie do zapisu. */
export function doObiektu(punkt, pasma = KOSZYK){
  if (!Array.isArray(punkt) || punkt.length < 2) return null;
  const out = { at: punkt[0], floors: {} };
  pasma.forEach((r, i) => { out.floors[r] = punkt[i + 1]; });
  return out;
}

/** Ile dób naprawdę pokrywa seria. Do raportowania, żeby nikt nie liczył
 *  rytmu tygodnia z trzech dni danych i nie nazwał tego pomiarem. */
export function zasieg(seria){
  const s = Array.isArray(seria) ? seria : [];
  if (s.length < 2) return { punktow: s.length, godzin: 0, dob: 0 };
  const godzin = (s[s.length - 1][0] - s[0][0]) / 3600;
  return { punktow: s.length, godzin: +godzin.toFixed(1), dob: +(godzin / 24).toFixed(1) };
}
