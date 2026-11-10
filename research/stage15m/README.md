# 15M — czy archiwum wystarczy do porównania prognoz?

**Tak, do ograniczonego badania odtworzonego modelu; nie do wiernego backtestu produkcyjnej EMA ani skuteczności inwestycji.** Inwentaryzacja zakończona PASS, bez obliczania błędów prognoz i bez nowych odczytów rynku. Etap 15L domknięty: wynik UI PASS, SHA256 HTML i zachowanych obrazów zgodny. Poprawka UI nadal znajduje się na gałęzi badawczej; ten etap jej nie wdraża.

## Zamrożone źródło

`historia-kart.json` z commitu `8468f34afd6e3ef20e0c8711e148105d715c1acf`, tego samego wejścia co 15J. SHA256 `56d1f9513bc8232261e101329a70c46d7fae8b491a24b43890c4a79957199d99`, 1 256 201 bajtów. Nie użyto bieżącego pliku z checkoutu ani nowego main.

Zakres: **7 listopada 23:20:49 – 9 listopada 23:12:29, czas polski**, 172 300 s (47,86 h). Łącznie 64 400 obserwacji cen: PS 32 460 z 333 serii, PC 31 940 z 349 serii. Po 261 zapisów zakresu pasm na platformę, maksymalny odstęp między nimi 1 013 s. Klucz jest sprawdzany jako `rating|id|nazwa`, platformy pozostają rozdzielone. Wszystkie punkty są uporządkowane, dodatnie, na istniejącej siatce cen kodu i nie pochodzą z czasu po znaczniku archiwum.

Zakres pasm archiwum jest szerszy od produkcyjnego koszyka 83–89. Dlatego niżej oddzielamy wynik dla tego koszyka. Archiwum zawiera oferty wybranych najtańszych kart w pasmach, nie pełny rynek i nie transakcje.

## Warunki ustalone przed policzeniem dostępności

[protocol.json](protocol.json) zachowuje parametry i ich pochodzenie:

- Historia w oknie `[t − 43 200, t]` s: minimum 36 punktów, co najmniej 28 800 s rozpiętości, żadna przerwa ponad 1 200 s. To dotychczasowe 12 h / 36 / 8 h / 20 min z `eksperyment-historii-kart.mjs`, bez dopasowania tutaj.
- Początek prognozy to każdy zapisany odczyt karty; nie tylko cztery sygnały z 15K. Okno obejmuje ten odczyt i nie korzysta z punktów po t. Dopuszczenie wymaga dowodu poprawnie pobranego pasma dla każdego punktu oraz braku jawnej nieobecności karty w pobranych pasmach wewnątrz okna.
- Późniejsza cena: najbliższy punkt do `t + 7 200 s`, w tolerancji ±900 s, przy remisie wcześniejszy. To dotychczasowy horyzont 15C/15D, bez zamiany karty, platformy lub interpolacji.
- Sama cena końcowa nie dowodzi ciągłości. Osobno liczymy dostępność późniejszej ceny oraz serię bez przerwy ponad 1 200 s i bez jawnej nieobecności karty do wybranego punktu końcowego. „Ciągłość” oznacza tutaj wyłącznie ciągłość próbkowanej serii według tych reguł, nie stałą dostępność ofert pomiędzy odczytami.

Podział czasu: `cutoff = floor(t_min + 2/3 × (t_max − t_min))`, czyli **9 listopada 07:15:15**. Pochodzenie proporcji 2/3: jawny roboczy wybór dla inwentaryzacji, bez strojenia według wyników; nie jest progiem produkcyjnym ani ustaleniem naukowym. Wcześniejsze początki należą do train tylko, gdy `t + 8 100 < cutoff`; pomiędzy nimi a cutoff jest odstęp ochronny 8 100 s = 2 h + 15 min. Wszystkie etykiety train muszą kończyć się przed cutoff. Test zaczyna się od cutoff. Późniejszy model może uczyć się z obserwacji znanych już w danym t, także z wcześniejszej części testu, bez korzystania z cen następujących po t.

Archiwum było już oglądane w poprzednich etapach. Nazwy train/test opisują chronologię, nie nowy, nietknięty zbiór potwierdzający. Nie szukamy na tej części najlepszej alfy ani horyzontu.

## Wynik dla koszyka 83–89

Liczby oznaczają początki prognoz dla kart, nie niezależne próby. Okna na tej samej karcie nakładają się, a oba rynki mogą dotyczyć tych samych profili.

| Rynek / część | Wszystkie początki | Dopuszczona historia | Dostępna cena późniejsza | Ciągłość próbkowanej serii | Liczba serii z taką ciągłością |
|---|---:|---:|---:|---:|---:|
| PS train | 12 397 | 1 766 | 1 764 | 1 684 | 21 |
| PS odstęp ochronny | 924 | 198 | 198 | 192 | 16 |
| PS test | 6 776 | 1 291 | 1 159 | 1 109 | 17 |
| PC train | 12 397 | 1 433 | 1 433 | 1 375 | 17 |
| PC odstęp ochronny | 924 | 138 | 138 | 132 | 11 |
| PC test | 6 776 | 1 023 | 911 | 891 | 13 |

