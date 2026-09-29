/* Karty warte obserwacji — z NASZYCH pasm, nie z listy momentum fut.gg.

   Skąd to się wzięło. Sekcja "Karty pod obserwacją" stała na szeregu momentum
   z fut.gg i przy każdym budżecie była w całości wyszarzona. Zmierzone 29.09:
   najtańsza karta w całym szeregu kosztowała 15 000, mediana 115 000, a na
   stronie z największymi wzrostami najtaniej było 284 000. Przy regule 10%
   banku na kartę pierwsza pozycja wymagała 150 000 banku.

   Lista momentum NIE jest listą ikon — siedzą tam zwykłe 87-ki, TOTW, karty
   eventowe, Bohaterowie. Problem jest wyłącznie cenowy: fut.gg śledzi tam
   kilkuset drogich zawodników i fodder w ogóle się na tej liście nie pojawia.
   Dla pasm 83–86, czyli tam, gdzie realnie się obracasz, to źródło jest puste.

   Ten moduł robi to samo dla kart, które i tak czytamy co pięć minut. Nie
   potrzebuje ani jednego dodatkowego wejścia na fut.gg: mamy cenę z pasma,
   szybki poziom karty (~1 h pamięci) i poziom dobowy (~11,5 h). Spadek poniżej
   własnego poziomu dobowego to "przecena", a szybki poziom zawracający w górę
   to "odbicie się zaczęło".

   Czego to NIE robi: nie przewiduje powrotu. Mówi tylko, że karta stoi pod
   swoją własną normą i od ilu minut, oraz czy krótka średnia zaczęła się
   podnosić. Czy z tego są pieniądze, rozstrzygnie rejestr wyników, nie ten plik. */

import { KOSZYK } from "./indeks.mjs";
import { listBelow, snapDown, net, stepFor } from "./grid.mjs";

export const PROG = 0.05;            // ile pod poziomem dobowym, żeby w ogóle patrzeć
export const MIN_ODCZYTOW = 24;      // dwie godziny obserwacji, zanim uwierzymy poziomowi
export const SZEREG_N = 8;           // 40 minut szybkiego poziomu
export const OKNO_ZWROTU = 6;        // zwrot liczymy przez 30 minut
export const MARZA = 0.05;           // ta sama marża co w snajperce i inwestycjach
export const LIMIT = 12;
export const WIEK = 3 * 86400;

/** Krótka historia SZYBKIEGO poziomu każdej karty. Same liczby, bez znaczników
 *  czasu — odczyty idą co pięć minut, więc pozycja w tablicy wystarcza, a każdy
 *  dodatkowy klucz mnoży się przez sto kilkadziesiąt kart w pliku. */
export function dopiszSzereg(stare, poziomy, at, ile = SZEREG_N, maxWiek = WIEK){
  const p = poziomy || {};
  const s = (stare && typeof stare === "object") ? stare : {};
  const out = {};
  for (const k of Object.keys(p)){
    const w = p[k];
    if (!w || !(w.p > 0)) continue;
    const poprz = Array.isArray(s[k] && s[k].v) ? s[k].v : [];
    out[k] = { v: [...poprz, Math.round(w.p)].slice(-ile), t: at };
  }
  /* Karta, która wypadła z jedenastki, trzyma szereg jeszcze chwilę — wróci pod
     tą samą nazwą. Po trzech dniach i tak nic już nie mówi. */
  for (const k of Object.keys(s)){
    if (!out[k] && (at - (s[k].t || 0)) <= maxWiek) out[k] = s[k];
  }
  return out;
}

/** Zwrot szybkiego poziomu — liczony OD DNA OKNA, nie od jego początku.

   Pierwsza wersja porównywała ostatnią wartość z tą sprzed sześciu odczytów
   i wywracała się na najważniejszym przypadku: karta, która zjechała 25 minut
   temu i od kwadransa się podnosi, wychodziła jako spadająca, bo na krańcach
   okna nadal stała niżej. A to jest dokładnie ta karta, o którą chodzi.

   Dlatego punktem odniesienia jest NAJNIŻSZA wartość w oknie. Poziom wyraźnie
   nad własnym dnem = zwrot się zaczął. Poziom równy dnu = dno wciąż się pogłębia
   i nie ma po co wchodzić. Ruch mniejszy od kroku siatki traktujemy jak zero,
   bo poniżej kroku nie da się odróżnić ruchu od zaokrąglenia. */
