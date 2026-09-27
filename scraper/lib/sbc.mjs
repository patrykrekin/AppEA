/* Odczyt listy SBC z fut.gg — jedyna część planu inwestycyjnego, która do tej pory
   była wpisana ręcznie i psuła się z każdym dniem.

   Struktura potwierdzona na żywej stronie 27.09.2026 (https://www.fut.gg/sbc/):
   · każdy kafelek to kilka osobnych linków o tym samym href /sbc/{kategoria}/{slug}/
     — trzeba je pogrupować po href, bo pojedynczy link ma tylko wycinek treści
   · w treści kafelka lecą po kolei: odznaka (NEW), nazwa, koszt(y), opis,
     CHALLENGES n, EXPIRES "in 2 days", REPEATABLE "-" / "3" / "∞"
   · "in 9 years" to sposób fut.gg na SBC bez terminu (Gold Upgrade i spółka)

   Czego tu NIE ma: wymaganej oceny składu. Ta siedzi dopiero na stronie pojedynczej
   SBC i to jest osobny krok — bez niej wiemy, KIEDY coś wygasa, ale nie które pasmo
   pociągnie. Lepsze to niż data wpisana ręcznie miesiąc temu. */

/* Adres trzymamy tutaj, a nie w config.js, żeby wdrożenie tej funkcji było
   podmianą dwóch plików zamiast trzech. Przy następnym porządkowaniu przenieść
   do SOURCES razem z resztą. */
export const SBC_URL = "https://www.fut.gg/sbc/";

const CZEKAJ_MS = 12000;
const ODZNAKI = new Set(["NEW", "EXPIRED", "EXPIRES", "CHALLENGES", "REPEATABLE", "REFRESHES EVERY", "SBC", "ALL"]);

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

/** Wyciąga jeden kafelek z pogrupowanych linii. Eksportowane, żeby dało się przetestować
 *  bez przeglądarki — parsowanie jest tu, a nie w page.evaluate. */
export function zKafelka(href, kategoria, linie, terazSek){
  const L = Array.isArray(linie) ? linie.filter(Boolean) : [];
  const iWyzwan = L.findIndex(x => x === "CHALLENGES");

  const nazwa = L.find(x => !ODZNAKI.has(x) && !/^[\d.,]+$/.test(x) && x.length > 1) || null;

  /* Koszt bierzemy tylko sprzed znacznika CHALLENGES — dalej lecą liczby wyzwań
     i powtórzeń, które wyglądają tak samo. Wymagamy formatu ceny, żeby nie złapać
     oceny "83.0" ani licznika "4". */
  const przedWyzwaniami = iWyzwan >= 0 ? L.slice(0, iWyzwan) : L;
  const kosztTekst = przedWyzwaniami.find(x => /^\d{1,3}(,\d{3})+$/.test(x) || /^\d{4,}$/.test(x)) || null;
  const koszt = kosztTekst ? parseInt(kosztTekst.replace(/,/g, ""), 10) : null;

  const po = etykieta => { const i = L.indexOf(etykieta); return i >= 0 ? (L[i + 1] || null) : null; };
  const wyzwan = iWyzwan >= 0 ? parseInt(L[iWyzwan + 1], 10) : null;
  const powtTekst = po("REPEATABLE");
  const wygasa = parseWygasa(po("EXPIRES"), terazSek);

  return {
    nazwa, kategoria, href,
    koszt: Number.isFinite(koszt) ? koszt : null,
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

export async function readSbc(page, url = SBC_URL, navTimeoutMs){
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeoutMs });

  /* Kafelki dorabia JS, tak samo jak taśmę na stronie karty. Czekamy na treść,
     nie na zegar — inaczej runner potrafi wrócić z pustą listą i nikt się nie dowie. */
  let dorenderowane = true;
  try {
    await page.waitForFunction(() => {
      const re = /^\/sbc\/(players|challenges|upgrades|foundations)\/[^/]+\/$/;
      return [...document.querySelectorAll("a[href]")]
        .filter(a => re.test(a.getAttribute("href") || "")).length > 3;
    }, { timeout: CZEKAJ_MS });
  } catch { dorenderowane = false; }

  const surowe = await page.evaluate(() => {
    const re = /^\/sbc\/(players|challenges|upgrades|foundations)\/([^/]+)\/$/;
    const mapa = new Map();
    for (const a of document.querySelectorAll("a[href]")){
      const h = a.getAttribute("href") || "";
      const m = h.match(re);
      if (!m) continue;
      if (!mapa.has(h)) mapa.set(h, { kategoria: m[1], linie: [] });
      const wpis = mapa.get(h);
      for (const x of (a.innerText || "").split("\n").map(s => s.trim()).filter(Boolean)){
        if (!wpis.linie.includes(x)) wpis.linie.push(x);
      }
    }
    return [...mapa.entries()].map(([href, v]) => ({ href, kategoria: v.kategoria, linie: v.linie }));
  });

  const teraz = Math.floor(Date.now() / 1000);
  const lista = surowe.map(r => zKafelka(r.href, r.kategoria, r.linie, teraz)).filter(x => x.nazwa);
  return { lista: poTerminie(lista), dorenderowane };
}
