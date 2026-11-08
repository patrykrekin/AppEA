# 15C — dalsze obserwacje prawdziwych sygnałów po 2 godzinach

8 listopada 2026. Status: PASS kontroli danych i obliczeń; opisowy wynik jednej kohorty, bez zmiany rekomendacji.

## Kontrola poprzedniego etapu i protokół

Potwierdzono zdalny HEAD 15B `00d72f2ee8995a6207e53fa73d03f22f6ec904fc`. Ponownie uruchomiono audit.mjs 15B: PASS. Pochodzenie decyzji pozostaje takie jak w raporcie 15B.

Przed obliczeniem wyników utrwalono protocol.json lokalnym commitem `1a05628`. Nie jest to prerejestracja prospektywna ani odłożony zbiór testowy: historia już istniała i pochodzi z wcześniejszej pracy nad projektem. Horyzont 7200 s i tolerancja 900 s są odziedziczone z audytu prognoz 2h i jakosc-historii-kart.mjs; nie dobierano ich do tych wyników. Przy remisie wybór wcześniejszej obserwacji. Kontrola obejmuje wszystkie 154 wiersze (77 na rynek), bez dobierania tylko udanych sygnałów.

Zamrożona historia: historia-kart.json z `67837b4a0833ea7f224693cb8fa32cfc9723d06b`, blob Git `dab4f4fe62c0ef99bf81aa4cbf36eb3700153cf1`. Skrypt weryfikuje blob przed pracą i po odczycie. Źródła wejściowe są już w drzewie bazowego commitu; nie kopiujemy całej historii ponownie. Czas początkowy: 07.11.2026 20:56:08 czasu polskiego, cel obserwacji: 22:56:08, okno 22:41:08–23:11:08. Pełne wejścia i wyniki liczbowe są odtwarzalne.

Tożsamość: platforma + rating + ID profilu + dokładna nazwa. To najlepszy dostępny klucz, ale nie dowód identycznej edycji promocyjnej. Wszystkie punkty dopasowanych kart przeszły kontrolę chronologii, granicy czasu archiwum i siatki. Każdy wybrany punkt ma potwierdzoną migawkę poprawnego pasma dla tego samego czasu i ratingu.

## Wyniki

| Miernik | Konsola | PC |
|---|---:|---:|
| Karty z ceną w oknie / kohorta | 63/77 | 63/77 |
| Nieobecne w obserwowanych wycinkach pasma w oknie | 14 | 14 |
| Inwestycje z wynikiem / wybrane | 4/4 | 2/2 |
| Inwestycje z ceną początkową <= limicie kupna | 3 | 2 |
| Inwestycje z ceną >= zamrożony cel w wybranej chwili | 0/4 | 0/2 |
| Mediana zmiany ceny, wszystkie inwestycje | -5,62% | -5,78% |
| Mediana zmiany ceny, inwestycje w limicie kupna | -3,78% | -5,78% |
| Szybkie sygnały z obserwacją / wybrane | 1/4 | 1/1 |
| Mediana zmiany ceny wszystkich obserwowalnych kart | 0,00% | 0,00% |

| Rynek | Karta | Cena w chwili sygnału | Cena w oknie 2h | Zamrożony cel | W limicie kupna na początku |
|---|---|---:|---:|---:|---|
| Konsola | Mariona 89 | 23500 | 21750 | 28000 | tak |
| Konsola | Kvaratskhelia 89 | 53500 | 52000 | 67000 | tak |
| Konsola | Bühl 89 | 92500 | 89000 | 111000 | tak |
| Konsola | Pajor 89 | 106000 | 96000 | 113000 | nie |
| PC | Mariona 89 | 23500 | 22000 | 28750 | tak |
| PC | Kvaratskhelia 89 | 33750 | 32000 | 42250 | tak |

Jednostka cen: monety. Wszystkie 6 cen końcowych pochodzi z Unix 1794088596 s, czyli 28 s po nominalnym horyzoncie. Zmiana ceny = 100*(p2/p0-1). Mediana z parzystej próby = średnia dwóch środkowych wartości.

Warunkowa stopa po podatku w result.json = 100*(0.95*p2-p0)/p0, zgodnie z istniejącym założeniem kodu. Dla inwestycji w limicie kupna jej mediana wynosi -8,59% (konsola, n=3) i -10,49% (PC, n=2). Zakłada hipotetyczny zakup po p0 i sprzedaż po p2; nie modeluje wykonania, wolumenu, zaokrąglenia podatku w grze ani rzeczywistej transakcji. Nie nazywać tego zrealizowaną stratą.