Na PS w części testowej 50 początków z dostępną ceną końcową zawiera jawną nieobecność w obserwowanym paśmie; 130 dopuszczonych początków nie ma pełnego horyzontu z powodu końca archiwum, a 2 nie mają dopasowanego endpointu mimo wystarczającego zakresu czasowego. Na PC odpowiednio 20 jawnych nieobecności i 112 przypadków końca archiwum. Nie wolno liczyć ich jako porażki lub sukcesu sprzedaży.

W całym archiwum historia przechodzi bramki dla PS 8 471, PC 6 090 początków. Zestawienie przyczyn jest sekwencyjne: pierwszy niespełniony warunek, nie suma wszystkich jednoczesnych problemów. PS: 14 727 za mało punktów, 486 za krótka rozpiętość, 8 766 za duża luka, 10 jawna nieobecność. PC: 16 001 za mało punktów, 427 za krótka rozpiętość, 9 422 za duża luka. Szczegóły per rating i podział czasu: [result.json](result.json).

## Co można badać

Można przygotować chronologiczne porównanie **dwóch pomocniczych prognoz ceny ofertowej za 2 h**, na tych samych obserwacjach i z raportem braków:

1. Naiwna: ostatnia znana cena karty z chwili t.
2. EMA12: odtworzona wyłącznie z dopuszczonego okna do t, z zasianiem pierwszą ceną tego okna i dotychczasową wagą `alpha(dt) = 1 − (1 − 0,005)^(dt/300)`.

Nie wykonano tu jeszcze tego porównania. W następnym eksperymencie należy zamrozić sposób agregacji błędów, pokazać wynik per platforma i per karta oraz oba warianty pokrycia: dostępny endpoint i bardziej restrykcyjną ciągłość. Agregacja po wszystkich punktach nadawałaby większą wagę kartom długo pozostającym w rankingu. Należy zachować anomalie jako dane z osobnym opisem wrażliwości, a nie usuwać ich po zobaczeniu wyniku.

**Nie można nazwać tego odtworzeniem rekomendacji produkcyjnych.** Produkcyjna EMA korzysta z dokładniejszych odczytów fast, innego stanu początkowego i pamięci sprzed 12 h. Archiwum zapisuje co najmniej 10-minutową próbkę, nie zachowuje każdej aktualizacji ani historycznego stanu i licznika trwałości w każdym t. Użycie obecnej EMA do dawnych punktów byłoby wykorzystaniem informacji z przyszłości. EMA12 jest modelem pomocniczym, nie zamiennikiem rzeczywistych celów z 15K. Wyższa trafność prognozy ceny również nie oznacza możliwości zakupu i sprzedaży z zyskiem.

## Weryfikacja i odtworzenie

Inwentaryzacja kontroluje SHA256, klucze, kolejność, brak punktów z przyszłości, siatkę cen oraz dowody zakresu pasm. Pięć kontroli okna obejmuje minimalny poprawny przypadek, niezmienność po dopisaniu przyszłej ceny, zbyt krótki zakres, za dużą lukę i za mało punktów. Dodatkowo sprawdzono odcięcie etykiet train przed cutoff i zgodność sum początków. Każdy początek ma deterministyczną klasyfikację; digest pełnego indeksu kwalifikacji zapisano w JSON, co pozwala sprawdzić identyczność ponownego odtworzenia bez publikowania kolejnej kopii 64 400 rekordów.

```sh
git fetch --depth 1 origin 8468f34afd6e3ef20e0c8711e148105d715c1acf
node research/stage15m/inventory.mjs
```

Node 24. Skrypt odczytuje przypięty obiekt Git lokalnie i zapisuje wynik badania; nie pobiera stron, nie uruchamia przeglądarki, workflow ani R2. Produkcja i dane rynkowe pozostają bez zmian. Wszystkie pliki etapu są w `research/stage15m`.

## Źródło metodyczne i porównanie z poprzednimi etapami

[Hyndman i Athanasopoulos, Forecasting: Principles and Practice, rozdział 5, sekcje 5.2, 5.8 i 5.10](https://otexts.com/fpp3/toolbox.html): proste benchmarki, ocena poza dopasowaniem i przesuwanie początku prognozy z zachowaniem kolejności czasu. Adaptacja: naiwna cena jako punkt odniesienia, chronologiczny podział i osobna ewidencja braków. Parametry dostępności pochodzą z naszego wcześniejszego kodu, a horyzont z 15C/15D — podręcznik ich nie waliduje dla rynku EA.

15C/15D opisywały późniejsze ceny jednej zamrożonej kohorty. 15J/15K potwierdziły pochodzenie i rachunki czterech sygnałów, bez zamkniętych wyników. 15M rozszerza inwentaryzację na wszystkie zapisane obserwacje, ale nie zamienia jej w dowód skuteczności. **Decyzja: dopuścić ograniczony eksperyment EMA12 kontra naiwna cena na archiwum, bez zmiany algorytmu i bez nowego kolektora.**
