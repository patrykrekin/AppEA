# Etap 8 — integracja shadow z prawdziwym przebiegiem fast
**Data: 7 listopada 2026. Status: test integracyjny PASS; produkcja bez zmian.**

> [Punkt wznowienia](START_TUTAJ_ANALITYKA.md) · [Rejestr hipotez](REJESTR_ZRODEL_BADAWCZYCH.md) · [Audyt schematu etapu 7](AUDYT_SHADOW_DECYZJI_20261107.md)

## Cel i zastosowana izolacja

Zweryfikować, czy schema shadow v1 z etapu 7 pozwala uchwycić rzeczywiste wejścia i wyniki istniejącej logiki bez zmiany rekomendacji, dodatkowych indywidualnych żądań do FUT.GG i bez publikacji danych eksperymentalnych.

Wykonano **jedno zakończone sukcesem uruchomienie `fast` na izolowanej gałęzi** `research/shadow-predecision-20261107`. Pobrano na runnerze spójny zestaw aktualnych plików (`data.json`, `historia.json`, `historia-kart.json`) z **jednego** commitu main, a następnie uruchomiono istniejący scraper na ich **kopii w `RUNNER_TEMP`**. Instrumentacja istnieje tylko na gałęzi badawczej i tylko przy jawnej zmiennej `FUT_SHADOW_AUDIT_PATH`. **Żadnego merge ani zapisu plików produkcyjnych na main.** Próba korzystała z normalnego pobrania przez `fast`; nie wykonywała dodatkowych żądań do indywidualnych profili kart.

