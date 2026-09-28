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
export const RYTM = [
  { dzien: 4, godzina: "08:00", tytul: "Nagrody Rivals",
    tresc: "Nagrody wpadają rano — ludzie otwierają paczki i wrzucają zawartość na rynek. Podaż rośnie, dno pasm zwykle jest wtedy najniższe w tygodniu. To dzień na kupno, nie na wystawianie." },
  { dzien: 5, godzina: "08:00", tytul: "Nagrody Champions",
    tresc: "Druga fala podaży w tygodniu, z tego samego powodu co w czwartek. Jeśli trzymasz fodder, wystaw go przed, nie po." },
  { dzien: 0, godzina: "08:05", tytul: "Nagrody Squad Battles",
    tresc: "Najsłabsza z trzech fal, ale ta sama mechanika: rano więcej podaży niż wieczorem." }
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

/** Próg pasma, który ta SBC zjada. Z nazwy ("83+ Upgrade", "2x 79+ Upgrade")
 *  albo z oceny karty-nagrody. null, gdy nie wiemy — i wtedy tak piszemy,
 *  zamiast zgadywać pasmo i wysyłać kogoś po niewłaściwe karty. */
export function progSbc(wpis){
  const m = String(wpis?.nazwa || "").match(/(\d{2})\s*\+/);
  if (m) return { prog: +m[1], skad: "nazwy SBC" };
  if (Number.isFinite(wpis?.nagroda)) return { prog: wpis.nagroda, skad: "oceny karty-nagrody" };
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
  for (const w of (sbc?.lista || [])){
    if (!w || !w.wygasaAt || w.trwala) continue;
    const { prog, skad } = progSbc(w);
    const dno = (prog && floors && Number(floors[prog]) > 0) ? Number(floors[prog]) : null;
    dodaj(w.wygasaAt, {
      typ: "sprzedaj",
      tytul: prog ? `Sprzedaj fodder ${prog}+ — wygasa ${w.nazwa}` : `Wygasa ${w.nazwa}`,
      tresc: (w.koszt ? `Koszt składu ${monety(w.koszt)}. ` : "")
        + (prog ? `Próg czytamy z ${skad}. ` : "Nie wiemy, który próg ta SBC zjada — fut.gg nie podaje wymagań składu. ")
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
