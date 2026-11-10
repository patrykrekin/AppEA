# 15K — audyt jakości czterech rzeczywistych kandydatów

**Wynik: zgodność rachunkowa i pochodzenie danych PASS; brak podstaw do oceny skuteczności.** Audyt wykonano 10.11.2026 na próbce z 09.11.2026, bez nowego pobrania rynku. Poprzedni etap 15J domknięty: ponowne niezależne odtworzenie zachowanego ZIP zakończyło się PASS.

## Co rzeczywiście pokazywały sygnały

Kwoty w monetach. Wyniki netto są wyłącznie scenariuszem: zakup po pokazanej cenie i sprzedaż po modelowym celu, przy założeniu podatku 5% z istniejącego kodu. Nie są zrealizowanym zyskiem. Drugi odczyt nastąpił około 70 s po pierwszym; tabeli nie należy czytać jako bieżącej rekomendacji.

| Rynek / karta | Cena 1 → 2 | Limit zakupu | Cel | W limicie 1 / 2 | Pokazany zwrot od limitu | Scenariusz od ceny 1 → 2 |
|---|---:|---:|---:|---|---:|---:|
| PS / Kvaratskhelia 89 | 44,250 → 44,000 | 45,500 | 50,500 | tak / tak | 5.4% | 8.42% → 9.03% |
| PS / Pajor 89 | 93,000 → 90,000 | 88,500 | 98,000 | nie / nie | 5.2% | 0.11% → 3.44% |
| PC / Kvaratskhelia 89 | 28,500 → 29,000 | 27,750 | 30,750 | nie / nie | 5.3% | 2.50% → 0.73% |
| PC / Šašić 89 | 44,750 → 44,750 | 44,500 | 49,250 | nie / nie | 5.1% | 4.55% → 4.55% |

Tylko Kvaratskhelia PS był w limicie w obu ramkach. Pajor PS wymagała spadku z 93 000 do 88 500 monet przy pierwszym odczycie, a po drugim nadal była 1 500 monet ponad limitem. Kvaratskhelia PC była ponad limitem o 750, następnie 1 250 monet. Šašić PC pozostawała 250 monet ponad limitem. Zatem trzy sygnały oznaczały oczekiwanie na tańszy zakup, nie zakup z zakładaną marżą już przy cenie z paczki.

Pole `zwrot` jest wyliczone od `kupnoDo`, nie od `cena`. Dla Pajor PS w pierwszej ramce pokazane 5,2% odpowiada zakupowi za 88 500. Przy zakupie za 93 000 i tym samym celu 98 000 scenariusz daje tylko 100 monet, około 0,11%. To istotna różnica interpretacji; ten etap nie zmienia interfejsu ani algorytmu.

## Pochodzenie i warunki dopuszczenia

Każdy z 8 zapisów decyzji (4 kandydatów × 2 ramki) ma dokładnie jeden odpowiednik o zgodnej platformie, nazwie, ratingu i ID w paczce źródłowej. ID w modelu EMA i liczniku trwałości odpowiada ID karty; adres źródłowy zawiera ten sam profil oraz identyfikator wersji 27. Dla tych kandydatów nie ma drugiego wystąpienia profilu w pasmach platformy. Kvaratskhelia PS i PC mają ten sam profil, ale osobne ceny, modele i klucze — rynki nie zostały połączone. Jest to kontrola zgodności wewnętrznej zachowanego źródła; nie niezależna walidacja tożsamości w EA lub drugim serwisie.

| Rynek / karta | Licznik EMA w ramce 1 | Wiek modelu w h | Wiek ostatniej aktualizacji w s | Trwałość pod progiem w min / licznik |
|---|---:|---:|---:|---:|
| PS / Kvaratskhelia | 2878 | 96.81 | 50 | 237.95 / 119 |
| PS / Pajor | 46 | 4.30 | 50 | 58.57 / 31 |
| PC / Kvaratskhelia | 2878 | 96.81 | 50 | 52.90 / 28 |
| PC / Šašić | 2878 | 96.81 | 50 | 32.82 / 18 |

Wszystkie spełniają aktualne bramki kodu: co najmniej 24 odczyty i 7 200 s wieku EMA, ostatnia aktualizacja nie starsza niż 7 200 s, przecena co najmniej 5% i 3 kroki siatki, co najmniej 6 kolejnych odczytów pod progiem oraz 1 500 s od początku tej serii. Pierwsza ramka używa modelu sprzed cyklu; druga używa wyjścia poprzedniego cyklu. Brak użycia przyszłej ceny do pierwszej decyzji.

Liczniki 2 878 i wiek około czterech dni są zastanym podsumowaniem modelu. Nie dysponujemy w tej próbce każdym historycznym odczytem, więc nie potwierdzamy ciągłości całego okresu ani rzeczywistej dostępności ofert przez wskazany czas. Wiek modelu i liczba aktualizacji nie są oceną jakości prognozy.

## Jawne rachunki i jednostki

