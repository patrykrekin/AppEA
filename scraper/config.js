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

  /* UWAGA: to lecą do page.evaluate, więc muszą być ZWYKŁYMI STRINGAMI.
     Funkcja przekazana do evaluate serializuje się do tekstu i nie da się jej
     wywołać po stronie przeglądarki. Platformę wstawiamy przez .replace("{p}", …). */
export const SEL = {
  market: {
    summary:  ".market-main-index-summary.platform-{p}-only",
    change:   ".day-change-percentage",
    momentum: ".market-momentum.platform-{p}-only"
  },
  cheapest: {
    column: ".stc-player-column.hide-not-{p}",
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

/* Pula do rankingu taśmy. Próbkujemy cały zakres cen w paśmie, nie tylko
   pięć najtańszych kart, żeby sprawdzić też droższe pozycje do 200k. */
export const TOP_BANDS = [85, 86, 87, 88, 89];
export const TOP_PER_BAND = 5;      // 25 kart na platformę; próbka z całego zakresu cen
export const TOP_COUNT = 5;
export const TOP_MAX_PRICE = 200_000;
export const HOLD_DAYS = 3;         // po tylu dniach pick jest rozliczany

export const OUT = process.env.FUT_DATA || "./data.json";

/* Pasma, z których bierzemy snajpy. Niżej niż 86 marża nie pokrywa podatku. */
export const SNIPE_BANDS = [86, 87];

/* Sufit zakupu = dno pasma minus ten margines. Poniżej tego nie ma z czego brać. */
export const SNIPE_DISCOUNT = 0.15;

export const PACING = { betweenPagesMs: 2500, navTimeoutMs: 45000, retries: 2 };
