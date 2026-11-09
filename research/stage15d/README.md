# 15D — trend karty, ratingu i odległość od EMA

9 listopada 2026. PASS techniczny; jedna retrospektywna kohorta. Produkcja bez zmian, brak podstaw do wdrożenia nowego filtra.

## Punkt startowy i zamrożenie

Zdalny 15C potwierdzony na `7dc743ef854861e2bc8371bffd5594662bd7bc78`. Ponowny followup.mjs: PASS. Wynik 15C pozostaje: wszystkie sześć inwestycji miało niższą cenę w ocenianym punkcie po 2h, przy czym tylko pięć spełniało limit kupna na początku.

Przed nowymi obliczeniami utrwalono protocol.json lokalnym commitem `8db68d0`. To opis retrospektywny na już używanych danych, nie prospektywna prerejestracja ani niezależny test skuteczności. Nie stroimy parametrów. Aktualny main sprawdzony podczas wznowienia: `aa536142be86f3ee7788c3b6ada2c6117bb0a073`; do porównania zachowano wcześniejszy zamrożony zbiór, zamiast mieszać go z nową retencją i bieżącymi cenami.

Źródła: migawka etapu 8 użyta w 15B, SHA256 `b5c5362f9be8da99d9f48de9e2f4aa89c7791f73853a22f4e3ae60a0e16f3b6e`; historia-kart.json z `67837b4a0833ea7f224693cb8fa32cfc9723d06b`, blob `dab4f4fe62c0ef99bf81aa4cbf36eb3700153cf1`. Skrypt weryfikuje hashe i nienaruszalność obu wejść. Wszystkie pliki źródłowe dostępne są w bazie gałęzi.

## Porównanie i formuły

Kohorta: 154 oryginalne wiersze, osobno 77 PS i 77 PC. Tożsamość = platforma+rating+ID profilu+dokładna nazwa, z nadal otwartą niejednoznacznością edycji promocyjnej.

- p0: cena przy pierwotnej decyzji, t=1794081368 s (07.11, 20:56:08 Europe/Warsaw).
- pMinus/pPlus: cena najbliższa t−7200/t+7200 s w tolerancji ±900 s, remis → wcześniejszy punkt. Przeszły punkt musi być ściśle przed t. Horyzont i tolerancja z wcześniejszych etapów 6/15C, nie dobrane do wyników 15D. Dla sześciu inwestycji pMinus jest w t−7425 s, pPlus w t+7228 s. Czasy rzeczywiste są w JSON/CSV.
- rPrzed = 100*(p0/pMinus−1), rPo = 100*(pPlus/p0−1), jednostka %.
- Benchmark karty: mediana rPrzed/rPo **innych kart** tego samego ratingu i platformy z pierwotnej kohorty. Własna karta jest wykluczona. Nie wykluczamy innych sygnałów; to opisowy benchmark wycinka ratingu, nie niezależna grupa kontrolna ani produkcyjny indeks dna pięciu najtańszych ofert.
- Nadwyżka = zmiana karty − mediana zmian innych kart, jednostka punkty procentowe (pp), nie stopa transakcyjna ani dowód przyczynowości.
- Premia EMA = 100*(EMA sprzed aktualizacji/p0−1), jednostka %. To inny mianownik niż produkcyjny rabat 100*(1−p0/EMA); nie utożsamiać tych wartości.
- Minimum 3 inne karty: jawny eksperymentalny bezpiecznik przeciw benchmarkowi z 1–2 kart, nie wyznaczony statystycznie próg wiarygodności ani nowy warunek produkcyjny. Zapisujemy liczby, minima i maksima; brak benchmarku pozostaje null.

Skład kohorty jest stały, lecz dostępność cen zmienna. Benchmark wcześniejszy nie zależy od późniejszej obecności kart: test usuwa wszystkie ceny >=t i wymaga identycznych wcześniejszych wyników. Benchmark późniejszy pozostaje warunkowy na dostępności endpointu; nie uzupełniamy braków.

