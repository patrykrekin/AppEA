# Etap 9 — hybrydowa retencja zdarzeń i obserwowalność rynku AppEA
**Data: 7 XI 2026. Status: badanie offline, bez wdrożenia ani zmian produkcji.**

> Punkt wznowienia: [START_TUTAJ_ANALITYKA.md](START_TUTAJ_ANALITYKA.md) · [Rejestr badań](REJESTR_ZRODEL_BADAWCZYCH.md) · [Rzeczywisty test sondy — etap 8](AUDYT_SHADOW_INTEGRACJA_20261107.md)

## Cel

Ustalić, czy zamiast kompletnej, dużej historii rzeczywistych stanów EMA przy każdej migawce można przechowywać:
1. **wszystkie wybrane sygnały i momenty ich wystąpienia**,
2. **rzadziej kompletne przekroje kandydatów** jako kontrolę,
3. **wyceny z przyszłych okien 2 h i 12 h** dla wcześniej zapisanych sygnałów, jeżeli karta nadal jest widoczna w zwykłym odczycie,
4. opcjonalnie **krótkie zdarzenia wejścia/ponownego pojawienia się w rankingu** i losową próbę kart bez sygnału.

Test ma mierzyć przechowaną informację i objętość; NIE udowadnia trafności ani rentowności algorytmu.

## 1. Zamrożony materiał i ograniczenia

- Odczyt `historia-kart.json` z `main`: **blob `aaddc7056f8fdd04766124751ffbd4e84fac7bbd`** (7 XI, `at=1794081872` = 2026-11-07 20:04:32 UTC). Migawki zaczynają się 2026-11-06 06:38:32 UTC.
- **203 rzeczywiste migawki na platformę**, średnio ok. 5,42 migawki/godz. przez 37,43 h. Wszystkie mają poprawne ratingi 83–89 i po **77 obserwowanych kart/rynek**. Populacja rankingu: **31 262 wiersze** (= 203 × 77 × 2). To **odczyty ograniczonego wycinka najtańszych ofert**, a nie pełny rynek ani transakcje.
- Punkty ceny bez odpowiadającej im migawki v2 nie były używane jako dowód widoczności. Nie dopisano żadnych brakujących pozycji ani fikcyjnych momentów.
- Archiwum v2 **nie zawiera historycznych decyzji produkcyjnej EMA**. Dlatego eksperyment używa WYŁĄCZNIE **jawnie zastępczego triggera cenowego**, który NIE jest `policzInwestycje()`, nie jest rekomendacją i nie może służyć do pomiaru jej skuteczności.
- **Ścisły proxy-event:** bieżąca cena tej samej karty spada o >=5% względem mediany maksymalnie 12 poprzednich obserwowanych cen w tej serii, przy >=6 wcześniejszych cenach, >=1h ich rozpiętości, przerwie od ostatniej <=20min i bez przerw >20min pomiędzy wcześniejszymi punktami. Tylko dane *sprzed* t. Proxy jest wyłącznie obciążeniem testowym dla projektu retencji. **595 zdarzeń** w historycznej próbie: PS **158**, PC **437**. Taki warunek faworyzuje ciągle widoczne karty i tworzy bias selekcyjny.
- **Test wrażliwości:** przy zniesieniu tylko kryterium ciągłości przerw wewnętrznych serii powstaje **1 850 proxy-zdarzeń** (PS 556, PC 1294). Silna zmiana liczebności jest ostrzeżeniem, że koszt zależy od rodzaju realnego sygnału; nie jest podstawą wyboru progu 5%.

## 2. Strategie retencji

**F — pełna:** wszystkie 31 262 wiersze. Koszt i informacja referencyjna, ale *tylko* dla obserwowalnego wycinka co ~10min.

**H0 — hybryda bez śledzenia wyniku:** raz na godzinę pierwszy rzeczywisty poprawny odczyt w danym UTC hour-slot (39 na platformę), PLUS każdy proxy-event. Wiersze deduplikowane po platformie+kluczu karty+czasie. Wybrany deterministyczny checkpoint **nie jest losową reprezentatywną próbą**.

**H1 — hybryda + późniejsze wyceny:** H0 PLUS podczas kolejnych odczytów zachowujemy bieżącą cenę każdej obserwowanej karty, która miała wcześniej trigger i znajduje się w oknie `t_event+2h ±15min` lub `t_event+12h ±15min`. To **nie wymaga dodatkowego żądania do profilu**. Sygnał tworzy na przyszłość regułę przechwytywania ceny, nie odtwarzamy przyszłości w chwili zdarzenia. Watchlistę trzeba przetrzymać przez 12h+15min.

