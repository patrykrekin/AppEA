# 15E — cena po 12h i zaobserwowane dojście do pierwotnego celu

9 listopada 2026. PASS kontroli technicznych; opis jednej historycznej kohorty, bez zmiany rekomendacji.

## Domknięcie 15D i protokół

Zdalny 15D potwierdzony na `5ad5d5ea3af5660bdc39db2f4638240d072bfd30`. Ponownie wykonano compare.py 15D: PASS. Wyniki 15D i ich interpretacja pozostają bez zmian.

Przed obliczeniami 15E utrwalono protocol.json lokalnym commitem `c997d46`. To nie prospektywna prerejestracja: pracujemy na tej samej znanej historycznej kohorcie, bez odłożonej próby. Nie dobieramy horyzontu do wyniku. Parametry 12h (43200 s), tolerancja endpointu ±900 s i diagnostyka przerw >1200 s pochodzą z istniejącego jakosc-historii-kart.mjs i wcześniejszego planu badań. Próg 1200 s nie oznacza ciągłego pokrycia ani gwarancji dostrzeżenia celu.

Źródła zamrożone jak w 15B–15D: migawka decyzji SHA256 `b5c5362f9be8da99d9f48de9e2f4aa89c7791f73853a22f4e3ae60a0e16f3b6e`; historia-kart.json z `67837b4a0833ea7f224693cb8fa32cfc9723d06b`, blob Git `dab4f4fe62c0ef99bf81aa4cbf36eb3700153cf1`. Skrypt weryfikuje oba hashe i brak mutacji wejść. Nie pobieramy nowych cen ani nie uzupełniamy starego zbioru z aktualnej retencji.

Kohorta: wszystkie 154 pierwotne wiersze, osobno 77 PS i 77 PC. Cel sprawdzamy tylko dla sześciu pierwotnych inwestycji (pięciu w limicie kupna). Nie przypisujemy celów pozostałym kartom. Tożsamość = platforma+rating+ID profilu+dokładna nazwa; nie daje pewności identycznej edycji promocyjnej.

## Dwie różne miary

1. **Cena po 12h:** najbliższa obserwacja do t+43200 s w tolerancji ±900 s, przy remisie wcześniejsza. Brak ceny nie jest stratą ani sukcesem. Wynik staje się rozliczalny dopiero po zamknięciu całego okna tolerancji.
2. **Cel zaobserwowany w ciągu 12h:** istnieje punkt z ceną >= pierwotny cel przy t < czas <= t+43200 s. To ścisłe okno: obserwacja z dodatniego ogona tolerancji endpointu nie może zostać zaliczona jako dojście w 12h. Cel nigdy nie jest podmieniany na później obniżony poziom.

Czas decyzji: 07.11.2026 20:56:08 Europe/Warsaw (1794081368 s). Horyzont: 08.11.2026 08:56:08; tolerancja końcowa 08:41:08–09:11:08. Wszystkie sześć endpointów inwestycji wybrano z 08:52:25, czyli 223 s przed nominalnym horyzontem. Nie udajemy dokładnie 12-godzinnej ceny.

Pierwszy zapis ceny na celu byłby tylko pierwszym **zaobserwowanym** kontaktem, a nie znanym czasem pierwszego przekroczenia. Powrót poniżej celu między odczytami jest możliwy; nie konstruujemy przedziału pierwszego przekroczenia z ostatniej niższej ceny. Cena ofertowa nie dowodzi możliwości sprzedaży ani płynności.

## Wyniki sześciu inwestycji

| Rynek/karta 89 OVR | Cena przy sygnale | Pierwotny cel | Maksimum odnotowane w ścisłym 12h | Cena przy końcu 12h | Zmiana końcowa | Cel odnotowany |
|---|---:|---:|---:|---:|---:|---|
| PS Mariona | 23500 | 28000 | 24250 | 21750 | −7,45% | nie |
| PS Kvaratskhelia | 53500 | 67000 | 55000 | 53000 | −0,93% | nie |
| PS Bühl | 92500 | 111000 | 105000 | 95000 | +2,70% | nie |
| PS Pajor | 106000 | 113000 | 103000 | 95000 | −10,38% | nie |
| PC Mariona | 23500 | 28750 | 23500 | 18250 | −22,34% | nie |
| PC Kvaratskhelia | 33750 | 42250 | 33000 | 25500 | −24,44% | nie |

Jednostka cen: monety. Zmiana końcowa = 100*(p12/p0−1). Maksimum jest maksimum **zapisanych** cen po sygnale, bez podstawiania p0 i bez ekstrapolowania przerw. PS Pajor od początku nie spełniała limitu kupna; pozostaje kandydatem, nie dostępnym zakupem.

Cel nieodnotowany: 0/4 kontaktów na PS i 0/2 PC; osobno 0/3 i 0/2 dla pozycji początkowo w limicie kupna. Nie nazywać tych ilorazów prawdopodobieństwem transakcji ani pełną skutecznością strategii. Istnieją przerwy, jedna wspólna chwila startowa i zależne platformy/profilowe tożsamości.

Po 2h w 15C wszystkie sześć cen było niżej. Po 12h Bühl/PS jest wyżej o 2,70%, a Kvaratskhelia/PS bliżej p0 niż po 2h; na PC obydwa spadki się pogłębiły. Hipoteza „cel przyjdzie z opóźnieniem do 12h” nie uzyskała potwierdzenia w zapisanych cenach tej próbki. Nie rozstrzyga to późniejszego okresu ani niezarejestrowanych chwil.