## Wyniki inwestycji

| Rynek/karta 89 OVR | Zmiana przed sygnałem | Mediana innych kart przed | Zmiana po sygnale | Nadwyżka po wobec innych kart |
|---|---:|---:|---:|---:|
| PS Mariona | −15,32% | +1,82% | −7,45% | −4,30 pp |
| PS Kvaratskhelia | −10,83% | +1,82% | −2,80% | +0,83 pp |
| PS Bühl | +1,65% | +0,53% | −3,78% | −0,64 pp |
| PS Pajor | −0,93% | +1,82% | −9,43% | −6,29 pp |
| PC Mariona | −9,62% | −0,74% | −6,38% | −3,23 pp |
| PC Kvaratskhelia | −0,74% | −1,04% | −5,19% | −2,03 pp |

PS: po 10 innych kart ma poprzednią i późniejszą cenę. PC: po 9 innych kart w każdym oknie; dostępne składy nie muszą być identyczne. Pajor pozostawała poza limitem kupna — nie traktować jej jako dostępnego zakupu.

Pięć z sześciu kandydatów spadało już wcześniej (PS 3/4, PC 2/2). Wszystkie sześć spadło później, ale PS Kvaratskhelia straciła mniej od mediany innych kart. Po uwzględnieniu benchmarku pięć z sześciu miało ujemną różnicę; nie interpretować tego jako sześciu niezależnych testów.

Mediana zmian całego dostępnego oryginalnego wycinka 89 OVR: PS +1,65% przed i −3,49% po (11/11 w obu oknach); PC −0,89% przed i −4,17% po (10/11 w obu). Te zbiorcze liczby nie są benchmarkami leave-one-out z tabeli i nie opisują całego rynku FUT.

Bühl/PS: cena wcześniej +1,65%, szybka EMA 0,21% poniżej p0, dobowa EMA 22,09% powyżej p0. To konkretny przykład rozbieżności skali czasowej: wysoki poziom dobowy nie oznacza nowego, właśnie rozpoczętego spadku. Nie dowodzi jednak błędu EMA ani nieprzydatności strategii powrotu do średniej.

## Braki i skrajny punkt

W całej kohorcie cena wcześniejsza dostępna jest dla 55/77 kart PS i 53/77 PC; późniejsza dla 63/77 na każdym rynku. Niskie ratingi mają znacznie słabsze pokrycie — np. PS 84: tylko 2/11 wcześniejszych cen. Nie przenosić wniosków sześciu sygnałów 89 OVR na 83–88. Szczegółowe pokrycie per rating w result.json.

Messi 89/PC w zamrożonej historii: p0=18750; endpoint=7000 monet (−62,67%). Sąsiednie punkty to 19000 w 1794087869 s, 7000 w 1794088596 s i 19000 w 1794089307 s. Siatka i metadane pasma przechodzą walidację. Nie mamy surowej strony, więc nie rozstrzygamy między pojedynczą tanią ofertą, błędem parsowania, źródła czy tożsamości wersji. Punkt zachowano w podstawowym wyniku i jawnie pokazano zakresy benchmarków.

**Dodatkowa analiza odporności po zobaczeniu wyników**: usuwamy po kolei każdą pojedynczą kartę porównawczą (nie tylko Messiego) i przeliczamy medianę dla każdego sygnału. Znak wszystkich sześciu późniejszych nadwyżek pozostaje taki sam. Dla PC Mariona zakres wynosi −4,80 do −2,21 pp; PC Kvaratskhelia −3,61 do −0,58 pp. To analiza wrażliwości, nie korekta danych ani przedział ufności. Wyniki w exploratorySinglePeerRemoval; nie zmieniono protocol.json po obliczeniach.

## Hipotezy, decyzja i kolejny krok

