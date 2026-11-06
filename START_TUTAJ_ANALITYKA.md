# AppEA / Patiru — START TUTAJ: protokół współpracy i stan badań

> **Cel tego pliku:** trwały punkt wznowienia pracy, niezależny od historii konwersacji. Jeśli nowy czat utraci kontekst, najpierw przeczytaj ten plik, potem [rejestr badań](REJESTR_ZRODEL_BADAWCZYCH.md), a dopiero później kod/ostatnie PR. Dokument aktualizujemy po każdym **istotnym** etapie; nie udajemy, że stan sprzed kilku dni jest aktualnym stanem produkcji.

## 1. Po co rozwijamy projekt

AppEA to autorski system analityki rynku kart EA FC. Priorytetem jest **wiarygodność i realna użyteczność decyzji**, nie maksymalna liczba funkcji lub skomplikowanie modelu. Ceny widoczne na stronach to **obserwowane oferty / wskazania źródła**, a nie dowody wykonanych transakcji ani gwarancje, że użytkownik kupi/sprzeda za tę cenę. Rynki konsolowy i PC analizujemy osobno.

## 2. Jak współpracujemy (obowiązujący protokół)

1. **Wznawianie i kontrola:** przed nowym zagadnieniem przeczytaj ten plik, rejestr, odpowiednie źródła i aktualny stan repo. Krótko potwierdź, co już skończone, co jest hipotezą i co pozostało. Nie zadawaj powtórnie pytań, na które odpowiedź jest w repo.
2. **Jedno wąskie pytanie naraz:** określ problem, dane wejściowe, 2–3 warianty, najprostszy benchmark, metrykę sukcesu i kryterium przerwania eksperymentu. Rozdziel diagnozę, hipotezę, test, wniosek i decyzję.
3. **Literatura przy każdym większym problemie:** znajdź 1–3 konkretne, wysokiej jakości źródła (statystyka, szeregi czasowe, rynki finansowe, inżynieria danych, gry itp.). Zapisz ich rzeczywiste twierdzenia, ograniczenia, powód adaptacji do rynku EA i zgodność/sprzeczność z wcześniejszymi wynikami. Nie dodawaj źródeł tylko dla dekoracji.
4. **Matematyczna audytowalność:** każda formuła, liczba, jednostka, próg, horyzont, waga i warunek powinny mieć uzasadnienie. Parametry 3×MAD, 12 godzin, limity próbek itp. pozostają **hipotezami do kalibracji**, nie „optymalnymi” parametrami EA.
5. **Testowanie bez podglądania przyszłości:** używaj danych do momentu t do wyliczenia prognozy, późniejsze odczyty tylko do jej oceny (rolling-origin). Oddzielaj trening/kalibrację od ostatecznej oceny. Porównuj z naiwną prognozą ostatniej wartości oraz z bieżącym algorytmem. Osobno raportuj PC i konsole, liczby próbek i przedziały/luki danych.
6. **Nie myl obserwacji ze zdarzeniem:** karta poza ograniczoną listą to „niewidoczna w odczytanym wycinku”, NIE „sprzedana” i NIE „droższa”. Brak przyszłej ceny nie jest ani sukcesem, ani porażką; wykazuj osobno wyniki obserwowane, oczekujące i nierozstrzygnięte. Pokazuj możliwy bias selekcji.
7. **Minimalny koszt testu:** najpierw istniejące migawki i kod, potem krótka próba read-only, ewentualnie izolowany workflow GitHub Actions z limitem czasu. Bez wielogodzinnego monitoringu bez wyraźnego uzasadnienia. Bez masowego indywidualnego odpytywania i bez niepotrzebnego obciążenia źródeł.
8. **Bezpieczeństwo produkcji:** nie zmieniaj stabilnego scrapera, cronów, `data.json`, archiwum produkcyjnego, EMA, indeksu, snajperki ani rekomendacji na podstawie samej hipotezy. Kod badawczy na osobnej gałęzi/PR; przejście na `main` dopiero po testach, kontroli wpływu i uzasadnionej decyzji. Dokumentacja nie jest zmianą algorytmu.
9. **Jakość i regresje:** gdy występują błędy, szukaj przyczyn i uwzględniaj skutki uboczne. Grupuj spójne poprawki, uruchamiaj istniejące testy i minimalny test integracyjny. Nie usprawiedliwiaj wadliwych danych „jakoś działa”.
10. **Koniec etapu:** podaj: cel → źródła → dane i ich ograniczenia → wynik liczbowy → porównanie z poprzednią metodą → decyzję (pomysł / izolowany test / zweryfikowane / wdrożone / odrzucone) → linki do uruchomienia lub PR → następny najlepszy test. Zaktualizuj [rejestr źródeł i hipotez](REJESTR_ZRODEL_BADAWCZYCH.md) i sekcję stanu poniżej.

