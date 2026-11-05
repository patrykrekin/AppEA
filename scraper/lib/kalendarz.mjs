/* Kalendarz porad — generowany, nie wpisywany.

   Do 28.09.2026 ta sekcja stała na 13 pozycjach wklepanych ręcznie 26–27.09.
   Po trzech dniach mówiła rzeczy, którym zaprzeczała nasza własna tabela SBC:
   Marquee Matchups za 10 450, gdy fut.gg podawał 18 700. Treść, która nie
   odświeża się razem z danymi, staje się kłamstwem w tempie jednego dnia.

   Teraz każdy wpis powstaje z trzech ŻYWYCH źródeł i niesie informację, z którego:

   · sbc     — terminy i koszty z fut.gg, nasz odczyt
   · rytm    — stałe godziny tygodnia EA (nagrody = zastrzyk podaży = dołek cen)
   · pomiar  — nasz własny rozkład godzinowy okazji

   Okno liczy się od dnia przebiegu, więc przesuwa się samo. Nikt go nie przewija. */

export const DNI = 13;

/* Godziny zweryfikowane na fifauteam.com/fc-27-schedule (czas UK).
   To jest CUDZE źródło, nie nasz pomiar — dlatego każdy taki wpis jest tak
   podpisany, a docelowo sprawdzimy na własnym szeregu, czy dno pasm faktycznie
   dołuje w te poranki. Jak nie dołuje, te reguły wylatują. */
/* Regularne godziny nagród są hipotezą do porównania z pomiarami, nie sygnałem kupna.
   Nie przypisujemy Champions jednej stałej piątkowej godziny. */
export const RYTM = [
  { dzien:4, godzina:"orientacyjnie", tytul:"Potencjalna podaż po Rivals",
    tresc:"Możliwy wzrost podaży po nagrodach. Bez pomiaru cen nie ma potwierdzonego dołka ani zalecenia kupna." },
  { dzien:0, godzina:"orientacyjnie", tytul:"Potencjalna podaż po Squad Battles",
    tresc:"Hipoteza o podaży, nie potwierdzona przecena ani zalecenie transakcyjne." }
];

const DZIEN = 86400;

/* Własne grupowanie tysięcy — Intl w pl-PL nie grupuje czterocyfrowych liczb,
   więc "2150" zostawałoby bez spacji obok "18 700". */
const monety = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");

/** Klucz dnia w czasie polskim — inaczej wpisy rozjeżdżałyby się o strefę. */
export function dzienPL(ts){
  return new Date(ts * 1000).toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
}
export function dzienTygodniaPL(ts){
  const s = new Date(ts * 1000).toLocaleDateString("en-US", { timeZone: "Europe/Warsaw", weekday: "short" });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(s);
}

/** Wymagania składu to NIE nazwa nagrody ("83+ Upgrade") ani OVR
 *  karty, którą dostaje gracz. Dopóki źródło nie podaje zweryfikowanych wymagań,
 *  nie przypisujemy SBC do pasma rynku i nie generujemy polecenia sprzedaży.
 *  Przyszłe źródło może podać rating składu oraz jawne pochodzenie odczytu. */
export function progSbc(wpis){
  const prog = wpis?.wymaganyRating;
  if (Number.isInteger(prog) && prog >= 83 && prog <= 89
      && wpis?.zrodloWymagan === "potwierdzone-wymagania-skladu")
    return { prog, skad: "potwierdzonych wymagań składu" };
  return { prog: null, skad: null };
}

function godzinaHM(ts){
  return new Date(ts * 1000).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
}

/** Najlepsze godziny z naszego rozkładu — tylko gdy jest z czego liczyć. */
export function najlepszeGodziny(okazje, minPrzebiegow = 6, ile = 3){
  const g = (okazje && okazje.godziny) || {};
  return Object.keys(g)
    .map(h => ({ h: +h, ...g[h], naPrzebieg: g[h].przebiegow ? g[h].okazji / g[h].przebiegow : 0 }))
    .filter(x => x.przebiegow >= minPrzebiegow)
    .sort((a, b) => b.naPrzebieg - a.naPrzebieg)
    .slice(0, ile);
}

