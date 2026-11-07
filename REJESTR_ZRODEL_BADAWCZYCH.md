# Rejestr źródeł i hipotez AppEA — log kumulacyjny

> **Punkt wznowienia po utracie rozmowy:** [START_TUTAJ_ANALITYKA.md](START_TUTAJ_ANALITYKA.md) — obowiązujący protokół pracy, zasady bezpieczeństwa i aktualny etap. Przed nowym eksperymentem przeczytaj oba dokumenty.

## Zasada weryfikacji (od 2026-11-06)
Przy KAŻDYM nowym zagadnieniu dobieramy 1–3 konkretne źródła. Notujemy:
- wniosek z publikacji; jaką nową cechę metody uzasadnia;
- czy odnosi się do rynku ofert w grze (a nie bezpośrednio do rzeczywistych transakcji);
- hipotezę do porównania z aktualnym algorytmem, wynik testu out-of-sample;
- stan: *pomysł* / *zaimplementowane w izolacji* / *przetestowane na danych* / *wdrożone do rekomendacji* / *odrzucone*.

**Zabronione:** przepisywanie progów z rynków tradycyjnych jako „zoptymalizowanych dla EA” bez własnego backtestu. W szczególności 3×MAD i 12h pozostają hipotezami.

## Zagadnienie 0 — punkt bazowy (2026-11-05)
**Źródło:** własny kod i pomiary `historia.json` (opis: `AUDYT_CENA_HISTORYCZNA.md`).
- Zależna od czasu EMA v3 usuwa zmianę horyzontu pamięci przy zmianie odczytów z 5min na 1min; nie zaokrąglamy co krok.
- Na PASMACH (nie indywidualnych kartach) test następnego pomiaru: ostatnia cena 2,861% MAPE, mediana 12h 4,261%, hybryda 4,468%, EMA~11,5h 5,061%; test 2142 porównań.
- **Porównanie:** ostatnia cena lepsza dla prognozy kolejnego punktu. To NIE jest odpowiedź, jaki poziom jest dobrą bazą historyczną do odbicia. Nie zmieniamy ceny docelowej z tego powodu.
- **Problem źródła:** tylko najtańsze oferty są stale widoczne, karty przestają być obserwowane po wypadnięciu z listy. Stan: *dane wstępne*, bez decyzji inwestycyjnej.

## Zagadnienie 1 — jakość historii konkretnej karty (2026-11-06)

### Źródło A: Hyndman, Athanasopoulos — Forecasting: Principles and Practice, wyd. 3, sekcje 5.8 i 5.10
https://otexts.com/fpp3/toolbox.html

**Wniosek:** modele prognoz ocenia się z zachowaniem osi czasu: dane do chwili `t` do wyznaczenia wyniku, późniejsze notowanie do pomiaru błędu. Zawsze porównujemy ze zwykłym benchmarkiem *ostatniej obserwacji*; zwykły losowy split grozi podglądaniem przyszłości w szeregu.
**Przeniesienie:** nowe `sprawdzMetody()` oblicza EMA / medianę / hybrydę i benchmark wyłącznie z historii przed `t` oraz ocenia oddzielnie horyzont 2h i 12h.
**Granica:** wobec niepełnego feedu ofert wynik błędu jest WARUNKOWY na ponownej widoczności karty. Brak w przyszłym oknie to osobny kubełek „brak kolejnego notowania”, a nie porażka.
**Status:** zaimplementowane w analizatorze *shadow*; nie wpływa na publikowane cele.

### Źródło B: NIST/SEMATECH e-Handbook of Statistical Methods — Median absolute deviation
https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/mad.htm

**Wniosek:** mediana bezwzględnych odchyleń od mediany (MAD) jest odporną miarą skali; wobec normalnych danych `1,4826*MAD` przybliża odchylenie standardowe. Nie jest to automatyczny dowód błędnego rekordu.
**Przeniesienie:** `odstajacyOstatni()` bierze *poprzednie* 5–7 poprawnych punktów, liczy medianę i MAD; sygnalizuje kandydat, gdy różnica przekracza `max(3*1,4826*MAD, 2*krokSiatki)`. Bez look-ahead, bez nadpisywania ceny.
**Konflikt z rynkiem EA:** w grze pojedyncza bardzo tania oferta może być właśnie autentyczną okazją. Dlatego nie kasujemy jej automatycznie (odmiennie od klasycznych procedur czyszczenia danych), tylko oznaczamy do analizy.
**Status:** izolowana diagnostyka; progi 3 i 2 kroki są parametrami wymagającymi kalibracji.

