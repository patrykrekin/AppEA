# 15H — adapter kontekstu fast i zgodność kontrolek

9 listopada 2026. **PASS dla adaptera i przepływu offline.** 32/32 regresje v2, 24/24 przypadki adaptera, 17/17 poprawionych kontrolek; testy refresh, stabilności i obliczeń również PASS. Adapter nie jest podłączony do scrape/refresh. Nie ma jeszcze dowodu przechwycenia czasów w realnym uruchomieniu.

## Domknięcie i izolacja

Zdalny 15G potwierdzony na `e197a304ebcb341da98695ea3e478b2a7c137027`; ponownie wykonano jego testy i replay. Przed implementacją zapisano protocol.json lokalnym commitem `2abf97f`. Aktualny sprawdzony main: `77e21a6f4fbd1e25033beddc50c84490d325f9d2`; scraper, refresh, rejestr i moduł okazji nadal mają znane wcześniejsze hashe. Na gałęzi badawczej poza research zmieniono **wyłącznie test** scraper/tkontrolki.mjs. Kod wykonawczy produkcji, dane, frontend i rekomendacje pozostają bez zmian.

## Adapter: konkretne wejście, nie odgadywanie z data.json

adapter.mjs przyjmuje niezmienny frame z istniejącego kontekstu obliczeń fast:

| Pole | Znaczenie |
|---|---|
| cycleId, cycleAt | identyfikator i czas startu pierwotnego cyklu |
| completedAt | zachowany czas zakończenia obliczeń tej ramki, nie nowy czas przy ponowieniu |
| reads.ps/pc | jawna platforma, rosnąca sekwencja odczytu, observedAt i istniejące bands |
| preFast, preSlow | modele sprzed aktualizacji, oddzielnie dla rynku; t musi być <cycleAt |
| persistenceAfter | trwałość po uwzględnieniu ceny, zgodnie z kolejnością oryginalnego fast |
| decisions | oryginalny wynik policzInwestycje |
| levelsAfter | oryginalny model dobowy po aktualizacji |
| mode | fixture albo captured; stany obu trybów nie mogą być mieszane |

Adapter nie tworzy receiptów z opublikowanego data.json. Każdy odczyt musi mieć własny observedAt w przedziale cycleAt–completedAt oraz sekwencję większą od poprzedniej. W produkcyjnym punkcie przechwycenia observedAt musi oznaczać rzeczywiste uzyskanie przekazywanego zestawu pasm; nie wolno nadawać mu nowego czasu dla cache. Czas zestawu nie jest czasem wystawienia oferty ani dowodem, że wszystkie oferty istniały równocześnie. Dla bardziej szczegółowej chronologii potrzebne będą receipts per pobrane pasmo, zamiast udawania dokładności pojedynczych ofert.

Wymagana jest zgodność platform, nazw/ratingów/ID i siatki; niejednoznaczna etykieta nazwa+rating w surowym bandzie zatrzymuje ramkę. Nie ma fallbacku po samym ID. Momentum nie jest wzbogacane przez zgadywanie — ograniczenie 15G pozostaje jawne.

## Kolejność faz i czas EMA

Na kopiach wejścia wykonywane są **niezmienione produkcyjne** policzInwestycje oraz aktualizujPoziomyD. Wynik musi być dokładnie równy przekazanym decisions i levelsAfter. Adapter nie poprawia rekomendacji do oczekiwanego wyniku; przy rozbieżności odmawia przetwarzania. Weryfikacja dowodzi zgodności obliczeń z dostarczonym kontekstem, nie autentyczności źródła ani kompletnej historii wcześniejszych stanów.

Istotna różnica zegarów: obecny fast stempluje nowy model dobowy czasem **startu cyklu**, choć powstaje on po odczytaniu pasm. V2 tworzy nowy wiersz w chwili przetwarzania. Bez rozdzielenia tych pojęć model z pierwszej ramki wyglądałby na wcześniejszy od nowego wiersza i nie aktualizowałby jego diagnozy.