**Dowód:** [GitHub Actions #42408574206](https://github.com/patrykrekin/AppEA/actions/runs/42408574206), [artefakt JSON (retencja 3 dni)](https://github.com/patrykrekin/AppEA/actions/runs/42408574206/artifacts/13588009799). Potwierdzony commit kodu w teście `d27061cdb6d662fad2ff153ac63f19739532dfd1`, czas odczytu `at=1794081368`, tj. **2026-11-07 19:56:08 UTC**. Dane wejściowe `main` pobrane w tym przebiegu: `be0bc1c19b16670e7491b4f22ee4bfd8e1e6d5d2`. Artefakt ma ograniczoną retencję — niniejszy trwały raport zawiera kluczowe wyniki.

## Przebieg diagnostyczny i istotna poprawka zakresu

**Pierwszy test [#42408446461](https://github.com/patrykrekin/AppEA/actions/runs/42408446461) nie przeszedł**: schema próbowała walidować rating 91, gdzie wystąpił niejednoznaczny/błędny rekord poza produkcyjnym koszykiem. To nie dowód błędu cen produkcyjnych ani transakcji. Produkcyjne funkcje `policzOkazje`, `policzInwestycje`, `aktualizujPoziomyD` operują na `KOSZYK=[83,84,85,86,87,88,89]`.

**Korekta merytoryczna:** sonda przechwytuje **cały zaobserwowany wycinek koszyka 83–89**, czyli prawdziwą populację kandydatów decyzji; nie traktuje innych ratingów jako inwestycyjnych kontroli. Stany przekazywane do sondy nadal pochodzą z tych samych wywołań produkcyjnych, bez ponownego wyliczania progów. Brak dodatkowych filtrów wewnątrz 83–89. Po korekcie uruchomiono jeden kolejny test integracyjny, zakończony powodzeniem.

## Wyniki — przebieg rzeczywisty

| Miernik | Konsola | PC |
|---|---:|---:|
| Obserwowane karty w koszyku 83–89 | **77** | **77** |
| Szybka EMA dostępna przed aktualizacją ceny | 74 | 75 |
| Dobowa EMA dostępna przed aktualizacją ceny | **77** | **77** |
| Stan trwałości po bieżącym odczycie | 7 | 8 |
| Sygnały szybkich okazji | 4 | 1 |
| Wybrane inwestycje w produkcyjnej logice | **4** | **2** |
| Inwestycje 1:1 zgodne z odizolowanym `data.json` | **4/4** | **2/2** |
| Karty, gdzie EMA dobowa sprzed i po aktualizacji różniła się liczbowo | 66 | 67 |

Dla wybranych inwestycji automatyczny niezależny weryfikator potwierdził **zgodność platformy, klucza karty, ID profilu FUT.GG, ceny, poziomu EMA sprzed aktualizacji, celu oraz `kupnoDo`** z wynikami produkcyjnego algorytmu. Zgodność liczników szybkich okazji oraz pełnego zestawu 77+77 wierszy wykazała spójność grupy badawczej. Brak wykrytej mutacji danych wejściowych. Czas wykonania sondy: **1,595561 ms** (pomiar pojedynczy, nie średnia), rozmiar migawki **17 890 B**. Cały cykl `fast` zakończył się sukcesem, a izolowane `data.json` przeszło walidację.

Istotna kontrola czasowa: 66 kart konsolowych i 67 PC miało EMA dobową różną po przetworzeniu bieżącej oferty. Potwierdza to, że sonda rzeczywiście zapisuje stan **pre-update**, który algorytm wykorzystuje w decyzji, a nie przez pomyłkę stan po aktualizacji.

Dodatkowe testy schematu — **13 PASS** przed integracją. Na użytym commitcie uwzględniono sprawdzenie duplikatów, kolizji nazw+ratingu, dopasowania ID+ratingu, siatki legalnych cen, chronologii, wersji definicji i nienaruszalności wejścia.

## Koszt, ryzyka i ograniczenia

- **17 890 B** to rozmiar *pojedynczej* migawki z 154 obserwowanymi kartami w rzeczywistym koszyku. Ekstrapolacja stałej wielkości na 48h: zapis co 10 min `17 890 × 288 ≈ 4,91 MiB`; zapis co 1h `17 890 × 48 ≈ 0,82 MiB`. To tylko surowe JSON, **bez** historii Git, kosztów publikacji, indeksów i zmiennej liczby kart. To nie uzasadnia doklejenia 48h pełnych migawek do `main`.
- Sprawdzono jeden rzeczywisty odczyt, nie wiele warunków rynkowych; zapis jest zgodny **w tym przebiegu**, a nie statystycznie zweryfikowany jako skuteczny inwestycyjnie.
- `inwestycjaWTop12` dotyczy końcowego limitowanego wyniku; `0` nie oznacza „nie spełniała żadnego kryterium” ani „nie sprzedała się”.
- ID z URL FUT.GG nie gwarantuje jednoznacznej edycji karty. Mamy identyfikację `platforma+rating+ID profilu+nazwa` i jawne zastrzeżenie.
- Późniejszy brak karty w wycinku rankingu pozostaje wynikiem nieobserwowalnym, a nie dowodem wykonanej transakcji.

## Decyzja i punkt wznowienia

**Etap 8 ZAKOŃCZONY na poziomie jednej realnej próby integracyjnej.** Sonda poprawnie przechwytuje kontekst decyzji, ma mały narzut CPU i nie wykazuje różnic wobec produkcyjnego wyniku **w sprawdzonym przebiegu**. Jednak **nie została wdrożona na main** i nie uruchamia cyklicznego zbierania historii.

**Następny krok (etap 9):** zdecydować o bezpiecznej strategii gromadzenia danych: porównać *hybrydę* (wszystkie wybrane sygnały przy każdym cyklu + rzadszy przekrój całego koszyka 83–89) z pełnym zapisem, z kontrolą utraty informacji (czy hybryda zachowuje przypadki potrzebne do badania fałszywych sygnałów), kosztu, polityki retencji i odporności workflow. Najpierw test read-only na migawce i wygenerowanej sekwencji, dopiero po testach rozważać instrumentację w produkcji. Nie zmieniać EMA ani reguł inwestycyjnych na podstawie tego testu.

## Źródła do rozwijania metodologii

- [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — oddzielne czasy zdarzenia/zaobserwowania i atrybuty, wykorzystywane przy projektowaniu instrumentacji.
- [Martin Fowler — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — zachowywanie kontekstu do odtwarzania decyzji, bez twierdzenia, że AppEA ma pełny event sourcing.
- [GitHub Docs — Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) — ostrożność w dołączaniu dużych generowanych plików do repozytorium.


## Kontrola izolacji po zapisie — wykryte i naprawione naruszenie

Podczas **końcowej inspekcji main** po zapisaniu raportu stwierdzono, że commit z eksperymentalnym hookiem `przeprowadzProbeShadow` i sześć plików badawczych pojawiły się także na `main` (mimo zamierzonego izolowania ich na gałęzi research). W zwykłym przebiegu hook był uwarunkowany zmienną `FUT_SHADOW_AUDIT_PATH` i nie był uruchamiany, ale obecność kodu **była niezgodna z zasadą bezpieczeństwa projektu**. Nie należy przedstawiać etapu jako całkowicie pozbawionego przejściowych zmian w plikach main.

**Działanie naprawcze tego samego dnia:**
- Przywrócono `scraper/scrape.mjs` na `main` z przedeksperymentalnego commitu `d33f262ed088528008c6fe2722b97cbdf8d4b462`. Oryginalny blob SHA: **`88912b6f7b8cdc679d1a94ba62510e465d7adac6`**, commit przywracający: **`67241e08a761e4bb3f5c69d20225aa472fa47187`**.
- Usunięto z `main` sześć plików prototypowych: `scraper/lib/shadow-probe-stage8.mjs`, `scraper/sprawdz-shadow-etap8.mjs`, `.github/workflows/shadow-stage8-ci.yml`, `scraper/lib/shadow-decyzje.mjs`, `scraper/tshadow-decyzje.mjs`, `.github/workflows/shadow-stage7-ci.yml`. Dokumentacja pozostaje w `main`.
- **Zweryfikowano**, że `scraper/scrape.mjs` na `main` ma oryginalny SHA i nie zawiera importu sondy. Gałąź `research/shadow-predecision-20261107` nadal zawiera kod badawczy, z którego uruchomiono eksperyment.
- Po przywróceniu na ostatnio sprawdzonym `data.json` było `awaria:null`. Należy nadal obserwować najbliższy cykl `Odświeżenie cen`; sam poprawny ostatni stan nie dowodzi, że przyszłe cykle zawsze się powiodą.

**Nowa zasada operacyjna:** po każdej edycji pliku kodu na gałęzi badawczej sprawdzać `main` po stronie GitHub (hash i obecność hooka), zanim uruchomi się kolejne zadania lub ogłosi brak zmian produkcji. Sam argument `branch` w wywołaniu narzędzia nie jest wystarczającym dowodem izolacji.
