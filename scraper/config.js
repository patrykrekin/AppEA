/* ====================================================================
   JEDYNY PLIK, KTÓRY TRZEBA UZUPEŁNIĆ PO URUCHOMIENIU NA SERWERZE.

   Selektory poniżej są NIEZWERYFIKOWANE — nie dało się ich sprawdzić
   przy pisaniu, bo środowisko budowy nie ma dostępu do Futbina.
   Kolejność działania:
       1) node probe.mjs          → zrzuci realną strukturę stron do ./probe/
       2) uzupełnij SELECTORS na podstawie tego, co zrzuciło
       3) node scrape.mjs fast    → sprawdź, czy wartości się zgadzają z tym, co widzisz w przeglądarce

   Dopóki selektor jest null, scrape kończy się błędem i NIC nie publikuje.
   To jest zamierzone: lepiej brak nowych danych niż dane wymyślone.
   ==================================================================== */

export const SOURCES = {
  market:  "https://www.futbin.com/market",
  cheapest:"https://www.futbin.com/27/squad-building-challenges/cheapest",
  momentum:"https://www.fut.gg/players/momentum/"
};

export const SELECTORS = {
  // futbin.com/market
  indexValue:  null,   // np. ".index-value"
  indexChange: null,
  momentum:    null,

  // futbin.com/.../cheapest — wiersz karty w tabeli pasm
  cheapestRow:   null,
  cheapestName:  null,
  cheapestPrice: null,
  cheapestRating:null,

  // fut.gg/players/momentum/ — wiersz rankingu zmian dobowych
  moverRow:    null,
  moverName:   null,
  moverPrice:  null,
  moverPct:    null,
  moverDelta:  null
};

/* Przełącznik platformy na Futbinie. Zweryfikowane w przeglądarce. */
export const PLATFORM_SWITCH =
  `(p) => { const b=[...document.querySelectorAll('button[name="platform"],input[name="platform"]')]
              .find(x=>x.value===p); if(!b) throw new Error('brak przełącznika platformy'); b.click(); }`;

/* Co należy do którego cyklu.
   fast  — to, co realnie rusza się w ciągu minut i decyduje o akcji
   slow  — okna dobowe i tezy; częściej nie ma sensu, a kosztuje ruch na źródłach */
export const CYCLES = {
  fast: ["index", "momentum", "snipe", "tier"],
  slow: ["movers", "pos", "open"]
};

export const OUT = process.env.FUT_DATA || "./data.json";

/* Bądź uprzejmy dla źródeł: przerwy między żądaniami i jedna przeglądarka na przebieg. */
export const PACING = { betweenPagesMs: 2500, navTimeoutMs: 45000, retries: 2 };
