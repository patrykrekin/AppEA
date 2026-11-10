# 15G — izolowany kontrakt pomiarowy v2

9 listopada 2026. **Prototyp gotowy do przeglądu: 32/32 nowe testy PASS, replay formatu PASS. Nie podłączony do produkcji.** Szerszy stary zestaw tkontrolki ma 3 istniejące wcześniej niezgodności — nie deklarujemy pełnej gotowości wdrożeniowej.

## Domknięcie 15F i zakres

Zdalny 15F potwierdzony na `9c2d9cd431f23c7c8bc8bec49db24988109b689a`. Ponowny audit.mjs odtworzył te same pięć problemów starego kodu. Przed implementacją zapisano protocol.json lokalnym commitem `2117055`. Zmiany dotyczą wyłącznie research/stage15g. scraper, refresh.yml, rekomendacje, EMA, frontend i dane produkcyjne są niezmienione.

Wybrano osobny czysty moduł ledger-v2.mjs. Wrapper starego aliasu ID został odrzucony: źródło straciło już rating i czas obserwacji. Bezpośrednia edycja produkcji została odłożona do czasu sprawdzenia regresji i wpływu na pokrycie. Moduł korzysta z istniejących stałych czasu, retencji i wersji EMA, ale wymaga nowego, jawnego wejścia. **Nie jest zamiennikiem plug-and-play starego rejestru.**

## Naprawione zachowania w prototypie

| Problem 15F | Zachowanie v2 | Dowód |
|---|---|---|
| ID profilu łączy ratingi | Klucz zawiera platformę, rating, ID i dokładną nazwę. Nie ma fallbacku ID-only ani name-only. | Cena 89 OVR nie potwierdza 88 OVR; także gdy tylko błędny rating jest obecny w bieżącej partii. |
| Jedna cena momentum liczona dwa razy | Przechowywany jest czas źródłowej obserwacji. Musi wzrosnąć; ponowne użycie nie zwiększa potwierdzeń ani ostatniego widzenia. | Jedna cena w dwóch cyklach nie daje celu; nowy poprawny odczyt nadal może go potwierdzić. |
| Przyszły czas źródła | Wiek musi wynosić od 0 do 600 s włącznie. | Przyszłe i przeterminowane dane są odrzucane; granice 600/601 s przetestowane. |
| EMA innej karty zmienia diagnozę | Wymagana zgodna tożsamość, wersja, prawidłowy czas i świeżość. | Inne ID nie zmienia poziomu; poprawna EMA go aktualizuje, bez ruchu pierwotnego celu. |
| Górna środkowa wartość zamiast standardowej mediany | Przy parzystym n średnia dwóch środkowych wartości. | Dwa rzeczywiście wygenerowane wyniki v2 z czasami 2 i 10 min dają medianę 6 min. |

Klucz jest najlepszą dostępną tożsamością profilu; nadal nie dowodzi odrębnej edycji promocyjnej o tym samym ID/ratingu/nazwie. Przesunięcie tego ograniczenia do jawnego kontraktu nie stanowi dowodu autentyczności danych źródła.

## Potwierdzanie celu, braki i czas

Obserwacja ma `observedAt`, a dowód potwierdzenia zapisuje również `processedAt`. To czas uzyskania ceny przez źródłowy odczyt, nie gwarantowany czas wystawienia oferty na rynku. Caller musi zachować pierwotny czas przy przekazaniu danych z cache; sam moduł nie umie wykryć fikcyjnego przestemplowania batcha jako nowego odczytu.

Cel musi być osiągnięty w dwóch różnych, rosnących czasach obserwacji, co najmniej 60 s po utworzeniu kandydata i z rozpiętością co najmniej 60 s. Czas do celu liczymy od pierwszego zaakceptowanego kontaktu, w minutach jako `(czasPierwszegoOdczytu−czasSygnału)/60`, bez zaokrąglania przed medianą. Zachowany dowód zawiera oba czasy źródła i przetwarzania, ceny, tożsamość oraz źródło.

**Nowa, jawna polityka ciągłości pomiaru:** brak poprawnej ceny właściwej karty w cyklu zeruje rozpoczętą serię. Przedział między kolejnymi odczytami potwierdzającymi nie może przekroczyć 600 s. To ponowne użycie istniejącego `MAX_ODSTEP_TRWALOSCI`, nie parametr dopasowany do wyniku tej próbki ani filtr rekomendacji. Alternatywa 2h była zbyt słaba jako definicja utrzymania celu; `LUKA=7200` pozostaje wyłącznie progiem zamknięcia po utracie widoczności. Wpływ polityki 600 s trzeba sprawdzić na rzeczywistym rytmie pełnego feedu przed wdrożeniem.

Powtórka dokładnie tej samej ceny i czasu źródła nie jest nowym dowodem. Zmiana ceny pod tym samym czasem źródła, cofnięta obserwacja i konflikt tożsamości nie potwierdzają celu. Ponowienie przetworzonego cyklu jest idempotentne, także po serializacji i restarcie; czas przetwarzania nie może się cofać.