Źródło wszystkich parametrów: niezmienione `scraper/lib/okazje.mjs` i `scraper/lib/grid.mjs` z gałęzi 15J. `audit.mjs` ponownie odtwarza listę decyzji oraz niezależnie sprawdza arytmetykę dla wszystkich 8 zapisów.

- Rabat [%]: `100 × (1 − cena / poziomEMA)`, w decyzji zaokrąglony do 0,1 punktu procentowego.
- Cel [monety]: `listBelow(poziomEMA)`. Funkcja najpierw zaokrągla EMA w dół do siatki, potem wybiera kolejną cenę poniżej. Nie jest to najbliższa cena siatki poniżej niecałkowitej EMA. Przykład PS Kvaratskhelia: EMA 51 420,6569 → 51 000 → cel 50 500.
- Limit [monety]: `snapDown(floor(cel × 0,95 / 1,05))`. Współczynnik 1,05 oznacza istniejącą wymaganą marżę 5%.
- Pokazane netto [monety]: `round(cel × 0,95 − limit)`; pokazany zwrot [%]: `100 × pokazaneNetto / limit`, do 0,1 p.p.
- Scenariusz przy cenie paczki [monety]: `cel × 0,95 − cena`; zwrot scenariusza [%]: `100 × scenariuszNetto / cena`. Tabela pokazuje do 0,01 p.p.; wynik JSON zachowuje pełną precyzję.
- Wiek modelu [s]: `cycleAt − model.od`; nieaktualność [s]: `cycleAt − model.t`; trwałość [s]: `cycleAt − trwałość.od`.

Dla celów 30 750 i 49 250 wzór 0,95 daje połówki monety. Obecny kod zaokrągla netto do całych monet, np. 1 462,5 → 1 463. W JSON pokazujemy obie wartości. Nie potwierdzamy tu, czy rozliczenie podatku w grze stosuje dokładnie tę samą kolejność zaokrągleń. Siatka i podatek są założeniami istniejącego kodu, bez ponownej weryfikacji w grze; różnicy pół monety nie należy mylić z dokładnym zyskiem transakcyjnym.

## Co przyjmujemy, co pozostaje hipotezą

Przyjmujemy cztery sygnały jako poprawnie odtworzone, warunkowe kandydatury. Odrzucamy interpretację, że wszystkie cztery były dostępne do zakupu z pokazywaną marżą. Nie znaleziono w tej próbce niezgodności ID ani przecieku danych pomiędzy platformami.

Cel jest poziomem odniesienia pochodzącym z wygładzonej historii ofert. Nie znamy prawdopodobieństwa powrotu do niego, terminu powrotu ani dostępnego wolumenu. Dwie ramki nie weryfikują hipotezy powrotu ceny; EMA nie stanowi sama w sobie dowodu niedowartościowania. Próbka obejmuje 77 wybranych kwotowań na platformę, nie pełny rynek. Nie stroimy na tych czterech kandydatach parametrów i nie prezentujemy testu rentowności.

Decyzja wdrożeniowa: **pozostawić produkcję bez zmian**. Kolejny izolowany krok: audyt prezentacji `zwrot`, `netto` i `wzasiegu` w interfejsie, aby sprawdzić, czy użytkownik widzi warunek zakupu po limicie. Ewentualna poprawka powinna dotyczyć jasności opisu, bez zmiany selekcji i wyceny. Ocena skuteczności wymaga osobnego protokołu danych poza próbą i porównania z naiwną prognozą utrzymania ostatniej ceny, bez dopasowywania progu na tej próbce.

## Dwa źródła porównawcze

1. [Hyndman i Athanasopoulos, Forecasting: Principles and Practice, rozdział 8](https://otexts.com/fpp3/exponential-smoothing.html): wygładzanie opiera się na ważonej historii; SES daje prognozy płaskie i ma ograniczenia przy trendzie. Adaptacja: EMA traktujemy jako odniesienie, a nie potwierdzony cel powrotu. Nowe metody wymagają oceny prognoz poza próbą; źródło nie uzasadnia naszych progów 5% ani 3 kroków.
2. [SEC / Investor.gov, Limit Orders](https://www.investor.gov/introduction-investing/investing-basics/glossary/limit-orders): rozróżnienie ceny limitu i ceny realizacji. Adaptacja wyłącznie pojęciowa: `kupnoDo` jest warunkiem kalkulacji. AppEA nie składa zlecenia, a FUT.GG pokazuje oferty; zgodność ceny z limitem nie potwierdza wykonania zakupu. Nie przenosimy mechaniki giełdowej na rynek EA.

## Odtworzenie

```sh
python research/stage15j/verify-evidence.py
node research/stage15k/audit.mjs
```

Pierwsza komenda wymaga przypiętego obiektu Git danych wskazanego w README 15J; druga sprawdza zachowany ZIP i generuje [result.json](result.json). Node 24, Python 3. Bez sieci podczas audytu, bez nowego workflow i bez importowania starego rejestru. Zmiany tego etapu ograniczają się do katalogu `research/stage15k`.