## Porównanie poprzednich i nowych wniosków
| Twierdzenie | Poprzednie ustalenie | Nowy dowód / modyfikacja | Wniosek |
|---|---|---|---|
| EMA wyznacza rzeczywistą cenę sprzedaży | Nie: EMA jest historycznym punktem odniesienia | rolling-origin wymusza mierzenie późniejszego wyniku | Cel pozostaje warunkowy |
| Pojedynczy skok jest niepoprawnym pomiarem | Nie wiemy, czy to błąd czy okazja | MAD wykrywa odstające statystycznie, ale nie rozstrzyga przyczyny | Flaguj, nigdy nie usuwaj automatycznie |
| Mediana musi wygrać z EMA | Na pasmach mediana miała mniejszy błąd niż EMA, ale większy niż ostatnia cena | brak kompletnej indywidualnej historii kart | Nie wybierać zwycięzcy przed testem out-of-sample |
| Brak karty po sygnale = strata / zysk | Błędna interpretacja | rozdzielenie „oczekuje”, „brak obserwacji” i „zaobserwowano” | Brak wyniku nie zmienia statystyki sukcesu |
| Więcej pomiarów zawsze oznacza większą wiarygodność | Nie | kontrola luk, rzeczywistego czasu i pokrycia | Wymagane metadane jakości i odrębna statystyka selekcji |

## Najbliższe porównanie na nowych próbkach
1. Monitoruj odsetek kart o >=36 punktach, >=8h historii, bez luk >20min. Jeśli niski, nie osłabiaj progów tylko po to, by uzyskać wyniki: porównaj źródła i projekt zapisu.
2. Gdy pojawią się dojrzałe historie, raportuj 2h/12h: liczba początków, liczba wyników zaobserwowanych i brakujących, błędy *ostatnia / EMA / mediana / hybryda* osobno dla platform.
3. Prowadź trening na wcześniejszym okresie i weryfikację na późniejszym. Nie dobieraj wag na tym samym zbiorze, który służy do raportowania zysku.
4. **Następne potencjalne źródło** wybierzemy dopiero przy zagadnieniu cenzurowania i braku danych — nie rozszerzamy obecnego etapu na cały internet.

## Status po etapie 1
Dotychczasowe produkcyjne obliczenia cen i rekomendacje bez zmian. Nowe funkcje jako odczytowe badanie offline, gotowość dopiero po rzeczywistej, potwierdzonej sekwencji próbek.


## Zagadnienie 2 — zniknięcie karty z limitowanej listy (2026-11-06)

### Źródło C: Little & Rubin, Statistical Analysis with Missing Data, wyd. 3, rozdz. 3 (2019)
https://onlinelibrary.wiley.com/doi/10.1002/9781119482260.ch3

**Wniosek ze źródła:** badanie wyłącznie kompletnych przypadków może obciążać wynik, gdy prawdopodobieństwo dostępności danych zależy od badanego procesu; ważenie przypadków wymaga dodatkowych założeń i oszacowania prawdopodobieństwa bycia zaobserwowanym.
**Hipoteza dla EA:** karta droższa względem innych w tym samym pasmie częściej wypada z ograniczonej listy; próba składająca się tylko z kart widocznych po 12 godzinach zafałszuje szacowaną skuteczność strategii.
**Test:** `audytNieobecnosci` liczy odsetek zniknięć z listy osobno dla kart tańszych od mediany pasma, droższych od mediany i przy remisach. To WYŁĄCZNIE porównanie opisowe, bez przypisywania przyczynowości. Przed nowymi migawkami brak dowodu nieobecności.
**Status:** weryfikacja w eksperymencie; nie wdrożono ważenia IPCW ani predykcji transakcji.

### Źródło D: Columbia University Mailman School of Public Health — Time-to-Event Data Analysis
https://www.publichealth.columbia.edu/research/population-health-methods/time-event-data-analysis

**Wniosek ze źródła:** standardowe metody analizy czasu do zdarzenia wymagają założeń o nieinformacyjnym cenzurowaniu. Przy podejrzeniu cenzurowania informacyjnego należy badać wrażliwość wyników na scenariusze najlepszego i najgorszego przypadku.
**Hipoteza dla EA:** brak przyszłego odczytu może być związany z ceną, zniknięciem wystawienia albo zmianą rankingu, nie z faktem sprzedaży. Standardowe Kaplan–Meier i niezweryfikowane IPCW nie naprawią tego automatycznie.
**Test:** jawna migawka poprawnie odczytanego fragmentu pasma; statusy `widoczna-w-liscie`, `poza-odczytana-lista`, `nieocenialne-brak-migawki-pasma`. Pomocniczy wzór:
- `N = S + F + U` (S=tak, F=nie, U=brak rozstrzygnięcia dla **zadanego binarnego zdarzenia w punkcie h**).
- `p_obserwowanych = S/(S+F)` — tylko warunkowy na widoczności.
- `p_min=S/N`, `p_max=(S+U)/N` — zakres skrajnych scenariuszy, nie przedział ufności ani prawdopodobieństwo sprzedaży w grze.