Horyzont zdarzeń pozostaje 24h (`HORYZONT` starego kodu). Cena zaobserwowana dopiero po tym horyzoncie nie może dokończyć potwierdzenia rozpoczętego wcześniej. Nie interpolujemy ścieżki i nie potwierdzamy transakcji. Zamknięte wiersze zachowują liczniki braków, powtórek i przerw.

## Wersjonowanie i stare dane

Nowy podpis: `p5-k3-a5-ema3-dt300-wiek7200-o24-t6-s1500-c2-measurement2-g600`. Zmiana kontraktu jest celowa: inaczej nowe trafienia mierzyłyby coś innego pod starym podpisem.

`start(platform, oldLedger)` kopiuje cały stary rejestr do `legacy.original`, ze statusem frozen-not-reverified. **Nie przelicza zamkniętych wyników i nie awansuje otwartych wpisów na v2.** W teście na realnej przypiętej migawce zachowano identyczną serializację JSON: PS 150 zamkniętych +1 otwarty, PC 150 zamkniętych +3 otwarte. Nowa statystyka ma 0 starych wyników. Hashe zachowania są w replay-result.json.

Otwarte stare wpisy są w tym prototypie zamrożone, a nie dalej śledzone. To konsekwencja migracji, wymagająca odrębnego planu przy wdrożeniu: np. pozostawienie obserwacji starego kontraktu w oddzielnej ścieżce albo jawne zamknięcie jego zbierania. Tutaj nie wykonano migracji produkcyjnego pliku, nie utracono wpisów i nie podmieniono ich werdyktów. Ponowne użycie stanu v2 zachowuje jego archiwum. Nieznana wersja/definicja kończy się odmową zamiast zerowania historii.

## Co zwraca statystyka

To `conditional-candidate-quoted-target-contact`, nie skuteczność zakupów. Każdy wpis ma `purchaseConfirmed=false`, a `inReachAtSignal` odróżnia cenę w limicie od kandydata droższego niż limit. Kandydaci poza limitem nadal są śledzeni i jawnie oznaczeni.

`conditionalPct=100*cel/known`, gdzie `known=closed−urwane`, a scenariusze `100*cel/closed` do `100*(cel+urwane)/closed`. Zwracane są liczności, otwarte wpisy, brakujące cykle i wiersze z późnym ostatnim widzeniem. To nadal statystyka warunkowa z ograniczeniami selektywnego rankingu, nie przedział ufności ani prawdopodobieństwo transakcji. Zachowano pierwszeństwo diagnozy `poziom` przed `urwane`; dodatkowy licznik późnej ceny ujawnia, że znana diagnoza poziomu nie oznacza pełnej obserwacji ceny. `ready` oznacza jedynie istniejące minimum 15 znanych wierszy, nie wiarygodność statystyczną.

## Replay i koszt ostrożniejszej identyfikacji

Replay korzysta z niezmienionej migawki decyzji 15B i historii blob `dab4f4fe62c0ef99bf81aa4cbf36eb3700153cf1` z commitu `67837b4a0833ea7f224693cb8fa32cfc9723d06b`. Hashe są sprawdzane. Kohorta jest oryginalna: po 77 kart na rynek; nowe wiersze tworzymy tylko dla pierwotnych 4 kandydatów PS i 2 PC.

| Miara replay 12h | PS | PC |
|---|---:|---:|
| Cykle zapisanych pasm | 64 | 64 |
| Przyjęte kwotowania kohorty po chwili startu | 3024 | 2590 |
| Odrzucone kwotowania formatu | 0 | 0 |
| Otwarte wiersze v2 na końcu | 4 | 2 |
| Potwierdzone cele v2 | 0 | 0 |

Nie rekonstruujemy brakujących stanów EMA po odczycie, więc replay nie ocenia diagnozy `poziom`. Zapis co około 10–14 min nie odtwarza pełnego cyklu produkcyjnego; część odstępów przekracza nową politykę ciągłości. To test formatu, tożsamości i pokrycia, **nie backtest poprawy skuteczności**. Migrację współczesnej migawki sprawdzono osobno, przy jej własnym czasie, bez podawania przyszłych danych archiwalnych do historycznego replay.

Pole `maxIncludingSignal` obejmuje również pierwotną cenę sygnału, tak jak stan rejestru; maksimum 15E obejmowało wyłącznie późniejsze punkty. Nie porównywać ich bez uwzględnienia tej różnicy.

**Momentum:** w przypiętym data.json `55d3b2e8ca0780448741bf0d5637796ae36c9d8c` było 30 kart cache; stary selektor dopuszczał 17 świeżych aliasów ID. V2 nie dopuszcza żadnego z tych 17 jako dowodu celu, bo wejście nie ma jawnej tożsamości ratingu. Nie dopisujemy jej z nazwy, aktualnego pasma ani „jedynego ID w batchu”. Źródło z udowodnionym ratingiem, platformą, nazwą i czasem jest obsługiwane jako enriched quote i ma pozytywny test. Samo przepisanie deklaracji bez dowodu nie rozwiązuje niejednoznaczności edycji.