**H2 — H1 + wejścia do rankingu (krótkie eventy):** zachowujemy kompaktowy rekord `[t, platforma, rating, ID profilu FUT.GG, cena, nazwa]` przy pierwszej rzeczywiście zaobserwowanej pozycji lub ponownym pojawieniu się po >20 min przerwy. Ten zapis NIE świadczy o sprzedaży ani powrocie do pełnego rynku. Pełne dane EMA nie są tu obowiązkowe.

**H3 — H1 + niezależna losowa próba kontroli:** dla każdego innego wiersza, także poza checkpointami, dodatkowy zapis z Bernoulli `p=0,1` niezależnym od ceny; zachować w rekordzie `p`, seed i informację o powodzie zapisu. Symulowano 40 deterministycznie replikowanych ziaren pseudolosowych. To eksperymentalny parametr, a nie optymalny procent dla EA.

### Czego wymaga wariant zgodny z produkcją

Rzeczywiste sygnały z etapu 8 muszą trafiać do dziennika **z każdego faktycznego przebiegu fast**, także jeżeli pełny przekrój nie jest akurat zapisywany. To archiwum v2 (co ~10min) nie może udowodnić, ile krótkich sygnałów pojawia się *pomiędzy* migawkami. Obserwowanie na stronie tylko TOP 11/rating nie gwarantuje późniejszej ceny. Nie uznajemy „brak ceny” za porażkę/sukces.

## 3. Wynik ścisłej próby (595 zdarzeń)

| Strategia | Zapisane pełne wiersze | % wierszy pełnej historii | Oszczędność liczby wierszy |
|---|---:|---:|---:|
| F — wszystkie odczyty | **31 262** | 100,00% | — |
| H0 — godzinne przekroje + zdarzenia | 6 465 | 20,68% | 79,32% |
| H1 — H0 + rozliczenia 2/12h (po dojrzeniu) | **7 716** | 24,68% | **75,32%** |
| H1 — **symulacja strumieniowa online**, obejmująca także obserwacje w otwartych, jeszcze niedojrzałych oknach | **7 722** | 24,70% | **75,30%** |
| H1 z pełnymi przekrojami co 30 minut | 13 048 | 41,74% | 58,26% |
| H1 z przekrojami co 120 minut | 4 997 | 15,98% | 84,02% |

Dla ścisłych proxy-zdarzeń (najpierw wybieramy historyczną próbę **bez podglądania przyszłości**) w horyzoncie **2h**: 595 zapoczątkowań, **37 oczekujących**, **558 dojrzałych**; z nich **556** ma późniejszą cenę w pełnym archiwum, **2** nie mają. H0 zachowuje tylko **349/556 (62,8%)** obserwowalnych wyników; H1 **556/556 (100%)**. Dla **12h**: **241 oczekujących**, **354 dojrzałe**; pełne archiwum ma **352** przyszłe wyceny i **2** bez wyniku; H0 zachowuje **226/352 (64,2%)**, H1 **352/352 (100%)**. **100% oznacza tylko „100% cen obecnych w archiwum”, a nie „100% rozliczeń rynku”**. Bardzo wysoka obserwowalność w ścisłej grupie to skutek ograniczenia do kart ze stabilną historią — nie wolno jej uogólniać.

**Symulacja prawdziwego strumienia t:** zdarzenia dodają reguły dla przyszłych okien i zapisują wszystkie napotkane tam ceny *na bieżąco*, a starsze reguły wygasają. Symulacja wybrała 7 722 wiersze wobec 7 716 w wariancie ograniczonym do już zakończonych okien. **Sześć dodatkowych** to ceny zapisane w *otwartych* oknach; obliczenie nie wymagało znajomości przyszłych notowań. Maksimum jednoczesnych otwartych reguł okien w tej próbce: **337**. Ich trwałe przechowywanie między odrębnymi uruchomieniami crona jest **otwartym problemem inżynierskim**, nie wdrożoną funkcją.

**Wrażliwość na rzadkość zdarzeń:** przy 1 850 luźniejszych proxy-zdarzeniach H1 dojrzałe przechowuje **10 247/31 262 (32,78%)**, oszczędzając **67,22%** wierszy. W tej mniej selektywnej próbie pełne archiwum NIE zawiera 335 z 1 752 dojrzałych wycen 2h i 234 z 1 180 dojrzałych wycen 12h (rankingi ograniczają obserwowalność), mimo śledzenia wyników.