Rozwiązanie adaptera: wyłącznie dla modelu, którego surowe t==cycleAt i którego wartość przeszła porównanie z funkcją produkcyjną, tworzymy dowód modelu pochodnego z t=completedAt. Oryginalne t zachowujemy jako **modelAt**, a osobno observedAt odczytu, cycleId i sekwencję źródła. To granica zakończenia obliczeń nowego modelu, nie nowy czas ceny i nie przestemplowanie starego cache. Metadane pozostają w modelEvidence. Modele odziedziczone, bez nowego odczytu, nie dostają nowego dowodu ani nowego czasu. Oryginalne obiekty nie są mutowane.

## Ponowienia, atomowość, stare dane

Fingerprint obejmuje całą ramkę i nie zależy od kolejności kluczy obiektu. Dokładne ponowienie po restarcie zwraca identyczny stan. Zmienione dane pod tym samym cycleId, cofnięty czas, ponowiona sekwencja odczytu i różne ramki z tym samym completedAt są odrzucane — nie mogą wykorzystać idempotencji silnika do milczącego pominięcia zmian.

Przetwarzanie obu rynków jest atomowe na prywatnej kopii stanu: błąd PC nie zwraca częściowo zatwierdzonej aktualizacji PS. Testy sprawdzają brak mutacji wejścia, rekomendacji i poprzedniego stanu.

Opcjonalna migracja zachowuje legacy.original według 15G, bez przeliczania i bez doliczania starych wyników do v2. Nie wolno podawać przyszłego legacy do historycznej ramki. Istniejące otwarte legacy pozostają w archiwum, a nie przechodzą jako zweryfikowane wiersze v2. **Nie wykonano migracji żywego pliku.** Przed wdrożeniem trzeba zdecydować, czy stary pomiar wygasić, czy przez przejście prowadzić go oddzielnie; ten adapter nie wybiera tego automatycznie za użytkownika.

## Naprawa trzech starych niezgodności testów

| Przed 15H | Poprawione oczekiwanie | Dlaczego |
|---|---|---|
| test wymagał błędu przy celu oddalonym o 2 kroki | dwa kroki przechodzą, jeden nadal daje błąd | istniejący guard MIN_KROKOW_CELU=1; nie mylić go z dystansem przeceny MIN_KROKOW=3 |
| historyczne czasy sekundowe trafiały do pól minutowych | t/60 i 120/60 w odpowiednich fixture | doCelu i medianaDoCelu są w minutach |
| testy oczekiwały error dla podejrzanej statystyki | wymagają właściwego warn i jednocześnie braku error | istniejący kod celowo nie blokuje świeżych cen przez tablicę wyników |

Nie zmieniono guardów, progów ani zasad publikacji. Asercje ostrzeżeń wzmocniono o warunek noErr, by nie przechodziły przy jednoczesnym zablokowaniu cen. Wynik starego zestawu zmienił się z 14/17 na 17/17 przez poprawę fixture i oczekiwań zgodnie z wcześniej udokumentowanym zachowaniem, a nie przez osłabienie kodu produkcji.

## Sprawdzenie na prawdziwych archiwalnych wartościach

archived-check.mjs weryfikuje oryginalną migawkę SHA256 `b5c5362f9be8da99d9f48de9e2f4aa89c7791f73853a22f4e3ae60a0e16f3b6e` z algorytmu `d27061cdb6d662fad2ff153ac63f19739532dfd1`. Odtwarza przechwycone modele pre-update, ceny i trwałość; sprawdza sześć decyzji z zapisem: tożsamość, cena, początkowy poziom, cel i kupnoDo.

| Miara | PS | PC |
|---|---:|---:|
| kwotowania wejściowej kohorty | 77 | 77 |
| oryginalne decyzje odtworzone zgodnie | 4/4 | 2/2 |
| modele pochodne przechodzące kontrolę funkcji produkcyjnej | 77 | 77 |
| mutacje oryginalnego wejścia | 0 | 0 |