1. **Spadek całego porównywanego ratingu:** wspiera go ujemna późniejsza mediana, ale nie wyjaśnia automatycznie zróżnicowania sygnałów ani silnych wcześniejszych spadków Mariony/Kvaratskhelii PS przy dodatnim benchmarku.
2. **Poziom dobowy reagujący wolniej niż cena:** zgodny z rozbieżnością szybkiej i dobowej EMA (zwłaszcza Bühl), lecz nie dowiedziony jako przyczyna słabego endpointu. Nie znamy pełnej ścieżki powstania poziomu w tym audycie.
3. **Przecena wymagająca dłuższego czasu odbicia:** nadal otwarta. 2h jest horyzontem audytu, nie obietnicą czasu realizacji celów. Nie ocenialiśmy maksimum ceny w całym okresie ani momentu pierwszego dojścia do celu.

**Decyzja: obserwować, bez nowego filtra i bez strojenia EMA.** Prosty warunek „nie kupować po wcześniejszym spadku” usunąłby część nieudanych przypadków tej próbki, ale zostałby dobrany po zobaczeniu wyniku i może odrzucać prawidłowe przyszłe odbicia. Nie wdrażać go na tej podstawie.

Najbliższy izolowany etap 15E: przed obliczeniem zamrozić ocenę dostępnych obserwacji w dłuższym, wcześniej używanym oknie 12h, z rozróżnieniem ceny końcowej i zaobserwowanego dojścia do niezmiennego celu; jawnie wykazać przerwy, brak wykonalności sprzedaży oraz tożsamość. Pozwoli sprawdzić alternatywę opóźnionego odbicia na istniejących danych. Nadal będzie to opis tej samej kohorty, nie odłożony test dla nowej reguły. Stały collector, GC i zmiany produkcyjne wyłączone z zakresu.

## Walidacja i reprodukcja

`python research/stage15d/compare.py` — PASS: oryginalne hashe, tożsamość, chronologia, siatka, zgodna migawka pasma, brak wpływu przyszłych cen na wcześniejszą metrykę, testy granicy/tolerancji i leave-one-out, niezmienione wejścia. `node research/stage15c/followup.mjs`, `node scraper/tcenzurowanie.mjs`, `node scraper/tjakosc-historii.mjs` — PASS. CSV zawiera 154 wiersze z czasami i wszystkimi porównaniami. JSON zawiera protokół, pokrycie i sześć inwestycji. Brak zależności zewnętrznych, I/O sieciowego i zapisów poza katalogiem badania.

## Źródła i krytyczna adaptacja

1. [Hyndman, Athanasopoulos — Forecasting: Principles and Practice, rozdz. 5](https://otexts.com/fpp3/toolbox.html): benchmarki i chronologiczna ocena; zastosowanie: wcześniejszy trend wyłącznie z informacji sprzed t, test braku wpływu przyszłości. Jedna kohorta nie stanowi walidacji rolling-origin ani niezależnego train/test.
2. [EventStudy — Statistical Conventions and Formula Audit, Market Adjusted Model](https://cran.rstudio.com/web/packages/EventStudy/vignettes/statistical-conventions.html): różnica zmiany aktywa i benchmarku bez dopasowania parametrów. Zastosowanie autorskie: mediana innych kart tego samego ratingu zamiast indeksu giełdowego, wyłączenie własnej karty; nie estymujemy alpha/beta, nie wyliczamy istotności i nie nazywamy tego dowodem nadzwyczajnej stopy zwrotu.
3. [MacKinlay (1997), Event Studies in Economics and Finance](https://www.bu.edu/econ/files/2011/01/MacKinlay-1996-Event-Studies-in-Economics-and-Finance.pdf): kontekst oddzielenia ruchu instrumentu od normalnego zachowania rynku. Nasze oferty FUT.GG nie są transakcjami, a sygnał nie jest egzogenicznym zdarzeniem; nie przenosimy giełdowej interpretacji przyczynowej.

Źródła sprawdzone 09.11.2026. Wyniki rozszerzają 15C o wcześniejszy trend i porównanie tego samego ratingu; nie unieważniają jego liczb i nie zastępują badania braków z wcześniejszych etapów.