### Porównanie ze wcześniejszymi ustaleniami
| Temat | Etap 0/1 | Dodatkowe ustalenie | Decyzja |
|---|---|---|---|
| Brak późniejszego notowania | Oznaczony jako nierozstrzygnięty | Rozdzielamy brak całej migawki, brak poprawnego pasma i nieobecność konkretnej karty w poprawnie pobranym wycinku | Wersja archiwum 2; bez imputacji |
| Wygrana w backteście | Wymagany późniejszy, rzeczywiście zaobserwowany punkt | Wybór obserwowanych przypadków może zależeć od ceny; nie wolno przełożyć warunkowej skuteczności na ogół kart | Raportuj brakujące wyniki i granice skrajne |
| Wiarygodność hipotezy o selekcji | Znana konstrukcja źródła (limit listy) | Trzeba sprawdzić, czy brak zależy od względnej ceny w tym samym pasmie i na tej samej platformie | Porównanie grup po dłuższej historii, bez wniosków przy n<20/grupę |
| „Karta zniknęła, więc sprzedana” | Brak dowodu | Zniknięcie nie rozróżnia wyprzedania oferty, zmiany ceny, limitu listy ani błędu parsera | Nigdy nie zapisuj jako sprzedaży |

**Uwaga o migracji:** przejście `historia-kart.json` v1→v2 zachowuje wszystkie surowe ceny i nie odtwarza fikcyjnych migawek z przeszłości. Z v1 można obliczać ceny, ale NIE można stwierdzić, czy karta była nieobecna w niezapisanym wcześniej odczycie.

**Kolejny warunek testu:** co najmniej kilkadziesiąt kolejnych poprawnych migawek na platformę i dostateczne liczebności w grupach cenowych. Brak danych nie zostaje sztucznie zamieniony na liczbę 0 lub cel transakcji. Część testów może pozostać niedostępna, jeśli lista jest zbyt selektywna.


## Zagadnienie 3 — szybka próba niezależnej wyceny po wypadnięciu z listy (2026-11-06)

**Źródło operacyjne:** indywidualne profile FC27 na FUT.GG, zweryfikowane przez oddzielne GitHub Actions (systemowy Chrome/Playwright), bez zmiany produkcyjnego scrapera. Raport: https://github.com/patrykrekin/AppEA/pull/6 ; log i artefakt: https://github.com/patrykrekin/AppEA/actions/runs/42177575612 . Porównanie dodatkowe: https://github.com/patrykrekin/AppEA/pull/5 .

### Wynik bez oczekiwania 8–12 h
- Dwie poprawne migawki v2: 06:38:32 i 06:50:40 UTC. Z 125 konsolowych kart 31 (24,80%) nie wystąpiło w następnej migawce; z 122 PC — 40 (32,79%). To *rotacja odczytanego wycinka* w jednej parze, nie rynek transakcji.
- Użyto 6 **konkretnych kart znikających w v2** (Konaté, Isak, Lavelle PS; Bruno Guimarães, Musiala, Kimmich PC) oraz 2 kontrole widoczne nadal (Schick PS, David Raya PC).
- Profil indywidualny: zweryfikowano platformę, player ID/item ID, OVR i wersję FC27 w **8/8** przypadków. Wszystkie 8 pokazały `Price: —`. **0/8 niezależnych liczbowych wycen**, również w grupie kontrolnej.
- Wniosek: nie wdrażać dodatkowych odczytów z tych samych profili FUT.GG. Kod HTTP 200 i obecność karty nie gwarantują dostępności wyceny. `Grading Score` nie jest ceną. Brak wartości na profilu nie oznacza braku kart na rynku.
- Test trwał poniżej 10 sekund samego odwiedzania stron, w osobnym, read-only workflow. PR z kodem testowym zamknięty bez scalenia; `main`, EMA, indeks, snajperka i cron bez zmian.

### Test hipotezy selekcji (tylko opisowo, jedna para migawek)
| Grupa ceny względem mediany tego samego pasma | Konsola | PC |
|---|---:|---:|
| Taniej od mediany | 6/39 = 15,38% poza listą | 11/36 = 30,56% |
| Drożej od mediany | 3/26 = 11,54% | 8/34 = 23,53% |
| Równo z medianą | 22/60 = 36,67% | 21/52 = 40,38% |

**Porównanie z hipotezą z zagadnienia 2:** w pierwszej parze droższa grupa NIE wypadała częściej niż tańsza (odwrotny kierunek: PS 11,54% wobec 15,38%; PC 23,53% wobec 30,56%). Największą rotację miały remisy na medianie. To wskazówka, że kolejność/tie-break przy identycznych cenach może mieć znaczenie, ale nie dowód przyczyny ani statystycznie stabilny wynik.

**Co zostaje z literatury (Little/Rubin, Columbia) i wcześniejszych testów:** obciążenie przez nieprzypadkową dostępność danych nadal jest możliwe. Nie możemy wnioskować o sukcesie transakcji z braku notowania. Metody selekcji muszą być oceniane na kolejnych próbach i z jawnie zapisaną obserwowalnością.

### Następny test o najwyższej wartości
Zamiast czekać na pełne 12h, znaleźć źródło, które dla określonego *item ID i platformy* udostępnia **liczbową cenę z czasem publikacji** także poza TOP 5/11. Porównać 3–5 kart w nieprodukcyjnej próbie i 1–2 kontrole. Wykluczyć źródła agregujące ten sam FUT.GG bez nowego, niezależnego pomiaru. Jeżeli źródło istnieje i jest stabilne, dopiero wtedy rozważyć dodatkowe pobieranie; w przeciwnym razie raportować wyłącznie warunkowy wynik na dostępnych próbkach.

