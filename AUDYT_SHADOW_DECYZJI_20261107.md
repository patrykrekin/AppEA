# Etap 7 — pasywne rejestrowanie rzeczywistego kontekstu decyzji AppEA
**Data audytu: 7 listopada 2026. Status: IZOLowany prototyp, bez wdrożenia produkcyjnego.**

> Trwały punkt wznowienia: [START_TUTAJ_ANALITYKA.md](START_TUTAJ_ANALITYKA.md). Historię wniosków prowadzi [REJESTR_ZRODEL_BADAWCZYCH.md](REJESTR_ZRODEL_BADAWCZYCH.md). Ten dokument opisuje *stan badań* na konkretnej migawce kodu; nie zastępuje sprawdzenia bieżącego main.

## Cel

Nie chcemy oceniać algorytmu `aktualizujPoziomyD` na średniej odtworzonej z wybiórczych cen. Chcemy — w przyszłych, nieprodukcyjnych pomiarach — zachować **faktycznie użyty w danej chwili kontekst** oraz wynik istniejącej funkcji decyzyjnej, aby odróżniać poprawność sygnału, jego obserwowalność i późniejszy wynik. Nie chodzi o dowody dokonanych transakcji.

## 1. Audyt miejsc w kodzie (7 XI)

Na `scraper/scrape.mjs` kolejność jest następująca:

1. `readBandsGG` pobiera istniejący wycinek ofert z FUT.GG; `read(OUT)` zwraca poprzedni stan (obecnie `data.json`).
2. `poprzPoziomy = filtrujPoziomy(..., at, MAX_PRZERWA_EMA_SZYBKA)`; `policzOkazje(bands, poprzPoziomy)` **przed aktualizacją**; dopiero potem `aktualizujPoziomy` (szybka EMA).
3. `poprzD = filtrujPoziomy(..., at, MAX_PRZERWA_EMA_DOBOWA)`, `poprzT = filtrujTrwalosc(...)`.
4. `trwalosc = aktualizujTrwalosc(poprzT, bands, poprzD, at)` jest **zaktualizowana o obecną cenę**.
5. `policzInwestycje(bands, poprzD, trwalosc, at)` zwraca **wybrane najwyżej 12** wierszy; to nie wszystkie przypadki spełniające wstępne kryteria.
6. Dopiero potem `aktualizujPoziomyD` zapisuje nowy stan poziomu dobowego.

**Nie należy:** przechwytywać EMA po aktualizacji i podpisywać jej jako poziomu, na podstawie którego oceniono bieżącą przecenę; sam brak karty w TOP12 nie oznacza negatywnej decyzji (limit rankingu); `null` w przefiltrowanym poziomie nie oznacza, że nigdy nie było historycznych danych.

W szczególności `definicjaOkazji()` z `lib/okazje.mjs` i `definicja()` z `lib/rejestr.mjs` muszą stanowić podpisy konkretnej wersji metody, a SHA należy pobrać z faktycznego `git rev-parse HEAD` **po** aktualizacji gałęzi w workflow. Sam `GITHUB_SHA` może odnosić się do starego checkoutu.

## 2. Źródło, tożsamość, semantyka

- Wycinek `/cheapest-by-rating/` jest limitowaną listą ofert, **nie** pełnym zbiorem listingów i **nie** taśmą zrealizowanych transakcji. Nieobecność oznacza wyłącznie brak w konkretnym poprawnie odczytanym wycinku.
- Identyfikator w aktualnym parserze jest fragmentem `/players/(\\d+)` — **ID profilu FUT.GG**, nie bezwarunkowo unikalnym *item ID* konkretnego wydania karty. W rzeczywistym archiwum ten sam ID (`248822`) wystąpił z OVR 88 i 89, a `230621` z OVR 89 i 90. Dlatego klucz obserwacji zawiera **platformę, rating, ID profilu i nazwę**. To nadal **nie gwarantuje** rozróżnienia dwóch edycji o tych samych atrybutach; nie wolno takich przypadków łączyć jako pewnej jednej wersji.
- Nazwa+racing jest kluczem poziomu w starej produkcji `kluczKarty`; przy kolizji nazwy i ratingu dwóch profili test izolowany **odrzuca** migawkę, nie zgaduje dopasowania.
- Sygnał `inwestycjaWTop12` jest oznaczany tylko po zgodności **klucza produkcyjnego i ID profilu**, oddzielnie dla platform. Brak sygnału nie oznacza straty.
- Przedział czasu zapisujemy w sekundach UNIX. `czasOdczytuStart` to znacznik na początku przebiegu, **nie** ścisły czas opublikowania ceny w FUT.GG. W przyszłej integracji warto zachować osobno czas zakończenia odczytu/weryfikacji.