## 4. Najważniejsze ryzyko: „niewidoczne” krótkie epizody

Podzielono serie kart na **epizody ciągłej widoczności**: kolejne ceny tej samej karty mają maksymalnie 20 min odstępu; dłuższa luka zaczyna nowy epizod. W danych jest **12 153** epizodów. **9 818** z nich trwało najwyżej dwa odczyty (~10–20min w archiwum).

H1 z godzinnymi checkpointami **nie zachował żadnej ceny w 7 458/9 818 krótkich epizodach (~75,96%)**. Przy tym 11 identyfikowanych (rating+profil+nazwa) kart konsolowych i 25 PC nie pojawia się w zapisanym H1 **ani razu**, pomimo obecności w F. **Nie wolno zatem używać H1 do badania pełnej rotacji najtańszego rankingu ani nieobecności wszystkich kart**.

Dodatkowe, niezależne losowanie 10% nie zapisanych wcześniej wierszy (**H3**, 40 prób) daje średnio **10 064/31 262 (32,19%)** pełnych wierszy; krótkich epizodów wciąż nie reprezentuje **67,06%**. Losowanie pomaga analizie statystycznej, ale **nie zastępuje** dziennika epizodów.

H2 zapisuje pierwszy odczyt **każdego epizodu w samym archiwum**, dlatego nie zostawia krótkiego epizodu bez żadnego rekordu. Koszt: **12 153** zdarzeń „pierwsze zaobserwowanie / reentry”, z czego **9 729** nie było już w H1. Jeśli zamiast osobnych pełnych 18-polowych stanów zapisujemy je kompaktowo, nie musimy płacić za 9 729 pełnych wierszy EMA.

**Ważny limit semantyczny:** „pierwsze zaobserwowanie po przerwie >20min” nie oznacza, że karta była niedostępna/sprzedana. Nawet F nie widzi kart pomiędzy 10-minutowymi próbkami.

## 5. Koszt — nie myl wyliczenia z fizycznym zapisem

Punkt odniesienia: w etapie 8 **154 rzeczywiste wiersze shadow dały 17 890 B**, co daje ~116,17 B/wiersz (łącznie z narzutem metadanych jednej migawki). Ten przelicznik użyto **wyłącznie jako przybliżenia**, bo format przyszłego archiwum, liczba wywołań fast, podpisy i metadane będą inne.

Na 37,43 h zaobserwowanej historii (31 262 wiersze):
- F, równoważnik przy stałym koszcie na wiersz: **~3,46 MiB**.
- H1 (7 716/7 722 pełne wiersze): **~0,85 MiB**.
- Dodatkowe **9 729** krótkich zapisów wejścia/reentry w postaci samej tablicy `[t,side,rating,id,cena,nazwa]`: **441 381 B** (~0,42 MiB), dokładny rozmiar UTF‑8 tych wygenerowanych z archiwum pól, **bez koperty i podpisu definicji**.
- H2 szacunkowo **~1,28 MiB** łącznie, czyli około **63% mniej** niż F. Gdy każdy zapis wejścia miałby jednak rozwinięte klucze i typ eventu, ten sam zestaw 9 729 rekordów kosztowałby **898 644 B**, a oszczędność spadłaby do ~50,6%. To podkreśla konieczność pomiaru *rzeczywistego kodowania*, nie wyłącznie liczby wierszy.
- Bez danych o częstości faktycznych historycznych sygnałów w cyklu fast **nie można ekstrapolować** tej oszczędności jako gwarancji produkcyjnej.

Nie uwzględniono: historii Git i częstotliwości commitów, deduplikacji, kompresji i przyszłych zmian liczby kart, kosztu pamięci aktywnych watchlist, kosztu wznowienia po błędzie, wersji schematu, kursu czasu odczytu ani ceny magazynu.

## 6. Wnioski metodologiczne z literatury