**Stan:** eksperyment przeprowadzony, indywidualne profile FUT.GG odrzucone jako źródło liczbowej weryfikacji. Nie wybrano nowego algorytmu wyceny.


## Zagadnienie 4 — próba rozszerzenia głębokości listy FUT.GG (2026-11-06)

**Źródło operacyjne:** [FUT.GG Cheapest by Rating](https://www.fut.gg/cheapest-by-rating/) i link „View All” do [filtrowanych zawodników 86 OVR](https://www.fut.gg/players/?market_players=true&overall__gte=86&overall__lte=86&sorts=current_price). Przefiltrowana strona pokazuje paginację, ale to samo w sobie nie jest potwierdzeniem dostępności wycen.

**Test read-only:** [PR #7](https://github.com/patrykrekin/AppEA/pull/7), [Actions – log drugiej próby](https://github.com/patrykrekin/AppEA/actions/runs/42297258742). Systemowy Chrome/Playwright, rating 86, 2 strony × 2 rynki (konsola i PC). W każdym przypadku HTTP 200, poprawny nagłówek tytułowy i `futgg_platform`, paginacja 1–4 obecna. **0 widocznych elementów kart z ID, 0 liczbowych wycen** we wszystkich 4 widokach. Zrzut tekstowy zawierał filtry i stopkę zamiast listy zawodników. Nie zakładamy, że nie ma ofert w grze: możliwy brak ładowania wyników lub inny sposób prezentacji. Wynik dla naszego kanału odczytu: **brak wartościowego rozszerzenia historii**.

**Decyzja:** nie scalać eksperymentalnego scrapera, nie zwiększać liczby requestów, nie zmieniać `refresh.yml` i produkcyjnej EMA. Kryterium ">11 kart z potwierdzonym ID i ceną" nie zostało spełnione. Status: *odrzucone jako źródło cen w przetestowanym środowisku*, bez twierdzenia o całym FUT.GG.

## Zagadnienie 5 — dojrzałość archiwum v2 i prognoza horyzontu (2026-11-06)

**Źródła metodyczne:** Hyndman/Athanasopoulos, [Forecasting: Principles and Practice, rozdz. 5](https://otexts.com/fpp3/toolbox.html) — walidacja kolejnego okresu, naiwny benchmark; Little/Rubin, [Statistical Analysis with Missing Data](https://onlinelibrary.wiley.com/doi/10.1002/9781119482260.ch3) — selekcja obserwowanych przypadków. **Dane empiryczne:** archiwum repo `historia-kart.json` v2, odczyt `2026-11-06T21:28:26Z`. Analiza read-only, łączna retencja widoczna ok. 14,8 h.

**Jakość / rotacja:** 81 migawek/rynek i 80 par z odstępem ≤20 min (powtarzane, zależne obserwacje); PS 351 kart, 10 970 punktów cen, PC 448 kart, 10 767 punktów. Zniknięcia z *odczytanego wycinka*: PS **3147/10061=31,28%**, PC **3771/9880=38,17%**. Przy remisach cenowych na medianie: PS **2244/4934=45,48%**, PC **2307/4463=51,69%**. Dla cen poniżej mediany: PS 21,24%, PC 28,27%; powyżej: PS 13,42%, PC 25,58%. To wyłącznie opis wycinka i hipoteza o wpływie remisów na ranking; nie prognoza sprzedaży.

**Dojrzałe historie wg aktualnego filtra** (>=36 próbek w 12h, >=8h pokrycia, luka <=20min, świeżość <=20min): PS **34/351**, tylko ratingi 88–90, 92, 93; PC **27/448**, tylko 89, 90, 92, 93. Żadna karta 83–87 nie spełniała tego warunku. Modelu nie wolno oceniać jako reprezentatywnego dla tanich kart.

**Eksploracyjny rolling-origin 2h**, na danych warunkowo obserwowanych, z regułami istniejącego `sprawdzMetody()`:
| Rynek | Początki | Oczekujące | Zaobserwowane | Unikalne karty z wynikiem | MAPE ostatnia | Mediana | EMA | Hybryda |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| PS | 230 | 67 | 163 | 35 | 3,383% | 3,725% | 4,056% | 3,837% |
| PC | 201 | 55 | 146 | 30 | 4,168% | 4,184% | 4,668% | 4,405% |

Wszystkie obserwowane rozliczenia dotyczą powracających, wysoko ocenionych kart. **12h: 0 wyników, wszystkie 230/201 początków oczekują.** Zbyt krótka historia, by porównywać modele na horyzoncie docelowym. Pary/pochodzenia nie są statystycznie niezależne.

**Ważna nierówność informacyjna:** `sprawdzMetody()` jako naiwną prognozę bierze ostatnią cenę w t, ale EMA/medianę liczy tylko na danych <t. Przy uczciwym porównaniu tego samego zbioru informacji trzeba zaktualizować EMA/medianę o p(t), albo cofnąć benchmark do poprzedniego pomiaru. Pomocniczy offline wariant inkluzywny dał (2h): PS EMA 4,032%, mediana 3,707%; PC EMA 4,641%, mediana 4,144%. Nie kalibrowano wag ani progów i nie wyznaczono zwycięzcy strategii.

**Powtarzalność:** migawka cen użyta w tej analizie odpowiada [commitowi `b745843`](https://github.com/patrykrekin/AppEA/commit/b745843bba39ea29d06ec397dbf20638e0f4ba01), blob `historia-kart.json` `a361dc2b96f7eef96570713cc9aa64d0593297e3`.

**Kontrola wag i niezależności obserwacji:** 163 i 146 rozliczeń pochodziło tylko od 35 kart PS i 30 PC. Po uaktualnieniu metod o p(t) oraz zrównaniu wagi każdej karty (średnia błędów w obrębie karty, następnie średnia po kartach), makro-MAPE PS: ostatnia 3,515%, mediana 3,628%, EMA 4,099%; PC: ostatnia 4,082%, mediana 4,055%, EMA 4,562%. Odchylenie mediana minus ostatnia: PS +0,114 p.p., PC −0,027 p.p. Eksploracyjny bootstrap klastrowy (4000 losowań kart ze zwracaniem, seed 20261106) daje szerokie 95% zakresy różnicy: PS [-0,506; +0,745] p.p., PC [-1,236; +1,199] p.p. Bootstrap nie uwzględnia szoków wspólnych dla różnych kart i nie jest podstawą formalnej istotności. **Nie ma podstaw do wskazania zwycięzcy modelu.**

**Decyzja:** brak zmian w produkcji. Następny test ma wyrównać informację dostępną metodom w t, raportować agregację po kartach oraz oddzielnie ratingach, i nie przedstawiać 2h w selektywnym zbiorze jako wyniku 12h ani ceny transakcji. Status: *weryfikacja wstępna na danych*, nie wdrożone do rekomendacji.


## Zagadnienie 6 — uczciwe porównanie prognoz 2h i analiza odporności (2026-11-06)

**Pełny, powtarzalnie opisany audyt:** [AUDYT_POROWNANIE_PROGNOZ_2H_20261106.md](AUDYT_POROWNANIE_PROGNOZ_2H_20261106.md). Dane zamrożone w [commit `b745843`](https://github.com/patrykrekin/AppEA/commit/b745843bba39ea29d06ec397dbf20638e0f4ba01), `historia-kart.json` blob `a361dc2b96f7eef96570713cc9aa64d0593297e3` (`at=1794000506`).

**Źródło E:** Hyndman, Athanasopoulos, *Forecasting: Principles and Practice* 3e, [§5.10](https://otexts.com/fpp3/tscv.html) — osobne pochodzenia i przyszły wynik. **Źródło F:** Deen, de Rooij, [ClusterBootstrap](https://pmc.ncbi.nlm.nih.gov/articles/PMC7148287/) (Behav Res Methods, 2020) — powtórzenia jednego obiektu nie są niezależnymi próbami i powinny być traktowane jako klastry, z osobnym zastrzeżeniem o wspólnych szokach rynkowych. Transfer do EA: ważenie po identyfikatorach kart i kontrola odporności na zależność czasową; żadne źródło nie określa progów optymalnych EA.

**Wyrównanie informacji:** dla porównania prognoz `p(t+2h)` wszystkie metody korzystają z danych **do t włącznie**, a przyszła cena służy wyłącznie ocenie. Filtr: 36 punktów, 8h pokrycia, luka 20min; przyszły pomiar w tolerancji ±15min. 163 wyników PS (35 kart) i 146 PC (30 kart). 12h: nadal 0 rozliczeń. **Żadnych ratingów 83–87**.

| Wariant | PS ostatnia / mediana MAPE | PC ostatnia / mediana MAPE |
|---|---:|---:|
| Micro (co 1h) | 3,383% / 3,707% | 4,168% / 4,144% |
| Macro po kartach (co 1h) | 3,515% / 3,628% | 4,082% / 4,055% |
| Micro przy pochodzeniach co >=2h | 3,320% / 3,571% | 3,675% / 4,520% |
| Macro po kartach (co >=2h) | 3,434% / 3,513% | 3,608% / 4,443% |

**Wynik:** maleńka przewaga mediany na PC z próby co 1h **odwraca się** po ograniczeniu nakładania prognoz. Na ratingach 89–90 lepiej wypada ostatnia cena, na 92 częściej mediana; te podgrupy to tylko 8–11 kart na platformę. Różnice statystyczne są niepewne, a horyzont 12h pozostaje nierozliczony. **Nie wdrażać** per-rating ani zmian wag.

**Kluczowa korekta interpretacyjna:** eksperymentalna EMA z 12h okna, inicjowana pierwszą ceną, **nie jest** produkcyjną EMA v3. Produkcyjny poziom dobowy bywa zasiewany szybką EMA, jest resetowany po luce >2h lub zmianie ID i wykorzystywany w sygnale **przed** aktualizacją obecną ofertą. Taka pre-update baza historyczna jest celowa dla wykrywania przeceny i nie stanowi błędu. MAPE z eksperymentalnej EMA nie może służyć do oceny/zmiany produkcyjnej.

**Decyzja:** pozostawić produkcję bez zmian. Następnym etapem jest projekt pasywnej, minimalnej historii **faktycznych stanów produkcyjnej EMA i definicji sygnału sprzed aktualizacji**, bez nowych zapytań do FUT.GG; dopiero po sprawdzeniu kosztu, retencji i regresji rozważać osobne wdrożenie instrumentacji. Status: *audyt wstępny zakończony, brak dowodu przewagi algorytmu*.


## Zagadnienie 7 — zapisywanie kontekstu prawdziwych decyzji (2026-11-07)

**Szczegółowy raport:** [AUDYT_SHADOW_DECYZJI_20261107.md](AUDYT_SHADOW_DECYZJI_20261107.md). **Kod i testy tylko na niescalonej gałęzi** [research/shadow-predecision-20261107](https://github.com/patrykrekin/AppEA/tree/research/shadow-predecision-20261107); [wynik testu offline #42407791946](https://github.com/patrykrekin/AppEA/actions/runs/42407791946) — **13/13 PASS**, 0 dodatkowych odczytów FUT.GG. Brak zmian `scrape.mjs`, `refresh.yml`, `data.json`, EMA i rekomendacji.

**Źródło G:** OpenTelemetry [Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — log zdarzenia wymaga jasnego czasu, typu i atrybutów; **źródło H:** Martin Fowler [Event Sourcing](https://www.martinfowler.com/eaaDev/EventSourcing.html) — warto utrzymywać ślad potrzebny do odtworzenia wcześniejszej decyzji (bez twierdzenia, że wdrażamy pełne event sourcing); **źródło I:** [GitHub Repository Limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) — zalecany pułap 1 MB na obiekt Git i przechowywanie rosnących plików generowanych poza repo.

**Audyt kodu:** szybka/dobowa EMA *przed* nową ceną jest wejściem do `policzOkazje`/`policzInwestycje`; `trwalosc` jest wcześniej aktualizowana obecną ceną; inwestycje są limitowane do TOP12. Tych momentów nie wolno pomylić. ID `/players/...` FUT.GG powtarza się między OVR (np. 248822 przy 88 i 89) — nie jest sam w sobie bezwarunkowo unikalną wersją karty. Prototype dokumentuje platformę+rating+ID profilu+nazwę, jednak ostateczna tożsamość wydania nadal bywa nierozstrzygnięta.

**Koszt (pomiar formatu przy 249 obserwowanych kartach, ale syntetycznych poziomach):** jedna migawka **22 217 bajtów**; 48h przy zapisie co 10min **~6,10 MiB**; 48h przy zapisie co 1h **~1,02 MiB**, *bez* dodatkowego kosztu historii Git. Istniejący `historia-kart.json` osiągnął **1 026 212 bajtów**. Pełny nowy plik w main byłby niewspółmierny do wartości i ryzykowałby dalszy wzrost repozytorium.

**Decyzja:** funkcja budowania migawki i jej testy — **zweryfikowane tylko w izolacji**; żadnych danych z rzeczywistych stanów pre-decision jeszcze nie zebrano i nic nie jest podłączone do produkcji. Rozpatrywać **hybrydę** (pełne rzeczywiste sygnały + rzadsza grupa kontrolna) lub zewnętrzne/krótkotrwałe artefakty; nie wybieramy magazynu bez odrębnej próby i limitów. Następny etap: **jednorazowy izolowany test integracyjny na prawdziwym przepływie danych**, bez dodatkowych per-card żądań, bez mergowania do main. Potem decyzja o koszcie, retencji i instrumentacji.


## Zagadnienie 8 — rzeczywista integracja shadow z produkcyjnym przebiegiem (2026-11-07)

**Audyt i szczegóły:** [AUDYT_SHADOW_INTEGRACJA_20261107.md](AUDYT_SHADOW_INTEGRACJA_20261107.md). Jednorazowy [Actions #42408574206](https://github.com/patrykrekin/AppEA/actions/runs/42408574206), gałąź `research/shadow-predecision-20261107` bez scalenia. Odczyt `at=1794081368` (2026-11-07T19:56:08Z). Instrumentacja oparta na oryginalnym `policzOkazje` i `policzInwestycje` oraz rzeczywistych preFast/preSlow i trwałości po bieżącej cenie — bez powtarzania progów czy zapytań per-card.

**Pierwszy test negatywny:** [#42408446461](https://github.com/patrykrekin/AppEA/actions/runs/42408446461) wykrył próbę walidacji ratingu 91 spoza koszyka inwestycyjnego. Zamiast ukrywać błąd, zmieniono zakres sondy na **cały rzeczywisty KOSZYK 83–89** (źródło kontroli: `scraper/lib/indeks.mjs`), nie odrzucając żadnych kart wewnątrz koszyka. Kolejny izolowany `fast`: **PASS**.

**Wynik:** wiersze 77 PS / 77 PC, wszystkie faktyczne inwestycje zgodne 1:1 z `data.json` (PS **4/4**, PC **2/2**), sygnały okazji PS **4**, PC **1**. EMA dobowa z właściwego momentu była obecna we wszystkich 154 wierszach; EMA szybka 74 PS i 75 PC; poprawnie uchwycona trwałość po odczycie 7 PS i 8 PC. Przed/po bieżącej cenie poziom EMA różnił się w 66 PS i 67 PC — dowód uchwycenia prawidłowej fazy decyzji. Brak mutacji wejścia. Czas sondy **1,595561 ms**, JSON **17 890 B**. Testy offline 13 PASS, izolowany scraper i walidator `data.json` PASS.

**Ocena kosztu:** przy stałej wielkości 154 kart i 17 890 B/migawkę: 48h co 10min **~4,91 MiB** czystego JSON, co 1h **~0,82 MiB**, bez historii Git. Ograniczenie identyfikacji edycji karty i selekcji rankingu pozostaje. Nie jest to walidacja zysków ani zachowania w innych warunkach rynkowych.

**Decyzja:** etap 8 integracyjnie zakończony, ale **instrumentacja nie została wdrożona na main**. Nie modyfikować EMA, rekomendacji ani historii na podstawie jednego przebiegu. Dalsze badanie (etap 9): ocena hybrydowego zapisu wszystkich sygnałów i rzadszych pełnych kontroli, z kontrolą biasu, kosztów retencji i workflow.

**Źródła metodyczne do dalszej pracy:** [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/), [Fowler, Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html), [GitHub Repository Limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits). Żadne nie uprawnia do uznania trafności transakcji z samego zniknięcia oferty z rankingu.


### Korekta izolacji po etapie 8 (07.11.2026)

Wbrew początkowemu założeniu izolacji końcowa kontrola wykazała, że **hook badawczy i sześć plików eksperymentalnych znalazły się przejściowo na `main`**. Hook w normalnym przebiegu był aktywny tylko przy jawnej zmiennej środowiskowej, ale sama obecność kodu naruszyła uzgodniony proces. Przywrócono oryginalny `scraper/scrape.mjs` (blob `88912b6f7b8cdc679d1a94ba62510e465d7adac6`, rollback commit `67241e08a761e4bb3f5c69d20225aa472fa47187`) oraz usunięto sześć eksperymentalnych plików z `main`. Przebieg badawczy i kod zachowano na osobnej gałęzi. Szczegóły w [audycie etapu 8](AUDYT_SHADOW_INTEGRACJA_20261107.md). **Zasada na przyszłość:** przy każdej edycji w research potwierdzić hash i zawartość `main`; nie polegać wyłącznie na wybranym argumencie `branch` w narzędziu. Stanu zdrowia produkcji nie wolno zakładać na podstawie jednego wcześniejszego crona — sprawdzić go ponownie.


## Zagadnienie 9 — analiza kosztu i utraty informacji w historii hybrydowej (2026-11-07)

**Raport z pełną metodyką:** [AUDYT_RETENCJA_HYBRYDOWA_20261107.md](AUDYT_RETENCJA_HYBRYDOWA_20261107.md). Materiał: **31 262 realne wiersze** rankingu 83–89, po 203 rzeczywistych migawkach obu platform (37,43h), `historia-kart.json` blob SHA `aaddc7056f8fdd04766124751ffbd4e84fac7bbd`. To **nie** pełny rynek, nie dane o transakcjach, nie prawdziwe historyczne sygnały produkcyjnej EMA.

**Źródła i transfer:** [OpenTelemetry Sampling](https://opentelemetry.io/docs/concepts/sampling/) — zachowanie zdarzeń wartościowych/nieodtwarzalnych i rozróżnienie od próby losowej; [Penn State STAT 506 — Unequal Probability Sampling](https://online.stat.psu.edu/stat506/Lesson03) — wnioskowanie projektowe wymaga dodatnich znanych prawdopodobieństw włączenia, nie niejawnie selektywnego rankingu; [GitHub Repository Limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits), [Workflow Artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data) — koszty i ograniczenia stale nadpisywanych plików, nietrwałość artefaktów bez strategii eksportu. Wykorzystane jako zasady inżyniersko-statystyczne, **nie jako źródło progów EA**.

**Zastępczy sygnał do testu stresowego, z użyciem wyłącznie wcześniejszych cen tej samej karty:** `p(t) <= 0,95*median(max12 wcześniejszych obserwowanych cen)`, >=6 wcześniejszych punktów, >=1h rozpiętości, wszystkie przerwy <=20min. Zdarzenia proxy: PS **158**, PC **437**, łącznie **595**. Luźniejszy warunek bez wszystkich ciągłych luk daje 1 850 zdarzeń — wrażliwość kosztu; nie jest to `policzInwestycje`.

**Warianty:**
| Wariant | Zachowane wiersze z pełnych 31 262 | Koszt informacyjny |
|---|---:|---|
| Full | 31 262 (100%) | Baseline |
| H0: wszystkie proxy-sygnały + godzinny przekrój | 6 465 (20,68%) | Zachowuje tylko 349/556 obserwowalnych rezultatów 2h i 226/352 12h |
| H1: H0 + obserwacje tylko w oknach 2/12h ±15min | 7 716 (24,68%) po zamknięciu okien; **7 722 (24,70%)** przy strumieniu online | Zachowuje 556/556 i 352/352 **wyników obecnych w pełnym źródle**, nie tych brakujących |
| H1 + pełne kontrolne co 30min | 13 048 (41,74%) | Więcej zwykłych kontroli |
| H1 + pełne kontrolne co 120min | 4 997 (15,98%) | Bardzo ubogie kontrole |

**Negatywne odkrycie:** z 9 818 krótkich epizodów (najwyżej 2 kolejne obserwacje) H1 **nie zawiera żadnego pomiaru dla 7 458 (~75,96%)**. Same godzinna kontrola i sygnały nie wystarczają do analizy rotacji, false negative i kart pojawiających się krótko w rankingu. Wyróżniono 12 153 wejść/ponownych pojawień się po >20min przerwy; 9 729 z nich brakowało w H1. Kompaktowy zapis `[t,platforma,OVR,id,cena,nazwa]` tych 9 729 zdarzeń zajmował **441 381 B** (pomiar UTF‑8 samych tablic). Orientacyjnie H1 + te krótkie eventy ~1,28 MiB vs full ~3,46 MiB (ok. 63% mniej), przy założeniu średniego rozmiaru wiersza z etapu 8 i bez metadanych/storage/rewizji Git. To **szacunek kosztu, nie zmierzony format produkcyjny**.

**Próba Bernoulliego q=10%** na dodatkowych nieskatalogowanych wierszach: 40 ziaren pseudolosowych, średnio 10 064 wiersze (~32,19% F), ale nadal **67,06%** krótkich epizodów bez obserwacji. Do estymacji statystycznej wymagane jawne `p` i oddzielenie prób probabilistycznych od celowo wybranych sygnałów, checkpointów i outcome.

**Wniosek/Status:** *analiza retencji zakończona; brak wdrożenia*. Pełny sygnał co fast + śledzone okna wyników + rzadkie przekroje + kompaktowe wejścia (i ewentualna osobna losowa kontrola) wyglądają obiecująco; **nie jest to jeszcze zatwierdzony projekt magazynu**. Konieczna trwała pamięć watchlisty min. 12h+15min w wielu niezależnych procesach, idempotencja, retry i rozdział od istniejącego `data.json` i `historia-kart.json`. **Etap 10**: testowanie samej mechaniki storage/odtwarzania stanu w izolacji, bez nowych requestów i bez modyfikacji main kodu.


## Zagadnienie 10 — idempotencja i odporność magazynu HOT/COLD (2026-11-07)

**Raport:** [AUDYT_MAGAZYN_WATCHLIST_ETAP10_20261107.md](AUDYT_MAGAZYN_WATCHLIST_ETAP10_20261107.md). Prototypy powstały **lokalnie, bez połączenia z produkcją**. Kopia testów/surowych logów w paczce `AppEA_etap10_prototyp_i_testy.zip` (sha256 `f78ba9c3c878db9ece6e9588127a393bc2a94eb17a5a7679a06e0151a9964ad3`), którą należy zachować z rozmowy. **Źródła kodu nie zostały wysłane do repozytorium** — tylko opis i wyniki. Nie sugerować, że istnieje PR lub workflow etapu 10.

**Zewnętrzne źródła i transfer:** [SQLite Atomic Commit](https://www.sqlite.org/atomiccommit.html), [SQLite Transactional](https://www.sqlite.org/transactional.html) — rozdzielny commit/rollback i crash consistency; [GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners) — job otrzymuje nowy system plików; [GitHub Artifact Retention](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository) — artefakt ma ograniczoną retencję. Tłumaczenie na EA: atomowa pojedyncza aktualizacja stanu watchlisty + historycznych zdarzeń, idempotentny retry, kontrola generacji i trwałości między jobami. Nie są to źródła skuteczności progów EA.

**Wyniki:** syntetyczny lokalny eksperyment Node22, **25 testów JSON + 11 SQLite = 36 PASS**, awaria przed i po commit oraz zachowanie `pending/observed/unobserved`. Stres **203 przebiegi × 154 karty = 31 262 wiersze**: wspólny rosnący JSON `1 231 152 B` (limit 1 MiB przebity przy 171. wsadzie; ~18,96 ms/batch); SQLite osobne transakcyjne `hot` `14 515 B` + ledger, plik bazy `2 125 824 B`, ~3,33 ms/batch, integralność SQLite OK. Oba 8 876 zdarzeń, 5 watches. Nie przedstawiać czasów jako benchmarku runnera ani tych syntetycznych cen jako prawdziwych danych FUT.GG. Nie wykonano testów `SIGKILL`/power-loss.

**Decyzja:** **monolityczny JSON odrzucony jako magazyn docelowy**; lokalny SQLite tylko kandydat pod względem transakcyjności, nie jest jeszcze rozwiązaniem pomiędzy runnerami. Brak zdalnego magazynu, protokołu CAS, retencji ledgeru, granic danych i wdrożenia. **Etap 11:** krótki pilotaż bezpiecznego trwałego zapisu przez odrębne uruchomienia z ochroną przed wyścigiem, przy małym koszcie i bez modyfikacji produkcyjnych algorytmów.
