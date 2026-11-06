# Etap: indywidualna cena historyczna — audyt i eksperyment

## Co faktycznie mamy
- `historia.json` przechowuje ok. 528 pomiarów **poziomów 83–89**, nie ceny konkretnych kart; 25 dni z danymi w okresie ~32 dni, z luką ~220 h.
- `okazje.poziomy` / `okazje.poziomyD` zawierają bieżące EMA karty, nie surową historię wszystkich notowań.
- `tier.cards` publikuje 5 kart na pasmo, a sam scraper chwilowo widzi więcej (~11). W 14 migawkach `data.json` z ~63 minut średnio 41,8% kart PS i 44,8% PC wystąpiło ponownie w następnej migawce. TYLKO 5 kart na platformę wystąpiło we wszystkich 14.
- Cena z listy najtańszych ofert **nie jest** potwierdzoną ceną transakcyjną. Karty znikające z listy są obserwacjami cenzurowanymi, nie wzrostem/spadkiem.

## Pierwszy test porównawczy — dane PASM, nie kart
Z `historia.json` przeprowadzono badanie błędu kolejnego zapisanego pomiaru:
- 14 serii: PS/PC × 7 pasm; 70% chronologicznie trening, 30% test
- tylko ciągłe okna (odcinki >= 8h, min. 8 punktów, bez luk >3h, prognoza następnego punktu <=1,5h)
- metody: ostatnia cena, EMA o półtrwaniu 11,52h, mediana 12h, średnia 50/50 EMA i mediany
- zbiór testowy: 2142 porównania pasmo–czas.

| Metoda | Średni bezwzględny błąd procentowy (MAPE), test |
|---|---:|
| Ostatnia cena pasma | 2,861% |
| Mediana 12h | 4,261% |
| Hybryda 50/50 | 4,468% |
| EMA 11,52h | 5,061% |

**Interpretacja:** dla przewidywania kolejnego odczytu pasma nie wygrywa długi poziom historyczny. NIE jest to test prognozowania zysku ani potwierdzenie przewagi konkretnego modelu *indywidualnej* wyceny. Punkty się nakładają, serie mają wspólne czynniki i wynik nie zawiera niepewności statystycznej. Nie wolno wybierać na tej podstawie strategii inwestowania.

## Co porównujemy dalej
- **EMA dobowa**: ta sama definicja czasowa co w produkcji `alpha_300 = 0,005`, `alpha(dt) = 1 - (1-0,005)^(dt/300)`.
- **Mediana 12h**: mediana obserwowanych cen tej samej karty na tej samej platformie z minionych 12h.
- **Hybryda 50/50**: wyłącznie kandydat kontrolny, bez uzasadnionych wag adaptacyjnych.
- **Ostatnia cena**: konieczny benchmark (mimo że może być pojedynczą anomalią).

### Jakość próbki i pochodzenie parametrów
W próbnym archiwum:
- próbkowanie co 10 min: 6 punktów/h, 72 możliwe punkty na 12h;
- `MIN_PROBEK=36` to prowizoryczne 50% z 72; `MIN_CZAS=8h` to 2/3 okna 12h;
- `MAX_LUKA=20min` odpowiada dwóm interwałom;
- retencja 48h to cztery okna 12h;
- każdy próg jest **hipotezą polityki jakości**, nie empirycznie zoptymalizowaną wartością.

Utracone pomiary zostają luką. Nie ma interpolacji, zer ani imputacji. Brak danych = brak poziomu, nie „niska cena”.

## Protokół walidacyjny
1. Dla każdej pary (platforma, rating, ID karty, nazwa wariantu) zapisujemy tylko rzeczywiście zaobserwowane oferty oraz czas pomiaru.
2. Rozdzielamy panele kart obecnych nieprzerwanie od kart chwilowo obserwowanych. Pokazujemy pokrycie danych osobno.
3. Liczymy na bieżąco kandydatów **bez wglądu w przyszłą próbkę**. Raportujemy błąd następnego notowania i osobno późniejszy powrót do poziomu w horyzoncie 2h i 12h.
4. Gdy kartę przestajemy widzieć, wynik jest **nierozstrzygnięty**, nie domniemane trafienie ani strata.
5. Testujemy odporność na pojedynczy odstający punkt, stopniowy spadek, zmianę reżimu oraz awarię wielogodzinną.
6. Dopiero po ocenie jakości i pokrycia porównujemy metody per OVR/platforma; nie optymalizujemy wyników na tych samych próbkach, którymi testujemy.

## Zakres wdrożenia
Nowy `scraper/lib/eksperyment-historii-kart.mjs` zapisuje odizolowany `historia-kart.json` **dopiero po zakończeniu walidacji i zapisie aktualnych cen**. Nie zmienia:
- logiki EMA, indeksu, snajperki, monitora, rejestru ani rekomendacji,
- częstotliwości crona, instalacji Chrome ani zapytań do źródeł,
- plików `data.json` i `historia.json` poza dotychczasową ścieżką.

Odtwarzanie starego stanu nie wymaga sztucznego zasiewu historii; eksperyment zaczyna od nowych, własnych odczytów. Jeśli zbiór jest niepełny, zwracamy `gotowe:false`.

### Zabezpieczenia
- izolacja PC/PS i ID; tylko ceny zgodne z bieżącą siatką;
- próbkowanie i 48h retencji ogranicza rozmiar;
- weryfikacja na CI i w izolowanym pełnym fast;
- awaria eksperymentu NIE blokuje publikacji cen.
- GitHub przechowuje wersje historyczne pliku w commitach; zmiana retencji logicznej nie kasuje automatycznie starych blobów Git, dlatego retencję i przyrost repo trzeba monitorować.

**Uwaga:** wskazania wartości referencyjnej z tego modułu nie są jeszcze publikowane w interfejsie. To badanie przed wdrożeniem kolejnej definicji ceny historycznej.