1. **[OpenTelemetry Sampling](https://opentelemetry.io/docs/concepts/sampling/)** — selekcja zdarzeń według ważności zmniejsza koszty, ale nie zastępuje pełnej obserwowalności; unikanie losowego odrzucenia istotnego sygnału ma sens. To analogia do przechowywania *wszystkich* sygnałów z aplikacji, nie argument za skutecznością finansową.
2. **[Penn State STAT 506 — Unequal Probability Sampling](https://online.stat.psu.edu/stat506/Lesson03)** — wnioskowanie na podstawie nierównych prób wymaga **dodatnich, jawnych prawdopodobieństw włączenia**. Godzinny deterministyczny checkpoint ma `π=0` dla większości konkretnych momentów i nie dostarcza podstawy do prostego ważenia Horvitza–Thompsona. Losowy wiersz kontrolny z `π>0` i zapisem tego `π` może poprawić wnioskowanie o **obserwowanym wycinku rankingu** (nigdy o całym rynku), przy zachowaniu osobnych etykiet „sygnał / losowanie / reentry / outcome”.
3. **[GitHub Repository Limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)** i [retencja artefaktów Actions](https://docs.github.com/en/actions/tutorials/store-and-share-data) — generowanych, często nadpisywanych wielkich plików nie należy doklejać do `main`; artefakty mają określony termin wygaśnięcia, więc nie zastąpią permanentnej bazy badań bez eksportu i polityki przechowania.

## 7. Decyzja: jeszcze NIE wdrażamy do produkcji

**Etap 9 zakończony na poziomie badania porównawczego.** Wariant „tylko zdarzenia + raz na godzinę pełna kontrola” jest niedostateczny do badania rotacji i może pominąć także późniejszy wynik sygnału. Zalecany do dalszego **osobnego pilota** układ:

- **Wszystkie prawdziwe sygnały** (`policzOkazje` i końcowe `policzInwestycje`) przy każdym udanym `fast` — z wersją definicji, pełnym kontekstem pre-update i czasem.
- **Dojrzałość/outcomes:** rejestrować już tylko obserwowane ceny z okien 2h/12h ±15min dla sygnałów aktywnych, bez dodatkowych żądań, ze stanami *pending / observed / unobserved after horizon*. Brak ceny nigdy nie jest „sprzedano”.
- **Przekrój całego koszyka 83–89** mniej więcej raz na godzinę jako operacyjna kontrola, plus **osobne kompaktowe zdarzenia wejścia/reentry** po >20min (czas/ID/OVR/platforma/cena/nazwa), bo inaczej ginie około 76% krótkich epizodów widoczności.
- Do potencjalnych porównań statystycznych dobrać **niezależne, losowe kontrole** o znanym prawdopodobieństwie włączenia, osobno dla platform i ratingów. `p=0,10` to wyłącznie wariant eksperymentu kosztowego, **nie optymalny parametr rynku**.
- **Bez pliku rosnącego w `main`**. Trzeba odrębnie zaprojektować trwały stan watchlisty między workflow, retry/idempotencję, rozdział plików, limit bajtów, retencję (hot min. 12h+15min), zapis po zwalidowanym `fast`, konflikt zapisu i możliwość odtworzenia po nieudanym przebiegu.

**Kolejny etap 10:** przetestować *samą architekturę magazynu i stanów watchlisty* na kilku odtwarzanych lokalnie przebiegach i sztucznym błędzie zapisu/retry, z pomiarem pamięci, rozmiaru i idempotencji — zanim pojawi się jakikolwiek produkcyjny zapis. Nie zmieniać ani jednego progu EMA i nie uruchamiać dodatkowych per-card requestów.

### Algorytm testu (do rekonstrukcji)

Dla każdego side wybierz **tylko** migawki v2 i ratingi 83–89, z wierszami `[side, rating, id profilu, nazwa, price, t]` obecnymi dokładnie w danej migawce. Posortuj po `t`. Wyznacz ścisły, jednostronny proxy-event z poprzednich max12 punktów tej samej karty; nigdy nie używaj future do wykrycia zdarzenia. Odkładaj pierwszy poprawny snapshot każdej UTC godziny jako kontrolę. Każdy proxy-event zapisuj, dodaj na przyszłość dwa okna `[t+7200-900, t+7200+900]` i `[t+43200-900, t+43200+900]`, a obserwację zgodnej karty w tym oknie zachowuj **w chwili napłynięcia**. Wygaś okna po `end`, nie domyślaj się przyszłej ceny. Pierwszy odczyt danej karty i pierwszy po przerwie >1200s oznacz jako „entry/reentry”. Wszystkie zestawy deduplikuj według `[platforma, rating, id profilu, nazwa, t]`. Wynik porównuj z pełną tabelą 31 262 wierszy i rozbijaj raport na rynki/horyzonty/status obserwowalności.

**Powtarzalność:** wszystkie liczby odtworzono jednorazowo w izolowanej analizie read-only archiwum o SHA podanym powyżej. Nie dodano skryptu do produkcji; raport zawiera parametry i procedurę, ale test nie ma automatycznego cyklicznego workflow ani kodu wdrożonego na `main`.