## 3. Aktualne ustalenia badawcze (stan z 2026-11-06)

- **EMA v3:** historyczny punkt odniesienia, nie potwierdzona cena transakcyjna. W jednym wcześniejszym backteście pasm ostatnia cena była lepszą prognozą *następnego odczytu* niż EMA/mediana; nie oznacza to, że powinna zastąpić poziom historyczny używany do analizy odbić. Por. [audyt ceny historycznej](AUDYT_CENA_HISTORYCZNA.md).
- **Historia kart v2:** `historia-kart.json` zapisuje rzeczywiste ceny i ograniczone migawki poprawnie odczytanych ratingów; nie odtwarza fikcyjnych migawek sprzed migracji. Audyt obserwowalności jest pomocniczy (shadow), nie modyfikuje rekomendacji. Por. [audyt nieobecności](AUDYT_NIEOBECNOSCI_KART.md).
- **Rotacja listy 06.11:** dwie rzeczywiste migawki 06:38:32 i 06:50:40 UTC: konsola 31/125 (24,8%), PC 40/122 (32,79%) kart poza kolejnym wycinkiem. **Tylko jedna para** — nie ekstrapolować na rynek i nie interpretować jako transakcji. Największa rotacja dotyczyła remisów przy medianie.
- **Indywidualne profile FUT.GG odrzucone jako źródło dodatkowej ceny:** w izolowanym teście [Actions #42177575612](https://github.com/patrykrekin/AppEA/actions/runs/42177575612) poprawnie zidentyfikowano 8/8 kart (wersja, identyfikatory i platformy), ale 0/8 dostarczyło ceny, również kontrole. [PR #6](https://github.com/patrykrekin/AppEA/pull/6) zamknięty **bez merge**.
- **Dla istniejących mechanizmów:** nie wprowadzono zmian produkcyjnych na podstawie powyższych wyników; aktualną kondycję systemu trzeba każdorazowo sprawdzić na nowo.

## 4. Otwarty kierunek: głębsze listy kart (na 06.11.2026)

**Problem:** strona `https://www.fut.gg/cheapest-by-rating/` pokazuje tylko **11 kart na rating i platformę**, więc pojedyncze historie znikają z obserwacji przez rotację rankingu.

**Nowy trop do sprawdzenia, nie wynik:** link „View All” z ratingu 86 prowadzi do
`https://www.fut.gg/players/?market_players=true&overall__gte=86&overall__lte=86&sorts=current_price`;
przy nazwie `page=2` dostępna jest paginacja. Nie ustalono jeszcze, czy dynamiczna lista udostępnia poprawne, aktualne **ceny** i **item ID** dla obu platform; wyniki z renderowania tekstowego nie zawierały kart. To jest krytyczny warunek. Wersja karty i platforma muszą być jednoznaczne.

**Minimalny test:** tylko rating 86, konsola i PC; próbka strony 1 i ewentualnie 2. Zapisz liczbę widocznych kart, liczbę z wiarygodną ceną, identyfikatory/wersje, poprawność sortowania, porównanie przecięcia z listą TOP 11, czas odpowiedzi i koszt dodatkowych odczytów. Najpierw jedno odizolowane uruchomienie; nie zmieniaj `scrape.mjs` ani `refresh.yml`. Jeśli ceny są nieobecne lub nieweryfikowalne, przerwij i nie rozwijaj dalej ścieżki. Nie opieraj rekomendacji na niedostępnych cenach.

**Decyzja oczekująca:** dopiero po faktycznym wyniku ocenić, czy głębszy odczyt zwiększa ciągłość obserwacji i czy koszt jest akceptowalny. W przeciwnym razie raportować metryki warunkowe na widocznych kartach i poszukiwać niezależnego źródła.

## 5. Jak wznowić pracę po utracie konwersacji

W nowym czacie podaj link do tego dokumentu i napisz: „Kontynuujemy AppEA według START_TUTAJ_ANALITYKA.md; przeczytaj też REJESTR_ZRODEL_BADAWCZYCH.md, sprawdź obecny main, ostatnie Actions i PR, a potem podejmij najbliższy otwarty eksperyment. Nie modyfikuj produkcji bez testów”.

**Uwaga:** ten plik jest migawką *metodologii i decyzji*. Bieżące ceny, stan Actions, liczba migawek i zmiany w kodzie są zmienne; za każdym wznowieniem trzeba je zweryfikować.