Skutek: PS może utracić fallback dla karty wypadającej z pasma; PC już wcześniej otrzymywało wyłącznie pasma. To koszt ochrony przed fałszywą tożsamością, nie dowód, że utrata wyniesie dokładnie 17 obserwacji na przyszły cykl. Do integracji trzeba zmierzyć realną obserwowalność albo dostarczyć lepiej identyfikowane źródło.

## Walidacja i istniejące niezgodności

- `node research/stage15g/tests.mjs`: **32/32 PASS**. Obejmuje pięć kontrprzykładów 15F, poprawne trafienia, zgodne EMA, reset po spadku/braku, granice czasu, PC/PS, niejednoznaczności i konflikty, restart, idempotencję, horyzont, migrację, arytmetykę oraz odrzucenie uszkodzonego dowodu.
- `node research/stage15g/replay.mjs`: PASS; opisane powyżej źródła i migracja.
- `node research/stage15f/audit.mjs`: stare pięć problemów nadal odtwarzalne w niezmienionej produkcji — dowód, że eksperymentalny moduł nie podmienił jej po cichu.
- Istniejące trefresh.mjs i tstabilnosc.mjs: PASS.
- **Istniejące tkontrolki.mjs: 14/17, trzy błędy.** Na osobnym checkout bazowego `67837b4a0833ea7f224693cb8fa32cfc9723d06b` wynik był identyczny. Pliki testu i implementacji są bajtowo zgodne z bazą.

Trzy istniejące niezgodności to oczekiwanie błędu dla celu oddalonego o dwa kroki (obecny guard dopuszcza więcej niż jeden), oczekiwanie blokady zamiast ostrzeżenia dla rotacji ofert oraz dawne wartości czasu podane w sekundach, podczas gdy kontrolka przyjmuje minuty. W produkcyjnym kodzie są komentarze uzasadniające wcześniejsze obniżenie ciężaru do ostrzeżeń, aby nie zatrzymywać aktualnych cen z powodu tablicy wyników. Nie zmieniono tutaj ani tych testów, ani reguł. Nie należy „naprawiać” tego zwiększeniem rygoru publikacji bez weryfikacji źródłowej decyzji.

qa.json zapisuje osobno nowe testy, replay, przechodzące kontrole i istniejącą blokadę pełnego zestawu. Pusty diff potwierdzono dla całego scraper, workflows, index.html i danych produkcyjnych. Moduł nie wykonuje I/O, a skrypty testowe zapisują wyłącznie wyniki w research/stage15g. Brak R2, DELETE, crona i nowych zapytań FUT.GG.

## Odtworzenie

```
git fetch --depth 1 origin 55d3b2e8ca0780448741bf0d5637796ae36c9d8c
node research/stage15g/tests.mjs
node research/stage15g/replay.mjs
```

Moduł wymaga jawnego wejścia: buildQuotes przyjmuje osobno platformę, czas przetwarzania oraz batch pasm z ich zachowanym `observedAt`; advance otrzymuje pełny batch, kandydatów i opcjonalne poziomy pod pełnym kluczem tożsamości. Nie importuje się go jeszcze w scraperze. Dotychczasowy walidator i frontend nie są adapterami tego schematu.

## Decyzja i następny krok

**Przyjąć prototyp do dalszej walidacji, bez merge i wdrożenia.** Naprawy pięciu kontrprzykładów są odtwarzalne, ale koszt pokrycia, adaptacja wejść/wyjść oraz istniejące niezgodności testów nie pozwalają ogłosić pełnej gotowości produkcyjnej.

Etap 15H: przygotować odizolowany adapter do rzeczywistych danych procesu, sprawdzić jego znaczenie czasu i tożsamości bez zgadywania ratingu momentum, oraz uporządkować oczekiwania starego tkontrolki na podstawie obecnych jednostek i decyzji warn/error. Najpierw offline, z porównaniem przed/po i granicami źródeł. Ustalić los otwartych legacy i sposób publikowania obu wersji osobno. Dopiero taki konkretny, przetestowany diff może być rozważany do podłączenia. Nie stroić rekomendacji na starym procencie trafień.

## Źródła i adaptacja

1. [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/): czas zdarzenia i obserwacji/przetwarzania to różne pola. Adaptacja: observedAt zachowuje pierwotny odczyt; processedAt nie staje się drugim dowodem ceny. Atrybuty nie gwarantują prawdziwości źródła.
2. [NIST/SEMATECH — Measures of Location](https://www.itl.nist.gov/div898/handbook/eda/section3/eda351.htm): standardowa mediana parzystej próby. Adaptacja: średnia środkowych czasów w minutach, bez wcześniejszego zaokrąglania.
3. [NIST/SEMATECH — Censoring](https://www.itl.nist.gov/div898/handbook/apr/section1/apr131.htm): niepełna obserwacja wymaga odrębnego znaczenia. Adaptacja ograniczona: jawne braki i warunkowy mianownik; bez automatycznego KM/IPCW, bo wycinek rankingowy jest selektywny, a cena nie jest sprzedażą.

Źródła sprawdzone 09.11.2026. Żaden nowy próg nie pochodzi z dopasowania do wyników kart; źródła parametrów i decyzje kontraktu są jawnie zapisane w protocol.json.