/** sbc: {at, lista}, okazje: stan okazji, floors: dna pasm z ostatniego odczytu. */
export function zbuduj(sbc, okazje, floors, at, dni = DNI){
  const dniLista = [];
  for (let i = 0; i < dni; i++){
    const ts = at + i * DZIEN;
    dniLista.push({ ts, dzien: dzienPL(ts), wpisy: [] });
  }
  const wgDnia = new Map(dniLista.map(d => [d.dzien, d]));
  const dodaj = (ts, wpis) => { const d = wgDnia.get(dzienPL(ts)); if (d) d.wpisy.push(wpis); };

  /* 1. SBC z terminem — sygnał WYJŚCIA. Popyt na fodder rośnie do terminu
        i znika po nim, więc data wygaśnięcia to ostatni moment na sprzedaż. */
  const zrodloSbc = sbc?.at ? `fut.gg, odczyt ${godzinaHM(sbc.at)}` : "fut.gg";
  /* Przeterminowane źródło nie generuje nowych terminów handlowych. */
  const sbcAktualne = sbc && Number.isFinite(sbc.at)
    && at >= sbc.at && at - sbc.at <= 3 * 3600;
  for (const w of (sbcAktualne ? sbc.lista || [] : [])){
    if (!w || !w.wygasaAt || w.trwala) continue;
    const { prog, skad } = progSbc(w);
    const dno = (prog && floors && Number(floors[prog]) > 0) ? Number(floors[prog]) : null;
    dodaj(w.wygasaAt, {
      typ: "termin",
      tytul: `Wygasa ${w.nazwa}`,
      tresc: (w.koszt ? `Koszt składu ${monety(w.koszt)}. ` : "")
        + (prog ? `Próg składu: ${prog}, z ${skad}. ` : "Brak potwierdzonych wymagań składu — nie wyznaczamy ratingu kart do sprzedaży. ")
        + (dno ? `Dno pasma ${prog} w ostatnim odczycie: ${monety(dno)}. ` : "")
        + "Termin z fut.gg jest zaokrąglony do doby, więc traktuj go jako ostatni dzień, nie jako godzinę.",
      zrodlo: zrodloSbc,
      kwota: w.koszt || null
    });
  }

  /* 2. Rytm tygodnia — te same godziny co tydzień, więc generują się na każdy
        dzień okna bez żadnej listy do utrzymywania. */
  for (const d of dniLista){
    const dt = dzienTygodniaPL(d.ts);
    for (const r of RYTM){
      if (r.dzien !== dt) continue;
      d.wpisy.push({
        typ: "podaz", tytul: `${r.tytul} · ${r.godzina}`, tresc: r.tresc,
        zrodlo: "rytm tygodnia EA (źródło zewnętrzne, nie nasz pomiar)", kwota: null
      });
    }
  }

  /* 3. Nasz własny pomiar — tylko na dziś, bo to rozkład godzinowy, nie kalendarz. */
  const godz = najlepszeGodziny(okazje);
  if (godz.length){
    dniLista[0].wpisy.push({
      typ: "pomiar",
      tytul: "Kiedy dziś siadać do wyszukiwarki",
      tresc: "Z naszych przebiegów najwięcej tanich wystawień wypada na "
        + godz.map(x => `${String(x.h).padStart(2, "0")}:00 (${x.naPrzebieg.toFixed(1)} na odczyt)`).join(", ")
        + ". To rozkład z całego rejestru, nie prognoza na dziś.",
      zrodlo: `nasz pomiar, ${Object.values((okazje && okazje.godziny) || {}).reduce((a, x) => a + (x.przebiegow || 0), 0)} przebiegów`,
      kwota: null
    });
  }

  return dniLista.filter(d => d.wpisy.length);
}