Szybkie sygnały: João Neves 88/konsola 11250→12500 (+11,11%, punkt +28 s od horyzontu), Diogo Costa 86/PC 4000→5000 (+25%, punkt +739 s). Foden 84, Cata Coll 85 i Katoto 86/konsola nie mają ceny w oknie mimo poprawnych migawek swoich pasm. Nie imputujemy wyniku. Gdyby binarną miarą był dodatni hipotetyczny wynik po podatku, konsolowy zakres przy dowolnym przypisaniu trzech braków wynosiłby 1/4–4/4; to granice scenariuszy, nie przedział ufności i nie dowód skuteczności.

## Interpretacja, alternatywy i granice

W porównaniu z 15B pojawił się nowy dowód: zgodne technicznie sygnały w tej konkretnej chwili nie poprzedziły odbicia inwestycji w punkcie 2h. To nie oznacza, że cel nie wystąpił wcześniej/później. Horyzont 2h pochodzi z badań prognoz, nie stanowi obietnicy czasu realizacji inwestycji w aplikacji.

Trzy zgodne z danymi wyjaśnienia pozostają otwarte: dalszy spadek rynku/ratingu; historyczny poziom dobowy reagujący z opóźnieniem; rzeczywista przecena wymagająca dłuższego horyzontu. Jedna kohorta nie rozstrzyga między nimi. Pozostałe karty nie stanowią losowej grupy kontrolnej: mają inne ratingi i cechy; mediana całego koszyka jest tylko opisowym punktem odniesienia. Dwie platformy i wspólne profile nie dają sześciu niezależnych eksperymentów. Nie kalibrować EMA, progu przeceny ani trwałości na tej próbie.

Wszystkie brakujące endpointy mają metadane poprawnego odczytu pasma; oznacza to nieobecność w wycinku, nie zniknięcie z całego rynku ani sprzedaż. Wynik szybkich sygnałów jest silnie zależny od ponownej obserwowalności.

Decyzja: zachować algorytm. Najbliższy izolowany krok to porównanie ceny z sygnału z uprzednim trendem tej samej karty i ratingu na wspólnych dostępnych obserwacjach, z jawnie raportowanymi brakami, oraz analiza dojścia do celu w z góry określonym dłuższym oknie. Rozróżnić opóźnioną bazę i spadek całego rynku, zanim zaproponujemy filtr. Nie uruchamiać kolektora ani GC.

## Testy i skutki uboczne

Node 24.22.1: ponowny audyt 15B PASS; followup.mjs PASS (tożsamość, chronologia, legalne ceny, dowód pasma, hash wejścia, test remisu i brzegów tolerancji); istniejące tcenzurowanie.mjs i tjakosc-historii.mjs PASS. Kontrola diff: zmiany wyłącznie w research/stage15c. Skrypt czyta już zapisane pliki, nie importuje scrapera i nie wykonuje żądań sieciowych; brak R2, DELETE, harmonogramów i zmian danych produkcyjnych.

Uruchomienie na tej gałęzi: `node research/stage15c/followup.mjs`. result.json zawiera podsumowania i inwestycje; rows.csv zawiera wszystkie 154 wiersze, statusy i przesunięcia czasowe, bez selekcji tylko inwestycji.

## Źródła i adaptacja

1. [Hyndman i Athanasopoulos, Forecasting: Principles and Practice, rozdział 5](https://otexts.com/fpp3/toolbox.html) — określony horyzont, benchmarki oraz oddzielenie testu od strojenia. Adaptacja: zachowane wcześniejsze 2h±15min; tutaj brak niezależnej walidacji rolling-origin.
2. [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — czas zdarzenia i obserwacji jako różne informacje. Adaptacja: zachowujemy t sygnału, czas endpointu i odchylenie od horyzontu zamiast udawać dokładnie 2h.

Źródła sprawdzone 08.11.2026; nie dostarczają cen kart ani dowodu transakcji. Kontynuujemy wcześniejsze wnioski z AUDYT_NIEOBECNOSCI_KART.md i AUDYT_POROWNANIE_PROGNOZ_2H_20261106.md, bez korekty braków modelem niezweryfikowanej obserwowalności.
