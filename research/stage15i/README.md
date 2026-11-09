# 15I — rzeczywisty kontekst pojedynczego fast

9 listopada 2026. **PASS: jeden zakończony rzeczywisty cykl na kopii tymczasowej, rzeczywiste receipts obu platform, zgodność decyzji i modeli, brak publikacji eksperymentu do produkcji.**

## Dowody i domknięcie 15H

- [Actions #42707700114](https://github.com/patrykrekin/AppEA/actions/runs/42707700114), job 129468792697, attempt 1: success. Cały run 21:59:46–22:00:28 UTC. Krok fast trwał 28 s według sekundowych znaczników Actions; limit wynosił 300 s.
- Uruchomiony kod: `6a1d3a132e38272c751d1fea552c3a01f6d375c9`. Dane i obie historie z **jednego** przypiętego main: `ff71cf2e962bba9309745421c6f15bf190c542fd`.
- 15H potwierdzony zdalnie na `2510c34a04e34716eef0b88c2b7421107a05a979`; verify.mjs ponownie przeszedł przed etapem. Protokół zamrożono lokalnie jako `16b3088` przed wykonaniem.
- Przed pobraniem rynku zdalnie przeszły: 32 regresje v2, 24 przypadki adaptera, generator instrumentacji, 17 kontrolek, refresh i stabilność. YAML i składnia wygenerowanego modułu sprawdzone również lokalnie.

## Jak zachowano izolację

Workflow ma wyłącznie contents:read i nie wykonuje git push ani merge. Aktualne wejścia pochodzą z przypiętego SHA; git diff wymaga zgodności produkcyjnego scraper runtime z kodem badawczym (wyjątek: wcześniej poprawione fixture tkontrolki).

prepare.mjs kopiuje kod poza checkout do katalogu tymczasowego runnera i **dopiero tam** generuje instrumentowany scrape.mjs. Oryginał musi mieć blob `88912b6f7b8cdc679d1a94ba62510e465d7adac6`. Wszystkie wstawki są insertion-only, mają dokładnie jeden punkt zaczepienia i można je odwrócić do identycznego źródła. Nie zmieniono obliczeń, selekcji rekomendacji ani adresów źródeł.

FUT_DATA wskazuje osobny tymczasowy katalog; zwykły fast może zapisywać tam swoje data.json i historie. Dowody trafiają do jeszcze innego katalogu. Normalne zapisy nie trafiają do main ani plików w checkout. Na końcu sprawdzono hash oryginalnego scrapera i pusty diff produkcyjnych danych/refresh.

Wyzwalanie push dotyczyło tylko konkretnej gałęzi badawczej. Po odnotowaniu uruchomienia wyłączono je commitem `06af2dfd0434782715ecd48059fd7123dbaab4b0`, jeszcze przed zakończeniem próby. Końcowa definicja ma tylko workflow_dispatch z potwierdzeniem RUN_STAGE15I i ograniczeniem gałęzi; brak crona i automatycznego ponawiania. Nie wykonywano kolejnego fast.

## Co rzeczywiście zmierzono

| Zdarzenie | Europe/Warsaw |
|---|---|
| Start logicznego cyklu | 09.11.2026 22:59:56 |
| Zakończony odczyt zestawu PS | 09.11.2026 23:00:02.064 |
| Zakończony odczyt zestawu PC | 09.11.2026 23:00:04.754 |
| Kontekst po obliczeniu decyzji i modelu dobowego | 09.11.2026 23:00:07.368 |

Czasy pochodzą z Date.now bez syntetycznych przesunięć. Równolegle zapisano rzeczywiste monotoniczne znaczniki process.hrtime.bigint; potwierdzono kolejność PS→PC→kontekst. Cookie PS ma ps5 (brak cookie domyślnej konsoli jawnie normalizowany), PC ma pc. Dodatkowe odczyty cookie to lokalne page.evaluate, bez nowego zapytania o kartę.

Receipts są dla **zestawu pasm**, nie każdej pojedynczej oferty; nie dowodzą czasu wystawienia ani transakcji. Wyciągnięty kontekst ma mode=captured, a nie fixture. Wcześniejsze syntetyczne zegary 15H nie zostały wykorzystane.

## Zgodność bieżącej analityki

| Miara | Konsola | PC |
|---|---:|---:|
| Karty kohorty 83–89 | 77 | 77 |
| Oryginalne decyzje inwestycyjne | 3 | 1 |
| Decyzje zgodne z adapterem i końcowym izolowanym data.json | 3/3 | 1/1 |
| Aktualne modele dobowe sprawdzone przez adapter | 77 | 77 |
| Odziedziczone modele bez przestemplowania | 127 | 149 |

Aktualne cztery decyzje, w monetach:

| Rynek | Karta | Cena przy sygnale | Cel | Kupno do | Cena w limicie |
|---|---|---:|---:|---:|---|
| PS | Kvaratskhelia 89 | 45750 | 51000 | 46000 | tak |
| PS | Pacho 89 | 91000 | 98000 | 88500 | nie |
| PS | Pajor 89 | 93500 | 98000 | 88500 | nie |
| PC | Kvaratskhelia 89 | 29000 | 30750 | 27750 | nie |

To opis historycznej chwili, nie aktualna rekomendacja ani zapis wykonanych zakupów. Jedna cena mieściła się w limicie; wszystkie cztery pozostają kandydatami. W nowym stanie otwarto 3+1 wiersze, nie ma zamkniętych wyników, a conditionalPct jest null. Starego rejestru nie migrowano i nie nadano mu ponownie statusu zweryfikowanego.

Stary fast zakończył się z awaria=null. Jego opublikowany **na kopii** zestaw inwestycji i poziomów dobowych jest dokładnie równy przechwyconemu kontekstowi. Hash wejść pamięciowych przed i po hooku pozostał identyczny. Weryfikacja adaptera nie zmieniła decyzji starej ścieżki.

Walidator ma 0 błędów i 2 ostrzeżenia: zachowane wycofane pola top/record. Nie zatajono ich ani nie zmieniono reguł w celu przejścia próby. Poprzednia rozbieżność PC z innej przypiętej migawki nie wystąpiła w tym wyniku; nie jest to dowód jej systemowej naprawy.

## Niezależna kontrola po pobraniu

verify-evidence.py sprawdził digest ZIP wobec metadanych Actions, listę plików i limity, następnie uruchomił check-evidence.mjs. Ten drugi weryfikator:

1. sprawdził bajty i SHA256 wszystkich sześciu plików wskazanych przez wynik;
2. pobrał lokalnie obiekt przypiętego Git commitu i porównał SHA256 data.json oraz obu wejściowych historii z manifestem;
3. niezależnie odtworzył preFast/preSlow przez filtrację oryginalnego wejścia oraz persistenceAfter przez aktualizujTrwalosc — wszystkie obiekty identyczne;
4. sprawdził hashe wybranego wycinka pasm, platformy i kolejność zegarów;
5. ponownie wykonał adapter na zapisanym captured frame i otrzymał **identyczny** shadow state;
6. sprawdził zgodność oryginalnego końcowego data.json z decyzjami i poziomami oraz jego walidację.

Wynik w independent-result.json. To silniejszy dowód niż sam zielony status Actions: kontekst jest zgodny również z oryginalnymi stanami sprzed odczytu, a nie tylko wewnętrznie spójny.

## Koszt i ograniczenia próby

- Dokładnie 1 cykl fast, bez automatycznego retry całego zadania. Wewnętrzne standardowe retry page.goto pozostały w niezmienionym go.
- Odnotowano **5 wywołań page.goto w helperze go**: jedno cheapest-by-rating i cztery momentum. Nie są to wszystkie żądania HTTP przeglądarki; liczba nie obejmuje zasobów strony i przeładowań platformy. Guard nie dopuścił nawigacji helpera do indywidualnego /players/ID. Nie dopisano indywidualnych zapytań cenowych.
- Pole adapterDurationMs wynosi 33,943842 ms. Z kodu pomiaru: to pojedynczy odcinek obejmujący kontrolę receipts, złożenie ramki, adapter i zapisy frame/shadow przed utworzeniem capture.json. **Nie jest to sam czas CPU adaptera, średnia ani benchmark obciążeniowy.**
- Frame ma 245296 B przy limicie 524288 B. Wszystkie dowody po dodaniu result.json mają 673931 B przy limicie 2097152 B; ZIP 117959 B. Każdy plik poniżej 1048576 B. Limit uploadu sprawdzany także po błędzie live, aby zawsze nie przekroczyć budżetu.
- Nie odczytywano billingu; nie deklarujemy kosztu pieniężnego. Nie uruchomiono R2, GC ani kolektora.
- Ostrzeżenia narzędzi Actions o Node20 w akcjach v4 wymuszanych na Node24 nie zatrzymały próby; nie traktować ich jako błędu algorytmu. Runtime skryptów ustawiono na Node24.

Jeden captured frame **nie dowodzi** prawdziwego potwierdzenia celu na dwóch kolejnych odczytach, skuteczności inwestycyjnej ani odporności na dowolną awarię. Momentum nadal nie daje v2 wystarczającej tożsamości ratingu. Nie rozwiązano planu przejścia otwartych legacy ani prywatnego trwałego offsite przed ewentualnym stałym kolektorem.

## Zachowane dowody i odtworzenie

Artefakt Actions ID 13714925488 wygasa **12.11.2026 23:00:23 Europe/Warsaw**. Dlatego dokładny ZIP zachowano jednorazowo jako evidence.zip na gałęzi badawczej, obok czytelnych live-result.json i input-manifest.json. To publiczne dane rynku i kontekst wcześniej publicznej aplikacji, bez sekretów i bez danych kont graczy. Nie jest to nowa polityka stałej archiwizacji ani prywatny backup R2.

SHA256 ZIP: `4e42915da5d6d7176326a9f4f11323ae7fbe11a5f1f2bc41f298c186940389c3`.

```
git fetch --depth 1 origin ff71cf2e962bba9309745421c6f15bf190c542fd
python research/stage15i/verify-evidence.py
```

To odczytuje istniejący Git commit i lokalny ZIP; nie uruchamia przeglądarki ani scrapingu. Prepare/capture nie należy wywoływać w produkcyjnym checkout. Workflow jest zachowany wyłącznie do jawnie potwierdzonej, ograniczonej próby na wskazanej gałęzi.

## Decyzja i następny krok

**15I zamknięty PASS dla jednego rzeczywistego przechwycenia i zgodności oryginalnego wyniku.** Nie scalono runtime ani pomiaru v2 do main. Dotychczasowe problemy starego rejestru nie zostały naprawione produkcyjnie przez sam eksperyment.

15J powinien sprawdzić krótki ciąg co najmniej dwóch rzeczywistych kontekstów z zachowaniem v2 state i restartem: odróżnienie nowego źródła od powtórki, rzeczywisty odstęp potwierdzeń i brak ponownego otwarcia przez identyczną powtórkę i brak mieszania starej historii. Zakres nadal ograniczony w czasie, liczbie cykli i bajtach, bez całodobowego kolektora. Równolegle trzeba przygotować jawny plan losu otwartych legacy z wybranego snapshotu przejścia zamiast milczącej migracji; wcześniejsze 4 zbadane wpisy nie wyznaczają liczby pozycji w przyszłym momencie wdrożenia. Dopiero potem rozważać konkretny diff podłączenia pomiaru.

## Źródła

1. [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — osobne czasy i kontekst źródła. Adaptacja: receipts rzeczywistego odczytu, czas przetwarzania oraz zachowany czas modelu; nie nazywać ceny ofertowej transakcją.
2. [GitHub Actions — events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) — wyzwalanie po push/dispatch i ograniczenie gałęzi. Adaptacja: jednorazowy push na gałęzi badawczej, następnie usunięcie automatycznego triggera, bez crona i bez uprawnień zapisu produkcji.

Źródła sprawdzone 09.11.2026. Wszystkie liczby rynkowe i techniczne powyżej pochodzą z zachowanych dowodów, kodu weryfikacji i metadanych jednego runu.