**Zegary receipts są w tej próbie syntetyczne:** PS cycleAt+1 s, PC +2 s, completedAt+5 s. To jawne dane fixture potrzebne do sprawdzenia kształtu i granic adaptera, nie zmierzone opóźnienia rynku ani nowe parametry rekomendacji. Tryb fixture jest zapisany w wyniku i nie może być połączony z captured. Migawka nie zawiera pełnego pierwotnego kontekstu pamięci ani ostatniego czasu trwałości; ten ostatni odtworzono jako cycleAt, pole nie jest używane przez policzInwestycje. Nie przedstawiamy tego jako autentycznego przechwycenia zegarów produkcyjnych ani backtestu skuteczności.

## Wyniki kontroli

`node research/stage15h/verify.mjs` uruchamia i sprawdza kody zakończenia wszystkich siedmiu poleceń, zapisując qa.json:

- 32/32 testy silnika v2 z 15G;
- 24/24 przypadki adaptera: zegary, źródła, deduplikacja, restart, parity modeli i decyzji, odrzucenie błędnej fazy, platformy, brak mutacji, atomowość i legacy;
- 17/17 kontrolek po korekcie fixture;
- archiwalna zgodność, refresh, stabilność i testy liczbowe — PASS.

Walidacja przypiętego data.json z `55d3b2e8ca0780448741bf0d5637796ae36c9d8c` (blob `4745969730b15d6cebfc3664bf778818cad56a72`): **0 błędów, 3 istniejące ostrzeżenia**. Są to wycofane klucze top/record oraz rozbieżność indeksu PC i monitora przecen. Nie zostały wyłączone ani usunięte przez testy. Wynik PASS nie oznacza braku tych ostrzeżeń ani rozwiązania wszystkich problemów analityki rynku.

Izolację sprawdza whitelist diffu poza research: dozwolony jest tylko scraper/tkontrolki.mjs. Kod runtime, workflows, data.json, historia i frontend nie mają zmian. Brak merge, sieci w adapterze, zapisu do produkcji, nowych zapytań FUT.GG, R2, GC i harmonogramu.

## Odtworzenie

```
git fetch --depth 1 origin 55d3b2e8ca0780448741bf0d5637796ae36c9d8c
node research/stage15h/verify.mjs
```

Pobranie commitu jest odczytem istniejącego repozytorium, nie scrapowaniem rynku. verify.mjs potrzebuje obiektu do walidacji przypiętej migawki. Wymaga też bazowego obiektu `67837b4a0833ea7f224693cb8fa32cfc9723d06b` do kontroli diffu; przy płytkim klonie trzeba pobrać również ten istniejący commit.

## Decyzja i następny krok

**15H zamknięty w zakresie adaptera i walidacji offline.** Usunięto wcześniejszą blokadę starych testów; nie ma podstaw do automatycznego merge lub publikacji nowego procentu skuteczności. Rzeczywista granica przechwycenia danych i przejście otwartych legacy pozostają do sprawdzenia.

Najbliższy 15I: jedna ograniczona próba przechwycenia kontekstu istniejącego fast na izolowanej kopii, z rzeczywiście zapisanymi receiptami i porównaniem rekomendacji przed/po. Nie dopisywać indywidualnych zapytań o karty; nie publikować danych eksperymentu jako produkcyjnych i nie uruchamiać stałego kolektora. Najpierw przygotować konkretny diff punktów przechwycenia, limity i miejsce wyniku. Otwarte legacy zachować jako osobny, nieweryfikowany stary kontrakt, dopóki nie zostanie ustalony plan przejścia.

## Źródła i adaptacja

1. [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — osobne czasy zdarzenia i obserwacji oraz atrybuty kontekstu. Adaptacja: source observedAt, zachowany modelAt i granica zakończenia obliczeń; metadata nie dowodzą same z siebie autentyczności źródła, a stare dane nie uzyskują nowej świeżości przez nowy cykl.
2. [Hyndman i Athanasopoulos — Forecasting: Principles and Practice, rozdział 5](https://otexts.com/fpp3/toolbox.html) — ocena, benchmarki i oddzielenie strojenia od testu. Adaptacja: jawne ograniczenia rekonstrukcji kohorty i syntetycznych czasów; żadnego nowego twierdzenia o skuteczności inwestycji z testu adaptera.

Źródła sprawdzone 09.11.2026. Pozostałe parametry i decyzje kontraktu są odziedziczone z 15G; nie optymalizowano ich na wynikach tej próbki.
