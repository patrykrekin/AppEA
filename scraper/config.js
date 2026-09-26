/* ====================================================================
   Selektory ODCZYTANE Z ŻYWYCH STRON 26.09.2026, nie zgadnięte.

   Ustalenia, na których stoi ten plik:
   · Futbin trzyma OBIE platformy w DOM jednocześnie (.platform-ps-only /
     .platform-pc-only, .hide-not-ps / .hide-not-pc). Przełącznik platformy
     jest zbędny — jedno wejście daje konsolę i PC.
   · Na stronie "cheapest" cena to .price-segment. Sąsiedni .item-score-segment
     to NIE cena, tylko wskaźnik Futbina — nie mylić.
   · fut.gg buduje klasy Tailwindem (text-[0.7em]), więc są nietrwałe.
     Nazwa gracza idzie z img[alt] ("Necib - 87 - Base Hero"), reszta
     z kolejności linii w wierszu. To przeżyje przebudowę stylów.
   ==================================================================== */

export const SOURCES = {
  market:   "https://www.futbin.com/market",
  cheapest: "https://www.futbin.com/27/squad-building-challenges/cheapest",
  movers:   "https://www.fut.gg/players/momentum/",
  // odczytane z prawdziwego linku na fut.gg/players/, nie zgadnięte
  poolGG:   "https://www.fut.gg/cheapest-by-rating/"
};

export const SEL = {
  market: {
    summary:  p => `.market-main-index-summary.platform-${p}-only`,
    change:   ".day-change-percentage",
    momentum: p => `.market-momentum.platform-${p}-only`
  },
  cheapest: {
    column: p => `.stc-player-column.hide-not-${p}`,
    head:   ".stc-column-head",
    row:    ".stc-player-wrapper",
    name:   ".stc-surname",
    pos:    ".stc-position",
    price:  ".price-segment"
  },
  movers: {
    row: 'a[class*="group/player"]',
    img: "img[alt]"
  },
  /* fut.gg/cheapest-by-rating — wiersz to link do karty, więc mamy nazwę i URL naraz.
     Kolejność linii w wierszu: nazwa, cena, pozycja, rating. */
  pool: { row: 'a[href*="/players/"]', hrefTest: "\\/players\\/\\d+" },
  /* strona pojedynczej karty: tape transakcji + najniższy BIN */
  card: { tapeHeader: "Time Sold", binLabel: "Lowest BIN" }
};

export const CYCLES = {
  fast: ["index", "momentum", "snipe", "tier"],
  slow: ["movers"],
  top:  ["top", "record"]
};

/* Pula kandydatów do rankingu: dno pasm, bo to jedyny mechanizm,
   który u nas przeszedł pomiar (+420 na Bruno Guimarães 86).
   Karty z największych spadków celowo NIE wchodzą — brak zmierzonego mechanizmu. */
export const TOP_BANDS = [85, 86, 87, 88, 89];
export const TOP_PER_BAND = 5;      // 25 kart = ok. 1,5 min przebiegu
export const TOP_COUNT = 5;
export const HOLD_DAYS = 3;         // po tylu dniach pick jest rozliczany

export const OUT = process.env.FUT_DATA || "./data.json";

/* Pasma, z których bierzemy snajpy. Niżej niż 86 marża nie pokrywa podatku. */
export const SNIPE_BANDS = [86, 87];

/* Sufit zakupu = dno pasma minus ten margines. Poniżej tego nie ma z czego brać. */
export const SNIPE_DISCOUNT = 0.15;

export const PACING = { betweenPagesMs: 2500, navTimeoutMs: 45000, retries: 2 };
