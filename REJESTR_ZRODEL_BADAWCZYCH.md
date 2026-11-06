# Rejestr źródeł i hipotez AppEA — log kumulacyjny

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