## 3. Co zostało zrobione

Na osobnej, niescalonej gałęzi [`research/shadow-predecision-20261107`](https://github.com/patrykrekin/AppEA/tree/research/shadow-predecision-20261107) znajdują się:
- [`scraper/lib/shadow-decyzje.mjs`](https://github.com/patrykrekin/AppEA/blob/research/shadow-predecision-20261107/scraper/lib/shadow-decyzje.mjs) — funkcja **pure**, jedynie zwraca obiekt migawki i metryki bajtów; bez I/O, przeglądarki, fetch, nowych odczytów FUT.GG i bez zmiany `data.json`.
- [`scraper/tshadow-decyzje.mjs`](https://github.com/patrykrekin/AppEA/blob/research/shadow-predecision-20261107/scraper/tshadow-decyzje.mjs) — testy rozdziału PS/PC, parowania ID+rating, stanu sprzed ceny, nieuzasadnionego dziedziczenia po innej tożsamości, siatki cen, spójności rekomendacji, limitów bajtów, braku mutacji i obecności definicji.
- [Izolowana próba GitHub Actions](https://github.com/patrykrekin/AppEA/actions/runs/42407791946) — **13/13 testów PASS**; do oceny cięcia i rozmiaru zastosowano realną liczbę widocznych kart, ale **syntetyczne wartości stanu EMA**. To **nie jest** odtworzenie decyzji na realnych danych.

Schemat v1 zapisuje: timestamp odczytu, podpis szybkiej i inwestycyjnej definicji, faktyczny SHA kodu, platformę, OVR, ID profilu, nazwę, cenę, poziomy EMA **przed** obecną ceną i ich wiek/staż, trwałość **po** cenie, flagi wyników istniejącej logiki oraz parametry wybranych wierszy. Rozdzielone `null` nie są zerami. Wiersze obejmują także obserwowane przypadki bez rekomendacji (kandydatów do grupy kontrolnej), bez wymuszania imputacji.

### Kontrakt bezpieczeństwa

Prototyp nie jest podłączony do `scrape.mjs`, `refresh.yml`, `index.html`, `data.json`, `historia-kart.json` ani rekomendacji. Żaden plik danych produkcyjnych nie został zmodyfikowany. **Żadne rzeczywiste stany pre-decision nie zostały jeszcze zebrane** — testy weryfikują jedynie poprawność formatu, spójność i zachowanie funkcji.

## 4. Rozmiar i koszt (oszacowanie, NIE produkcyjny pomiar)

Pomiar formatowania na 7 XI na **249 rzeczywiście obserwowanych kartach** (126 konsola, 123 PC) z **syntetycznymi** kompletnymi stanami EMA i trwałości. Dla wariantu schematu z nazwą i podpisem definicji:

| Próbka / retencja | Szacowany rozmiar surowego JSON |
|---|---:|
| Jedna migawka 249 kart | **22 217 bajtów**, ~21,7 KiB |
| Co 10 min przez 48 h (288 migawek) | **6,10 MiB** |
| Co godzinę przez 48 h (48 migawek) | **1,02 MiB** |

To tylko liniowa ekstrapolacja surowego payloadu. **Nie** obejmuje rewizji Git, indeksów, przyszłej zmienności liczby kart, dodatkowych metadanych ani kosztu agregacji. Aktualny `historia-kart.json` v2 przekroczył już 1 MB (`1 026 212` bajtów na sprawdzonej migawce). GitHub zaleca nie przekraczać **1 MB** na obiekt i trzymać generowane pliki poza repozytorium, gdy rosną. Dlatego pełne archiwum co 10 min w `main` **nie jest rozsądną zmianą bez osobnego projektu przechowywania**.

Źródło: https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits

## 5. Alternatywy i decyzja

| Opcja | Co zyskujemy | Ograniczenie / decyzja |
|---|---|---|
| A. Cała populacja z każdego przebiegu fast w Git | Rozdzielczość sygnałów i kontroli | Zbyt duży koszt: odrzucamy jako domyślny wariant |
| B. Same wybrane rekomendacje | Mało danych | Brak grupy kontrolnej / brak oceny odrzuconych: niewystarczające |
| C. **Hybryda**: rzeczywiste sygnały z każdego przebiegu + rzadszy przekrój wszystkich widocznych kart | Zachowuje incydenty i część kontroli przy niższym koszcie | Najbardziej obiecujący **pomysł do osobnego testu**, ale musi jawnie oznaczać częstotliwość próbkowania i brak gwarancji kompletnego feedu |

Dla pełnego materiału 48h lepiej rozważyć osobne artefakty o krótkiej retencji albo magazyn danych poza Git, zamiast zwiększać rozmiar `main` i ilość commitów. Artefakt nie jest trwałym rejestrem do nieskończonej historii — wymaga polityki retencji i eksportu. Wybór magazynu i częstotliwości **nie został wdrożony**.

## 6. Literatura i transfer

1. OpenTelemetry, [Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — osobny czas zdarzenia i zaobserwowania, typ/atrybuty/wersja rekordu. Adaptacja: chwila `t`, dane kontekstu sygnału, identyfikatory i wersja logiki, nie samo końcowe pole ceny.
2. Martin Fowler, [Event Sourcing](https://www.martinfowler.com/eaaDev/EventSourcing.html) — zachowywanie zdarzeń w celu badania przeszłego stanu. Inspiruje historię decyzji, ale **AppEA nie implementuje pełnego event sourcingu** i nie powinno rekonstruować sygnałów z niepełnych zdarzeń.
3. GitHub Docs, [Repository Limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) — zalecenia dot. wielkości pojedynczych obiektów i generowanych danych. Adaptacja: unikamy rosnącego 5–6 MB pliku w Git i konieczności częstych dużych pushy.

## 7. Następny krok (etap 8)

1. Jeden **krótki, izolowany** test integracyjny w kontrolowanym runnerze (ewentualnie z jednym już planowanym odczytem źródła; bez nowych per-card requestów), przekazujący rzeczywiste `poprzPoziomy`, `poprzD`, `trwaloscPo`, `okazje` i `inwestycje` do funkcji pure. Nie wpływać na `main`, harmonogram czy publikację cen.
2. Sprawdzić 1:1 parowanie z prawdziwymi rekomendacjami i przypadkami bez sygnału, szczególnie przy powtarzanych ID i wzrostach ratingu. Zweryfikować prawdziwą objętość payloadu i czas CPU. Zatrzymać test przy niedookreślonej tożsamości, braku danych, przekroczonym limicie bajtów albo błędzie parsera.
3. Przed wdrożeniem storage porównać wariant hybrydowy z pełnymi snapshotami i zdecydować o retencji i deduplikacji. Żadnych zmian progów EMA/inwestycji bez uczciwego backtestu na dłuższym horyzoncie.

**Decyzja etapu 7:** projekt schematu i walidacja jednostkowa zakończone; pełny zapis produkcyjny NIE ZOSTAŁ dopuszczony. Status: *zweryfikowane wyłącznie w izolacji*, nie *wdrożone*.