export function zwrot(szeregKarty, okno = OKNO_ZWROTU){
  const cala = (szeregKarty && Array.isArray(szeregKarty.v)) ? szeregKarty.v : [];
  if (cala.length < 2) return null;
  const v = cala.slice(-(okno + 1));
  const doC = v[v.length - 1];
  const dno = Math.min(...v);
  if (!(dno > 0)) return null;
  const odDna = doC - dno;
  /* Płaski szereg to nie jest nowe dno. Karta stojąca od pół godziny w miejscu
     ma ostatnią wartość równą minimum, ale nic nie ustanawia — żeby mówić
     o pogłębianiu dna, w oknie musi być wartość wyraźnie wyższa. */
  const szczyt = Math.max(...v);
  const noweDno = doC === dno && (szczyt - dno) >= stepFor(dno);
  if (odDna < stepFor(dno)) return { procent: 0, ponizejKroku: true, noweDno, odczytow: v.length - 1 };
  return { procent: +((odDna / dno) * 100).toFixed(1), ponizejKroku: false, noweDno: false, odczytow: v.length - 1 };
}

/** Karty warte obserwacji, posortowane: najpierw te, które już zawracają,
 *  potem po głębokości przeceny. */
export function policzMonitor(bands, poziomyD, szereg, trwalosc, at, prog = PROG, minOdczytow = MIN_ODCZYTOW, limit = LIMIT){
  const pd = poziomyD || {};
  const sz = szereg || {};
  const tr = trwalosc || {};
  const out = [];

  for (const r of KOSZYK){
    for (const c of (bands[r] || [])){
      if (!c || !Number.isFinite(c.price) || c.price <= 0) continue;
      const klucz = `${c.name} ${r}`;
      const w = pd[klucz];
      if (!w || !(w.p > 0) || (w.n || 0) < minOdczytow) continue;

      /* Dwa warunki naraz: procent ORAZ co najmniej jeden krok siatki.
         Przy karcie za 650 pięć procent to 32 monety, czyli mniej niż krok —
         taka "przecena" jest wyłącznie artefaktem zaokrąglenia. */
      const roznica = w.p - c.price;
      if (roznica < stepFor(w.p)) continue;
      if (c.price > w.p * (1 - prog)) continue;

      const cel = listBelow(snapDown(Math.round(w.p)));
      if (!(cel > 0)) continue;
      const sufit = snapDown(Math.floor(cel * 0.95 / (1 + MARZA)));
      const netto = net(sufit, cel);
      if (!(sufit > 0) || netto <= 0) continue;

      const z = zwrot(sz[klucz]);
      const t = tr[klucz];
      out.push({
        klucz, nazwa: c.name, rating: r, pos: c.pos || null,
        cena: c.price, poziom: Math.round(w.p), odczytow: w.n,
        rabat: +((roznica / w.p) * 100).toFixed(1),
        cel, sufit, netto,
        zwrot: z ? z.procent : null,
        zawraca: !!(z && !z.ponizejKroku && z.procent > 0),
        /* "leci" to nie ujemny procent — procent liczony od dna ujemny być nie
           może. Leci ta karta, której szybki poziom właśnie ustanowił nowe dno. */
        leci: !!(z && z.noweDno),
        podProgiem: (t && t.n) || 0,
        odSekund: (t && t.od > 0) ? Math.max(0, at - t.od) : null
      });
    }
  }

  /* Najpierw karty, które już zawracają — bo tylko o nich mamy cokolwiek poza
     samym faktem przeceny. Potem te, które jeszcze lecą w dół, na końcu, bo
     wejście w spadający nóż to najdroższa lekcja w tej grze. */
  return out
    .sort((a, b) => (b.zawraca - a.zawraca) || (a.leci - b.leci) || (b.rabat - a.rabat))
    .slice(0, limit);
}
