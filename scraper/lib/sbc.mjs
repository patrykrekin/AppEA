/* Odczyt listy SBC z fut.gg — jedyna część planu inwestycyjnego, która do tej pory
   była wpisana ręcznie i psuła się z każdym dniem.

   Struktura potwierdzona na żywej stronie 28.09.2026 (https://www.fut.gg/sbc/):
   · każdy kafelek to kilka osobnych linków o tym samym href /sbc/{kategoria}/{slug}/
     — trzeba je pogrupować po href, bo pojedynczy link ma tylko wycinek treści
   · slug ma postać {rok gry}-{id}-{nazwa}, np. 27-26-renato-veiga, 26-1036-daily-silver-upgrade
   · kategorii jest więcej niż cztery: poza players/challenges/upgrades/foundations
     jest też icons (/sbc/icons/26-1319-eusebio/). Filtry listy siedzą pod
     /sbc/category/..., więc to jedyny człon, który trzeba wykluczyć.

   DWIE LICZBY W KAFELKU — i to był nasz błąd do 28.09:
   · przy ikonie coin.webp    → koszt rozwiązania w monetach (22 550)
   · przy ikonie sbc-gem.webp → wynik „grading score" fut.gg (25 000), NIE monety
   Braliśmy pierwszą liczbę z brzegu i wychodziło 25 000 zamiast 22 550, a przy
   TOTW Upgrade (tylko monety, bez gemu) nie wychodziło nic.

   DLACZEGO TO SIĘ MOGŁO ZDARZYĆ: sprawdzone fetchem z przeglądarki — surowy HTML
   zawiera gemy, ale NIE zawiera kosztów w monetach. Ceny doklejane są po stronie
   klienta. Nasze czekanie liczyło same linki, które są w HTML od razu, więc runner
   czytał kafelki, zanim przyszły monety. Teraz czekamy na pierwszą realną cenę.

   Czego tu NIE ma i nie będzie: wymaganej oceny składu. Sprawdzone 28.09 na
   /sbc/players/27-26-renato-veiga/ i /sbc/upgrades/27-12-83-upgrade/ — fut.gg podaje
   wyłącznie „Player OVR: Min. 45". Zamiast tego bierzemy dwie rzeczy, które tam są:
   ocenę karty-nagrody (z atrybutu alt obrazka: „Renato Veiga - 84 - ...") oraz koszt
   rozwiązania. Koszt jest nawet lepszy niż wymóg składu, bo jest wyceniony rynkowo
   i zmienia się w czasie — jego ruch to bezpośrednia miara popytu na fodder. */

export const SBC_URL = "https://www.fut.gg/sbc/";

const CZEKAJ_MS = 12000;
const USTALENIE_MS = 700;    // odstęp między pomiarami liczby wypełnionych cen
const USTALENIE_PROB = 8;    // maks. 5,6 s dopychania po pojawieniu się pierwszej ceny
const ODZNAKI = new Set([
  "NEW", "EXPIRED", "EXPIRES", "CHALLENGES", "REPEATABLE",
  "REFRESHES", "REFRESHES EVERY", "SBC", "ALL"
]);

/* fut.gg podaje zaokrąglony dystans, nie datę. Zapisujemy i dystans, i policzony
   znacznik, żeby strona mogła powiedzieć "za 2 dni" bez zgadywania godziny. */
export function parseWygasa(tekst, terazSek = Math.floor(Date.now() / 1000)){
  const t = String(tekst || "").trim().toLowerCase();
  const m = t.match(/in\s+(\d+)\s+(minute|hour|day|week|month|year)s?/);
  if (!m) return { tekst: tekst || null, at: null, trwala: false };
  const n = parseInt(m[1], 10);
  const sek = { minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }[m[2]];
  /* Rok i więcej to u nich "brak terminu", nie prawdziwa data. */
  if (m[2] === "year" || (m[2] === "month" && n >= 12)) return { tekst: tekst, at: null, trwala: true };
  return { tekst: tekst, at: terazSek + n * sek, trwala: false };
}

