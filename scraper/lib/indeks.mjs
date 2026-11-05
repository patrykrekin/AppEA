/* Własny indeks rynku, liczony z dna pasm — tych samych, które pobiera cykl fast.
   Dwie liczby, bo jedna kłamie:
     · wartość  — koszyk pasm 83–89 względem pierwszego pomiaru (100 = start)
     · szerokość — ile pasm rośnie, a ile spada względem doby wstecz

   Szerokość jest ważniejsza od kierunku. Koszyk w górę o 2%, ale tylko jedno pasmo
   rosnące, to nie jest rynek do góry — to jedna karta, która pociągnęła średnią.

   27.09.2026: średnia ze zmian procentowych okazała się nie do obrony. Siatka cen
   ma stały krok, więc jeden tik na paśmie 83 (550 → 650) to +18%, a ruch tej samej
   wielkości co do monety na 89 (18 250 → 18 500) to +1,4%. Średnia pokazała +6,38%,
   podczas gdy pasma 86–89 stały na +1,6%, a 88 wręcz spadało. Liczymy więc MEDIANĘ
   zmian pasm: żadne pojedyncze pasmo nie ciągnie całości, a liczba nadal opisuje
   cały koszyk, nie jego wycinek. */

export const KOSZYK = [83, 84, 85, 86, 87, 88, 89];
const DOBA = 86400;
/* 04.10.2026 — minimalny odstęp między zapamiętanymi pomiarami.

   Odczyt leci co 5 minut, a historia ma 96 miejsc. Bez przerzedzania pokrywa
   7,8 h, czyli NIGDY nie zawiera punktu sprzed doby — a `policz` właśnie
   takiego szuka. Cofał się więc do wiecznej kotwicy h[0] i liczył „zmianę
   dobową" od pierwszego pomiaru w historii, w dniu wykrycia sprzed 164 godzin.

   Pół godziny × 95 miejsc to prawie dwie doby. Odniesienie dobowe istnieje
   naprawdę, a kotwica wraca do swojej jedynej roli: zera dla „100". */
export const KROK_HIST = 1800;

/* Wersja definicji dna. Zmiana estymatora zrywa porównywalność z wcześniejszą
   historią, więc numer rośnie, a seria startuje od nowa zamiast sklejać dwa
   różne pomiary w jeden szereg.
     1 — dno = najtańsze pojedyncze wystawienie
     2 — dno = mediana pięciu najtańszych wystawień */
export const WERSJA = 2;
const PROBKA_DNA = 5;

function mediana(xs){
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Wyciąga dno każdego pasma z danych fut.gg.
 *  Najtańsze pojedyncze wystawienie to często czyjaś pomyłka — jedna taka karta
 *  ruszała cały odczyt pasma. Mediana pięciu najtańszych trzyma ten sam poziom,
 *  ale nie reaguje na jeden odstający wpis. */
export function floorsZPasm(bands, ile = PROBKA_DNA){
  const out = {};
  for (const r of KOSZYK){
    const ceny = (bands[r] || [])
      .map(c => c && c.price)
      .filter(p => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b)
      .slice(0, ile);
    const m = mediana(ceny);
    if (m !== null) out[r] = Math.round(m);
  }
  return out;
}

/** Mediana zmian względnych koszyka między dwoma pomiarami. Pasma bez pary są pomijane. */
function zmiana(odniesienie, teraz){
  const ruchy = KOSZYK
    .filter(r => odniesienie[r] > 0 && teraz[r] > 0)
    .map(r => teraz[r] / odniesienie[r] - 1);
  return ruchy.length ? mediana(ruchy) : null;
}

function szerokosc(odniesienie, teraz){
  let gora = 0, dol = 0, plask = 0;
  for (const r of KOSZYK){
    if (!(odniesienie[r] > 0 && teraz[r] > 0)) continue;
    const d = teraz[r] / odniesienie[r] - 1;
    if (d > 0.005) gora++; else if (d < -0.005) dol++; else plask++;
  }
  return { gora, dol, plask, razem: gora + dol + plask };
}

/**
 * hist: [{ at, floors, w }] rosnąco po czasie, z bieżącym pomiarem na końcu.
 * Zwraca null, dopóki nie ma z czym porównywać — strona pokaże wtedy, że zbieramy dane.
 */
export function policz(hist){
  if (!Array.isArray(hist) || hist.length < 2) return null;

  const teraz = hist[hist.length - 1];
  const start = hist[0];

  /* Dobę mierzymy WYŁĄCZNIE do rzeczywistego punktu sprzed 24 h (±3 h).
     Nie podstawiamy kotwicy sprzed tygodni — taka liczba nie jest zmianą dobową. */
  const TOLERANCJA_DOBY = 3 * 3600;
  const kandydaci = hist.filter(h => h && h.floors && h.at < teraz.at
    && Math.abs(teraz.at - h.at - DOBA) <= TOLERANCJA_DOBY);
  const doba = kandydaci.sort((a,b) =>
    Math.abs(teraz.at - a.at - DOBA) - Math.abs(teraz.at - b.at - DOBA))[0] || null;

  const odStartu = zmiana(start.floors, teraz.floors);
  const odDoby   = doba ? zmiana(doba.floors, teraz.floors) : null;
  const sz       = doba ? szerokosc(doba.floors, teraz.floors)
    : { gora: 0, dol: 0, plask: 0, razem: 0 };

  return {
    wartosc: odStartu === null ? null : +(100 * (1 + odStartu)).toFixed(2),
    zmiana:  odDoby === null ? null : +(odDoby * 100).toFixed(2),
    okno:    doba ? "24 h" : "brak odniesienia dobowego",
    odniesienie: doba ? "doba" : "brak-doby",
    szerokosc: sz,
    pomiarow: hist.length,
    odKiedy: start.at,
    wersja: WERSJA
  };
}

/** Dopisuje pomiar i trzyma 96 punktów co pół godziny — prawie dwie doby.
 *  Pierwszy pomiar zostaje na zawsze: to on jest zerem dla "100". Gdyby wypadał
 *  razem z resztą, po dwóch dobach wartość liczyłaby się od innego dnia i
 *  przestałaby być porównywalna, nie mówiąc o tym nikomu. */
export function dopisz(hist, at, floors, limit = 96, krok = KROK_HIST){
  const stare = Array.isArray(hist) ? hist : [];
  const h = stare.filter(x => x && (x.w || 1) === WERSJA);

  if (Object.keys(floors).length){
    /* Odstęp mierzymy od PRZEDOSTATNIEGO punktu, nie od ostatniego. Ostatni jest
       ruchomy — podmieniamy go co przebieg, żeby indeks na stronie był zawsze
       świeży — więc mierzenie od niego resetowałoby zegar odstępu i historia
       nigdy by nie urosła. Przerobiłem tak po teście, który to złapał. */
    const przedOst = h[h.length - 2];
    if (przedOst && (at - przedOst.at) < krok) h[h.length - 1] = { at, floors, w: WERSJA };
    else h.push({ at, floors, w: WERSJA });
  }

  if (h.length <= limit) return h;
  return [h[0], ...h.slice(-(limit - 1))];
}