Hipotetyczna stopa po podatku, przy zakupie po zaobserwowanej p0 i sprzedaży po p12, wynosi 100*(0.95*p12/p0−1). Współczynnik 0.95 pochodzi z istniejącego modelu AppEA, nie z nowej weryfikacji reguł EA. Nawet Bühl/PS ma według tego modelu −2,43%. Wszystkie pięć pozycji pierwotnie w limicie kupna ma ujemną wartość tej miary w końcowym punkcie. Nie jest to zrealizowana strata i nie wyklucza hipotetycznego zysku po innej cenie w trakcie okna.

## Pokrycie i braki

| Rynek/karta | Odczyty ceny / poprawne migawki pasma w 12h | Migawki pasma bez karty | Największa przerwa z granicami okna | Przerwy >20 min |
|---|---:|---:|---:|---:|
| PS Mariona | 64/64 | 0 | 841 s | 0 |
| PS Kvaratskhelia | 64/64 | 0 | 841 s | 0 |
| PS Bühl | 59/64 | 5 | 3240 s | 2 |
| PS Pajor | 64/64 | 0 | 841 s | 0 |
| PC Mariona | 64/64 | 0 | 841 s | 0 |
| PC Kvaratskhelia | 64/64 | 0 | 841 s | 0 |

Przerwy liczymy między kolejnymi cenami oraz od t do pierwszej ceny i od ostatniej ceny do ścisłej granicy 12h. 64/64 oznacza obecność we wszystkich zapisanych poprawnych odczytach pasma, nie ciągłą obserwację. Przy Bühl brak w poprawnie odczytanym wycinku nie oznacza braku karty na rynku; maksymalna przerwa to 54 min.

Dla całej kohorty endpointy 12h dostępne są dla 55/77 PS i 51/77 PC (w 15C po 2h było po 63/77). Pozostałe 22 i 26 kart nie miały ceny w oknie mimo poprawnych migawek swoich ratingów. To selekcja, więc nie porównujemy median kohort 2h i 12h jak tej samej kompletnej populacji. Nie imputujemy cen. Wyniki wszystkich 154 wierszy i braków są w rows.csv.

## Decyzja i następny etap

**Zachować algorytm; nie dopasowywać do tej próbki nowego progu, stop-loss ani niższego celu.** 15E poszerza opis nieudanego krótkiego odbicia tej konkretnej kohorty, ale nie daje niezależnego dowodu przydatności filtra. Samo wydłużanie tego samego okna po poznaniu wyniku nie stworzy nowej próby testowej.

Najbliższy wartościowy etap 15F: audyt kontraktu produkcyjnego rejestru i prezentowanej skuteczności — kogo rejestr uznaje za pozycję, czy zachowuje pierwotny cel, jak potwierdza cenę na celu i jak traktuje nieobserwowalne wyniki w mianowniku. Porównać faktyczny kod i dane z językiem interfejsu; najpierw minimalne przypadki offline. Trzeba odróżnić kandydatów od pozycji w limicie kupna oraz kontakt ceny z celem od wykonanej sprzedaży. To nowy audyt, a nie stwierdzony w 15E błąd rejestru: rejestr ma inny czas wejścia i częstotliwość odczytu, nie wolno oczekiwać zgodności jego liczników z sześcioma wierszami tej migawki.

Stały collector, GC, R2, refresh.yml i algorytm rekomendacji nadal poza zakresem. Nie uruchomiono nowych zapytań FUT.GG.

## Walidacja i odtworzenie

- `python research/stage15d/compare.py` — ponowne domknięcie 15D PASS.
- `python research/stage15e/followup12.py` — PASS: źródłowe hashe, chronologia, tożsamość, siatka cen, metadane pasm, 154 wiersze, brak mutacji. Przypadki syntetyczne sprawdzają rozdział endpointu i ścisłej ścieżki, oba brzegi, remis, brak ceny, brak pasma, stan oczekujący i wykluczenie przyszłych danych względem asof.
- `node research/stage15e/verify.mjs` — niezależny weryfikator JS potwierdził wszystkie sześć celów, maksima, liczby punktów i endpointy oraz pięć początkowo dostępnych zakupów.
- Istniejące tcenzurowanie.mjs i tjakosc-historii.mjs — PASS.

result.json zawiera podsumowania i sześć inwestycji, rows.csv wszystkie 154 wiersze. Źródłowa historia jest już w bazowym drzewie gałęzi; nie duplikujemy całego archiwum. Zmiany wyłącznie w research/stage15e.

## Źródła i adaptacja

1. [Hyndman i Athanasopoulos — Forecasting: Principles and Practice, rozdział 5](https://otexts.com/fpp3/toolbox.html): horyzont oceny i oddzielenie walidacji od strojenia. Adaptacja: wcześniejsze 12h±15min, jawne pokrycie i brak udawania niezależnego train/test na jednej kohorcie.
2. [NIST/SEMATECH — Censoring](https://www.itl.nist.gov/div898/handbook/apr/section1/apr131.htm): rozróżnienie dokładnego czasu zdarzenia, cenzurowania i informacji przedziałowej. Krytyczna adaptacja: cena może wielokrotnie przekraczać cel i wracać; ranking jest selektywny, więc nie przenosimy modelu jednorazowej awarii na pierwszy czas dojścia. Nie estymujemy Kaplan–Meier ani nie traktujemy braku zapisu jako dowodu braku przekroczenia.

Źródła sprawdzone 09.11.2026; nie dostarczają cen ani dowodów wykonania transakcji. Zachowano wcześniejsze zasady z AUDYT_NIEOBECNOSCI_KART.md.