/** Wyciąga jeden kafelek. Dostaje to, co zebrał evaluate: linie tekstu (do terminów
 *  i liczby wyzwań) oraz pola wyłuskane z DOM-u po ikonach (koszt, nagroda, tytuł).
 *  Eksportowane, żeby dało się przetestować bez przeglądarki. */
export function zKafelka(surowy, terazSek){
  const { href, kategoria } = surowy;
  const L = Array.isArray(surowy.linie) ? surowy.linie.filter(Boolean) : [];
  const iWyzwan = L.findIndex(x => x === "CHALLENGES");

  /* Tytuł bierzemy z <h3>. Gdyby go zabrakło — pierwsza linia, która nie jest
     odznaką ani liczbą. Kiedyś to była jedyna metoda i łapała "CB83.0". */
  const nazwa = surowy.tytul
    || L.find(x => !ODZNAKI.has(x) && !/^[\d.,]+$/.test(x) && !/^[A-Z]{2,3}\d/.test(x) && x.length > 1)
    || null;

  const po = etykieta => { const i = L.indexOf(etykieta); return i >= 0 ? (L[i + 1] || null) : null; };
  const wyzwan = iWyzwan >= 0 ? parseInt(L[iWyzwan + 1], 10) : null;
  const powtTekst = po("REPEATABLE");
  const wygasa = parseWygasa(po("EXPIRES"), terazSek);

  return {
    nazwa, kategoria, href,
    koszt: Number.isFinite(surowy.koszt) ? surowy.koszt : null,
    nagroda: Number.isFinite(surowy.nagroda) ? surowy.nagroda : null,
    wyzwan: Number.isFinite(wyzwan) ? wyzwan : null,
    powtarzalna: powtTekst === "∞" ? "bez limitu" : (powtTekst && powtTekst !== "-" ? powtTekst : null),
    wygasaZa: wygasa.tekst,
    wygasaAt: wygasa.at,
    trwala: wygasa.trwala
  };
}

/** Ile dni do wygaśnięcia, zaokrąglone w górę. null dla SBC bez terminu. */
export function dniDo(wpis, terazSek = Math.floor(Date.now() / 1000)){
  if (!wpis || !wpis.wygasaAt) return null;
  return Math.max(0, Math.ceil((wpis.wygasaAt - terazSek) / 86400));
}

/** Najpierw to, co wygasa najszybciej. SBC bez terminu na końcu. */
export function poTerminie(lista){
  return [...(lista || [])].sort((a, b) => {
    if (a.wygasaAt && b.wygasaAt) return a.wygasaAt - b.wygasaAt;
    if (a.wygasaAt) return -1;
    if (b.wygasaAt) return 1;
    return 0;
  });
}

/* ── Ruch kosztu: nasza własna miara popytu na fodder ─────────────────────────

   Wymogu składu fut.gg nie podaje, ale podaje, ile kosztuje rozwiązanie SBC
   po dzisiejszych cenach. Jak ten koszt rośnie, to znaczy, że karty, które ta SBC
   zjada, właśnie drożeją — i to jest ta sama informacja, tylko wyceniona.
   Porównujemy z poprzednim odczytem wolnego cyklu, czyli zwykle z wczoraj. */
export function dopiszKoszty(lista, poprzSbc){
  const poprz = {};
  for (const w of ((poprzSbc && poprzSbc.lista) || [])){
    if (w && w.href && Number.isFinite(w.koszt)) poprz[w.href] = w.koszt;
  }
  return (lista || []).map(w => {
    const p = poprz[w.href];
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(w.koszt)) return w;
    return { ...w, kosztPoprz: p, kosztZmiana: +(((w.koszt / p) - 1) * 100).toFixed(1) };
  });
}

