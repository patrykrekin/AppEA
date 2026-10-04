/* Dymny test modułów — zamyka klasę błędu, która w dwa dni trafiła nas dwa razy.

   03.10: przy wklejaniu bloku do monitor.mjs zniknęło `export const WIEK`.
   04.10: do indeks.mjs wkleiła się linia `KROK_HIST = 1800` bez `export const`.

   Oba razy skutek był ten sam i najgorszy z możliwych: moduł wysypywał się
   ReferenceError-em przy IMPORCIE, czyli zanim scrape.mjs wszedł w swój blok
   `try`. Nie zapisywała się nawet `awaria` — ceny po prostu przestawały się
   aktualizować, bez jednego słowa wyjaśnienia. Walidator tego nie łapie, bo on
   sprawdza GOTOWY plik, a tu plik w ogóle nie powstawał.

   Ten test nie sprawdza logiki — od tego są pozostałe testy. Sprawdza rzecz
   banalną i dlatego pomijaną: czy moduł daje się w ogóle zaimportować i czy
   stałe, na których stoi, naprawdę istnieją i są liczbami.

   Node wykłada się na `KROK_HIST = 1800` już przy imporcie, bo moduły ES chodzą
   w trybie strict. Wystarczy więc zaimportować wszystko — reszta dzieje się sama.

   Uruchamiany w workflow PRZED pobraniem cen: nie ma sensu budzić przeglądarki
   i mielić dwóch rynków, żeby paść na literówce w deklaracji. */

const MODULY = [
  "./lib/grid.mjs",
  "./lib/indeks.mjs",
  "./lib/okazje.mjs",
  "./lib/monitor.mjs",
  "./lib/rejestr.mjs",
  "./lib/snajperka.mjs",
  "./lib/ruchy.mjs",
  "./lib/sbc.mjs",
  "./lib/kalendarz.mjs",
  "./lib/kontrolki.mjs",
  "./lib/store.mjs",
  "./validate.mjs",
  "./cykl.mjs"
];

/* Stałe, bez których moduł nie ma sensu. Lista jest celowo krótka: pilnujemy
   tych, które są używane jako DOMYŚLNY ARGUMENT funkcji, bo tam brak deklaracji
   nie wybucha przy imporcie, tylko przy pierwszym wywołaniu — czyli w środku
   przebiegu, po wejściu na fut.gg. */
const WYMAGANE = {
  "./lib/grid.mjs":      ["BREAK_EVEN"],
  "./lib/indeks.mjs":    ["KOSZYK", "WERSJA", "KROK_HIST"],
  "./lib/okazje.mjs":    ["PROG", "ALFA", "ALFA_D", "PROG_INW", "MIN_KROKOW", "MIN_ODCZYTOW",
                          "MIN_ODCZYTOW_D", "MIN_TRWALOSC", "MIN_TRWALOSC_SEK", "INW_MARZA",
                          "INW_LIMIT", "WERSJA", "LOG_LIMIT", "KART_LIMIT", "KART_WIEK"],
  "./lib/monitor.mjs":   ["PROG", "MIN_ODCZYTOW", "SZEREG_N", "OKNO_ZWROTU", "MARZA",
                          "LIMIT", "WIEK", "POLTRWANIE_D"],
  "./lib/rejestr.mjs":   ["HORYZONT", "LUKA", "WYNIKI_LIMIT", "HIST_LIMIT", "MIN_PROB",
                          "SWIEZOSC", "MIN_TRWALOSC_CELU"],
  "./lib/snajperka.mjs": ["PASMA", "RABAT", "MIN_ODCZYTOW", "LIMIT", "MARZA"],
  "./lib/ruchy.mjs":     ["LIMIT", "OKNO", "HIST_LIMIT", "OKNO_TRENDU", "WYNIKI_LIMIT"],
  "./lib/kontrolki.mjs": ["MIN_KROKOW_CELU", "SZYBKIE_TRAFIENIE_MIN", "MAX_UDZIAL_SZYBKICH",
                          "MIN_PROBEK", "MAX_TRAFIENIE", "MIN_MEDIANA_MIN", "WIEK_CYKLU",
                          "POLTRWANIE_D", "MARTWE_KLUCZE"],
  "./cykl.mjs":          ["PRZETERMINOWANY"]
};

/* Progi czasowe i ich jednostki. Pilnujemy rzędu wielkości, nie dokładnej
   wartości — chodzi o to, żeby nikt nie wpisał sekund tam, gdzie są minuty.
   04.10: moje własne progi w kontrolki.mjs były 60× za duże przez dokładnie
   taką pomyłkę i przez dwie i pół godziny blokowały publikację cen. */
