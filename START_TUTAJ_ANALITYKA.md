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

## 4. Zagadnienie 4 — głębsze listy FUT.GG (06.11, zakończone bez wdrożenia)

Z rankingu `/cheapest-by-rating/` link **View All** prowadzi do filtrowanego `/players/?market_players=true&overall__gte=86&overall__lte=86&sorts=current_price`, z paginacją `page=2`. Sprawdzono rating 86, dwie strony, osobno konsola i PC, systemowy Chrome/Playwright. [PR #7](https://github.com/patrykrekin/AppEA/pull/7), [próba diagnostyczna](https://github.com/patrykrekin/AppEA/actions/runs/42297258742).

**Wynik:** HTTP 200 i cookie `futgg_platform` były poprawne na każdej z 4 stron, lecz w renderowanym DOM były filtry i paginacja, **0 linków do kart** i **0 potwierdzonych cen** na obu rynkach. Nie wiadomo, czy chodzi o brak ładowania wyników w tej sesji, czy inny mechanizm prezentacji; nie udowodniono, że na stronie jest 0 ofert. Brak użytecznego źródła cen dla naszego scrapera: nie wdrażać i nie kontynuować masowego pobierania. Kod testu w osobnym PR, **nie przeznaczony do scalenia**. Produkcyjne `scrape.mjs`, `refresh.yml`, EMA i rekomendacje bez zmian.

## 5. Zagadnienie 5 — archiwum v2 po 14,8 h (06.11, pomiar wstępny)

Próba offline z rzeczywistego `historia-kart.json`, stan archiwum `2026-11-06T21:28:26Z`. **81 migawek/rynek**, 80 sąsiednich par z odstępem <20 minut/rynek. 351 unikalnych kart PS i 448 PC w retencji; 10 970 i 10 767 punktów cenowych. W kolejnych wycinkach wypadło **3 147/10 061 = 31,28%** obserwacji PS i **3 771/9 880 = 38,17%** PC. Duża rotacja w remisach cenowych przy medianie: PS 45,48%, PC 51,69%. Są to przejścia powtarzane, współzależne, NIE niezależne transakcje i NIE prawdopodobieństwa sprzedaży.

**Warunek dojrzałości w konkretnym momencie:** 36 historycznych punktów, >=8 h pokrycia w oknie 12 h, bez luk >20 min i ze świeżym ostatnim odczytem. Spełniają go **34 karty PS** i **27 kart PC**. W PS tylko ratingi 88/89/90/92/93; PC tylko 89/90/92/93. **Zero kart 83–87** — istotny problem uogólnienia wyników na tańsze ratingi.

**Eksploracyjny walk-forward 2h** (obecna definicja algorytmu, wynik *wyłącznie* w później obserwowanych, wysoko ocenionych kartach; powtarzalna migawka danych: [commit b745843](https://github.com/patrykrekin/AppEA/commit/b745843bba39ea29d06ec397dbf20638e0f4ba01)):
- PS: 230 początków, 67 oczekujących, 163 obserwowane, 0 braków po rozliczeniu; 35 różnych kart. MAPE ostatnia 3,383%, mediana 3,725%, EMA 4,056%, hybryda 3,837%.
- PC: 201 początków, 55 oczekujących, 146 obserwowanych, 0 braków po rozliczeniu; 30 różnych kart. MAPE ostatnia 4,168%, mediana 4,184%, EMA 4,668%, hybryda 4,405%.
- **Horyzont 12h:** wszystkie 230 (PS) i 201 (PC) początków oczekują; 0 zaobserwowanych wyników. Przy min. 8h wcześniejszej historii 14,8h całkowitej obserwacji nie wystarcza na pierwsze w pełni dojrzałe 12h.
- Uwaga o uczciwym porównaniu: w istniejącym `sprawdzMetody()` benchmark ostatniej ceny dostaje świeże `p(t)`, podczas gdy EMA i mediana liczą tylko punkty **sprzed t**. Jest to nierówny informacyjnie wariant; kolejne porównania powinny aktualizować też EMA/medianę o `p(t)` (albo porównywać wszystkie metody na danych do `t-1`). Próbny wariant `t`-inclusive daje PS EMA 4,032%, mediana 3,707%; PC EMA 4,641%, mediana 4,144%. To wciąż mała i selektywna próba, **nie powód do wdrożenia**.
- Zmienne archiwum i historia ulegają dalszym zmianom, liczby są wyłącznie migawką na podany czas. Późniejsze raporty muszą odczytać nowe dane; nie dopisywać cen ani wyników brakujących.

**Kontrola wrażliwości na ważenie po kartach (2h, uaktualniona mediana/EMA o p(t)):** w PS 35 kart: makro-MAPE ostatnia **3,515%**, mediana **3,628%**, EMA **4,099%**; w PC 30 kart: ostatnia **4,082%**, mediana **4,055%**, EMA **4,562%**. Różnica mediana minus ostatnia po uśrednieniu po kartach: PS **+0,114 p.p.**, PC **−0,027 p.p.**. Eksploracyjny bootstrap grupowany po kartach (4000 resampli, stały seed) dał bardzo szeroki zakres 95% dla różnicy: PS **−0,506 do +0,745 p.p.**, PC **−1,236 do +1,199 p.p.**. Zakłada niezależność kart i ignoruje wspólne szoki rynku, więc to **nie jest dowód równoważności ani istotności**; wskazuje tylko, że na tej próbce nie ma stabilnej podstawy do wyboru modelu.

**Następny najlepszy krok:** bez zmian produkcyjnych, przygotować porównanie metodyk prognostycznych na *tym samym zbiorze informacji do t*, z rozliczeniem wyników dla każdej karty, klastrów i ratingów osobno. Nie optymalizować progów, dopóki 83–87 nie będą dostatecznie obserwowalne. Później wrócić do problemu zewnętrznego źródła wycen, tylko jeśli będzie faktycznie dostępne i wiarygodne.

## 6. Zagadnienie 6 — porównanie prognoz na równych danych (06.11, zakończone, bez wdrożenia)

[Pełny audyt z tabelami, zamrożonym commit SHA i źródłami](AUDYT_POROWNANIE_PROGNOZ_2H_20261106.md). Wyrównano do chwili t dane wejściowe do ostatniej ceny, mediany 12h, EMA shadow i hybrydy, osobno PS i PC. Przy pochodzeniach co 1h: 163 wyników PS (35 kart), 146 PC (30 kart). Mediana PC była lepsza od ostatniej ceny jedynie o **0,024 p.p.** w micro, ale przy pochodzeniach co 2h ostatnia cena miała niższy błąd (**3,675% vs 4,520%**). To próba wrażliwa na nakładanie okien, brak reprezentacji kart 83–87 i nadal 0 rozliczeń prognoz 12h.

**NOWE krytyczne ustalenie:** EMA badawcza (resetowana do pierwszej ceny w oknie) nie odtwarza produkcyjnego `aktualizujPoziomyD`, gdzie występuje zasiew z szybkiej EMA i reset po >2h. Zatem testy MAPE nie walidują algorytmu inwestycyjnego. Nie zmieniać EMA ani rekomendacji na podstawie samej predykcji przyszłych ofert. Prawidłowy następny krok: projekt niewpływającej na rekomendacje **instrumentacji stanu przed sygnałem** (t, ID, platforma, cena, EMA szybka/dobowa, wersja definicji i pokrycie), wyłącznie z już pobranych danych; ocena ryzyka i regresji zanim cokolwiek trafi na main.

## 7. Zagadnienie 7 — schemat pasywnego rejestrowania rzeczywistych decyzji (07.11)

**Audyt:** [AUDYT_SHADOW_DECYZJI_20261107.md](AUDYT_SHADOW_DECYZJI_20261107.md). Na [niescalonej gałęzi badawczej](https://github.com/patrykrekin/AppEA/tree/research/shadow-predecision-20261107) istnieje czysta funkcja zapisu kontekstu pre-decision i testy; [Actions #42407791946](https://github.com/patrykrekin/AppEA/actions/runs/42407791946): **13/13 PASS offline**, zero dodatkowych FUT.GG. Nie ma integracji z produkcją, nie zebrano jeszcze realnych migawek decyzji.

**Istotne:** produkcja porównuje obecne p(t) z EMA **sprzed aktualizacji**, ale trwałość jest wyliczona już **po** p(t); końcowe inwestycje mają limit TOP12. ID profilu FUT.GG nie gwarantuje tożsamości wersji karty; wymagany kontekst platforma+OVR+ID+nazwa, nadal możliwa niejednoznaczność edycji. Nie twórz fałszywych dowodów transakcji z braków w wycinku rankingu.

**Koszt:** próbka dla 249 widocznych kart z syntetycznymi stanami EMA: 22 217 B; ekstrapolacja 48h co 10min = 6,10 MiB; co godzinę = 1,02 MiB, bez rewizji Git. Istniejące archiwum v2 przekroczyło 1 MB. **Nie dodawać pełnego archiwum do main.** Najbardziej obiecująca architektura do sprawdzenia: pełne zdarzenia rekomendacji + rzadsze kompletne przekroje grupy kontrolnej, w osobnym, ograniczonym czasowo magazynie/artefaktach.

**Kolejny etap 8:** jedna izolowana próba integracyjna funkcji na rzeczywistych `preFast/preSlow/trwaloscPo` i aktualnym wyniku istniejących rekomendacji, bez zmiany harmonogramu i dodatkowych indywidualnych requestów. Sprawdź zgodność z produkcją, rozmiar, czas, ID i niezmienność wyników przed jakimkolwiek wdrożeniem.

## 8. Zagadnienie 8 — zgodność sondy z realnym przebiegiem (07.11 — PASS w izolacji)

**Pełny audyt:** [AUDYT_SHADOW_INTEGRACJA_20261107.md](AUDYT_SHADOW_INTEGRACJA_20261107.md). Dowód [Actions #42408574206](https://github.com/patrykrekin/AppEA/actions/runs/42408574206), izolowany checkout `d27061cdb6d662fad2ff153ac63f19739532dfd1` i spójny zestaw danych głównych z SHA `be0bc1c19b16670e7491b4f22ee4bfd8e1e6d5d2`. Jeden rzeczywisty `fast` na kopii `RUNNER_TEMP`, bez publikacji i bez dodatkowych żądań per-card. Odczyt 07.11.2026 o 19:56:08 UTC. Próba końcowa: **77 kart PS + 77 PC** (cała populacja produkcyjnego koszyka 83–89); **4/4 i 2/2** inwestycji 1:1 zgodnych z izolowaną produkcyjną strukturą `data.json` (platforma, klucz+ID, cena, poziom pre-update, cel, limit kupna). **4/1** szybkich okazji; poziom dobowy pre-update 77/77; różnica pre/post w 66 PS i 67 PC. Sonda nie mutowała wejścia, czas obliczeń **1,596 ms**, migawka **17 890 B**. Testy jednostkowe **13 PASS**, prawdziwe odświeżenie i walidator PASS.

**Ważna korekta:** wcześniejszy [test #42408446461](https://github.com/patrykrekin/AppEA/actions/runs/42408446461) zatrzymał się na ratingu 91 poza zakresem `KOSZYK`. Sonda została zawężona do **całej** faktycznej populacji strategii 83–89; nie odrzucamy żadnych kart z tych ratingów. To nie dowód awarii produkcji, która ich innych ratingów nie przetwarza. ID z profilu FUT.GG nie gwarantuje unikalnej edycji karty.

**Korekta bezpieczeństwa:** końcowy audyt odkrył przejściowe pojawienie się kodu sondy i sześciu plików badawczych w `main`, pomimo zamierzonej izolacji. **Przywrócono** stabilny `scraper/scrape.mjs` (blob `88912b6f7b8cdc679d1a94ba62510e465d7adac6`; commit rollback `67241e08a761e4bb3f5c69d20225aa472fa47187`) oraz usunięto z `main` sześć plików shadow. Przy odtwarzaniu sprawdzić, że `main` nadal nie zawiera hooka; po każdej zmianie na gałęzi research bezwzględnie porównać hash kodu `main`. Szczegóły w [raporcie etapu 8](AUDYT_SHADOW_INTEGRACJA_20261107.md). 

**Decyzja:** integracja potwierdzona tylko w jednym realnym odczycie. **Brak merge kodu badawczego, brak cyklicznej instrumentacji, brak zmian rekomendacji i EMA na main.** Koszt surowego JSON przy zachowaniu stałej próbki: 48h co 10 minut ~4,91 MiB; co 1h ~0,82 MiB, bez historii Git. **Kolejny etap 9:** test hybrydowej retencji: każdy sygnał + rzadsza pełna grupa kontrolna, porównać z kompletnymi migawkami pod względem obserwowalności i kosztu, przed jakimkolwiek wdrożeniem.

## 9. Jak wznowić pracę po utracie konwersacji

W nowym czacie podaj link do tego dokumentu i napisz: „Kontynuujemy AppEA według START_TUTAJ_ANALITYKA.md; przeczytaj też REJESTR_ZRODEL_BADAWCZYCH.md, sprawdź obecny main, ostatnie Actions i PR, a potem podejmij najbliższy otwarty eksperyment. Nie modyfikuj produkcji bez testów”.

**Uwaga:** ten plik jest migawką *metodologii i decyzji*. Bieżące ceny, stan Actions, liczba migawek i zmiany w kodzie są zmienne; za każdym wznowieniem trzeba je zweryfikować.