export async function readSbc(page, url = SBC_URL, navTimeoutMs){
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeoutMs });

  /* Czekamy na PIERWSZĄ cenę w monetach, nie na same linki. Linki są w surowym
     HTML od razu, ceny dochodzą później — liczenie linków kończyło czekanie
     za wcześnie i braliśmy kafelki bez kosztów. */
  /* 28.09 wieczorem: porównanie z żywą stroną pokazało Destined for Glory
     Challenge 1 za 2 300 u nas i 5 400 na fut.gg — 3 minuty różnicy w odczycie.
     Przyczyna: czekaliśmy na PIERWSZĄ cenę i od razu czytaliśmy wszystkie kafelki,
     a one hydratują się pojedynczo. Kafelek doczytany później dawał wartość
     z połowy drogi. Teraz czekamy, aż liczba wypełnionych cen PRZESTANIE rosnąć —
     dwa takie same pomiary pod rząd znaczą, że strona skończyła. */
  const ileCen = () => page.evaluate(() => {
    let n = 0;
    for (const a of document.querySelectorAll('a[href^="/sbc/"]')){
      for (const img of a.querySelectorAll('img[src*="coin"]')){
        if (/\d/.test(img.parentElement?.innerText || "")){ n++; break; }
      }
    }
    return n;
  });

  let dorenderowane = true;
  try {
    await page.waitForFunction(() => {
      const img = [...document.querySelectorAll('img[src*="coin"]')]
        .find(i => i.closest('a[href^="/sbc/"]'));
      if (!img) return false;
      return /\d/.test((img.parentElement.innerText || ""));
    }, { timeout: CZEKAJ_MS });

    let poprz = -1, teraz = await ileCen(), prob = 0;
    while (teraz !== poprz && prob < USTALENIE_PROB){
      await page.waitForTimeout(USTALENIE_MS);
      poprz = teraz; teraz = await ileCen(); prob++;
    }
    if (teraz !== poprz) dorenderowane = false;   // nadal rosło, gdy skończył się budżet
  } catch { dorenderowane = false; }

  const surowe = await page.evaluate(() => {
    /* Każda kategoria poza "category" (to filtry listy, nie SBC). Dzięki temu
       łapiemy też /sbc/icons/ — Icon SBC jest największym zjadaczem fodderu. */
    const re = /^\/sbc\/(?!category\/)([^/]+)\/([^/]+)\/$/;
    const num = s => { const n = parseInt(String(s).replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
    const mapa = new Map();

    for (const a of document.querySelectorAll("a[href]")){
      const h = a.getAttribute("href") || "";
      const m = h.match(re);
      if (!m) continue;
      if (!mapa.has(h)) mapa.set(h, { kategoria: m[1], linie: [], koszt: null, nagroda: null, tytul: null });
      const w = mapa.get(h);

      for (const x of (a.innerText || "").split("\n").map(s => s.trim()).filter(Boolean)){
        if (!w.linie.includes(x)) w.linie.push(x);
      }

      const h3 = a.querySelector("h3");
      if (!w.tytul && h3 && h3.textContent.trim()) w.tytul = h3.textContent.trim();

      /* Koszt: liczba stojąca przy ikonie monety. Gem (sbc-gem.webp) siedzi
         w elemencie z aria-label "... grading score" i go pomijamy. */
      if (w.koszt === null){
        for (const img of a.querySelectorAll('img[src*="coin"]')){
          const box = img.parentElement;
          if (!box || /grading/i.test(box.getAttribute("aria-label") || "")) continue;
          const v = num(box.innerText);
          if (v){ w.koszt = v; break; }
        }
      }

      /* Ocena karty-nagrody: fut.gg trzyma ją w alt obrazka, w formacie
         "Renato Veiga - 84 - Destined for Glory". Widoczny "83.0" pod kartą to
         ich własny wskaźnik, nie OVR — dlatego czytamy alt, nie tekst. */
      if (w.nagroda === null){
        for (const img of a.querySelectorAll("img[alt]")){
          const mm = (img.getAttribute("alt") || "").match(/\s-\s(\d{2})\s-\s/);
          if (mm){ w.nagroda = parseInt(mm[1], 10); break; }
        }
      }
    }
    return [...mapa.entries()].map(([href, v]) => ({ href, ...v }));
  });

  const teraz = Math.floor(Date.now() / 1000);
  const lista = surowe.map(r => zKafelka(r, teraz)).filter(x => x.nazwa);
  return { lista: poTerminie(lista), dorenderowane };
}