const JEDNOSTKI = [
  ["./lib/rejestr.mjs",   "HORYZONT",             3600,    7 * 86400, "sekundy"],
  ["./lib/rejestr.mjs",   "LUKA",                  600,     86400,    "sekundy"],
  ["./lib/rejestr.mjs",   "SWIEZOSC",               60,      7200,    "sekundy"],
  ["./lib/rejestr.mjs",   "MIN_TRWALOSC_CELU",       2,        10,    "odczyty"],
  ["./lib/okazje.mjs",    "MIN_TRWALOSC_SEK",      300,     86400,    "sekundy"],
  ["./lib/okazje.mjs",    "KART_WIEK",           86400,  30 * 86400,  "sekundy"],
  ["./lib/monitor.mjs",   "WIEK",                86400,  30 * 86400,  "sekundy"],
  ["./lib/monitor.mjs",   "POLTRWANIE_D",         3600,   3 * 86400,  "sekundy"],
  ["./lib/ruchy.mjs",     "OKNO",                 3600,   7 * 86400,  "sekundy"],
  ["./lib/ruchy.mjs",     "OKNO_TRENDU",           300,     86400,    "sekundy"],
  ["./lib/indeks.mjs",    "KROK_HIST",             300,     7200,     "sekundy"],
  ["./cykl.mjs",          "PRZETERMINOWANY",      3600,   3 * 86400,  "sekundy"],
  ["./lib/kontrolki.mjs", "SZYBKIE_TRAFIENIE_MIN",   1,       120,    "MINUTY"],
  ["./lib/kontrolki.mjs", "MIN_MEDIANA_MIN",         5,       240,    "MINUTY"],
  ["./lib/kontrolki.mjs", "POLTRWANIE_D",         3600,   3 * 86400,  "sekundy"]
];

/* Ułamki, nie procenty. 0,05 to pięć procent; 5 to pięćset i cała arytmetyka
   progu leci w kosmos, nie wywalając przy tym niczego głośno. */
const UŁAMKI = [
  ["./lib/okazje.mjs",    "PROG"], ["./lib/okazje.mjs", "ALFA"],
  ["./lib/okazje.mjs",    "ALFA_D"], ["./lib/okazje.mjs", "PROG_INW"],
  ["./lib/okazje.mjs",    "INW_MARZA"],
  ["./lib/monitor.mjs",   "PROG"], ["./lib/monitor.mjs", "MARZA"],
  ["./lib/snajperka.mjs", "RABAT"], ["./lib/snajperka.mjs", "MARZA"],
  ["./lib/kontrolki.mjs", "MAX_UDZIAL_SZYBKICH"]
];

let padlo = 0, zdane = 0;
const zle = (s) => { padlo++; console.log("  BŁĄD " + s); };
const ok  = (s) => { zdane++; console.log("  ok   " + s); };

const zaladowane = {};

console.log("\ndymny test modułów\n");

for (const m of MODULY){
  try {
    zaladowane[m] = await import(m);
    ok(`import ${m}`);
  } catch (e) {
    zle(`import ${m} — ${String(e && e.message || e).split("\n")[0]}`);
  }
}

for (const [m, nazwy] of Object.entries(WYMAGANE)){
  const mod = zaladowane[m];
  if (!mod) continue;
  for (const n of nazwy){
    if (mod[n] === undefined) zle(`${m}: brak eksportu ${n}`);
    else zdane++;
  }
}
ok("wszystkie wymagane stałe istnieją");

for (const [m, n, min, max, jedn] of JEDNOSTKI){
  const mod = zaladowane[m];
  if (!mod || mod[n] === undefined) continue;
  const v = mod[n];
  if (!Number.isFinite(v)) zle(`${m}: ${n} nie jest liczbą (${v})`);
  else if (v < min || v > max) zle(`${m}: ${n} = ${v} poza zakresem ${min}–${max} (${jedn}) — podejrzenie złej jednostki`);
  else zdane++;
}
ok("progi czasowe mieszczą się w swoich jednostkach");

for (const [m, n] of UŁAMKI){
  const mod = zaladowane[m];
  if (!mod || mod[n] === undefined) continue;
  const v = mod[n];
  if (!Number.isFinite(v) || v <= 0 || v >= 1) zle(`${m}: ${n} = ${v} — ma być ułamkiem (0–1), nie procentem`);
  else zdane++;
}
ok("progi procentowe są ułamkami");

console.log(`\n  zdane ${zdane}, błędów ${padlo}\n`);
if (padlo){ console.log("Nie publikować — moduł nie wstaje albo stała ma złą jednostkę."); process.exit(1); }
