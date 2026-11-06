# Audyt metod wyceny historycznej — uczciwe porównanie 2h (6 XI 2026)

> **Status: badanie OFFLINE, wyłącznie na ofertach z FUT.GG.** Nie stanowi walidacji ceny sprzedaży, zwrotu z inwestycji ani produkcyjnej EMA. Bez zmian w scraperze, indeksie, rekomendacjach, cronach czy archiwum. Zasady współpracy i punkt wznowienia: [START_TUTAJ_ANALITYKA.md](START_TUTAJ_ANALITYKA.md).

## 1. Cel i źródło danych

Sprawdzić, czy pozorna przewaga ostatniej ceny nad EMA/medianą wynika z nierównego dostępu do informacji i czy porównanie jest odporne na różne ważenie obserwacji, niewielką próbę i współzależne prognozy.

- **Zamrożona migawka**: [commit `b745843bba39ea29d06ec397dbf20638e0f4ba01`](https://github.com/patrykrekin/AppEA/commit/b745843bba39ea29d06ec397dbf20638e0f4ba01), `historia-kart.json` blob `a361dc2b96f7eef96570713cc9aa64d0593297e3`; `at=1794000506` (2026-11-06 21:28:26 UTC). Arkusz ma 81 migawek/rynek od 06:38:32 UTC (~14,8h).
- 351 różnych kart w konsoli i 448 PC w retencji. Surowe notowania to *wskazania ofert / odczytany wycinek listy*. Rynek jest selektywnie obserwowany.
- **Wymagania wejściowe**: przed t co najmniej 36 próbek w przedziale `[t-43200, t)`, obejmujących >=28800 s, maksymalna luka <=1200 s i ostatni pomiar przed t <=1200 s. Pochodzenia prognoz co >=3600 s na kartę (wariant kontrolny co >=7200 s). Nie obniżamy tych progów, żeby sztucznie zwiększyć liczebność.
- Wspólny dostęp do danych w chwili t: ostatnia cena `p(t)`; mediana z `[t-43200, t]`; eksperymentalna EMA liczona na tych samych notowaniach, inicjalizowana pierwszą ceną okna i aktualizowana wagą `alpha(delta)=-expm1(log1p(-0.005)*delta/300)`; hybryda `(mediana+EMA)/2`.
- Wynik dla t+2h: wybieramy rzeczywiście obserwowaną cenę tej samej karty najbliżej `t+7200` w tolerancji ±900 s. Jeżeli `at < t+h+900`, prognoza oczekuje; gdy nie ma obserwacji w oknie, status brak wyniku. **Nie imputować ceny.**
- Błąd pojedynczej prognozy: `APE = 100*abs(prognoza - pozniejsza_obserwacja)/pozniejsza_obserwacja`. Agregacja **micro**: średnia APE po pochodzeniach; **macro**: najpierw średnia APE w obrębie karty, następnie średnia po kartach. Ta druga wersja ogranicza dominację kart z większą liczbą pochodzeń.

## 2. Kontrola chronologii i reprezentatywności

| Metryka | Konsola | PC |
|---|---:|---:|
| Pochodzenia dla h=2h | 230 | 201 |
| Oczekujące | 67 | 55 |
| Dojrzałe, ale bez późniejszej wyceny | 0 | 0 |
| Rozliczone w 2h (wśród selektywnie dostępnych) | **163** | **146** |
| Różne karty z rozliczeniem | **35** | **30** |
| Rozliczone dla h=12h | **0** | **0** |

**Krytyczne ograniczenie:** poprawne wyniki istnieją tylko dla ratingów PS 88/89/90/92/93 i PC 89/90/92/93. Brak nawet jednej weryfikowalnej karty ratingu 83–87 przy tym filtrze. Wszystkie rozliczenia mogą być silnie selekcyjne: wymagamy wcześniejszej ciągłości i późniejszego ponownego zobaczenia karty. Brak dowodu reprezentatywności rynku, mimo zerowego licznika „brak kolejnego notowania” w tej wąskiej kohorcie.

## 3. Wyrównanie informacji — wynik, MAPE w procentach

| Metoda | PS micro | PC micro | PS macro po kartach | PC macro po kartach |
|---|---:|---:|---:|---:|
| Ostatnia cena p(t) | **3,383** | 4,168 | **3,515** | 4,082 |
| Mediana 12h + p(t) | 3,707 | **4,144** | 3,628 | **4,055** |
| EMA shadow + p(t) | 4,032 | 4,641 | 4,099 | 4,562 |
| Hybryda + p(t) | 3,817 | 4,373 | 3,733 | 4,285 |

Na PC różnica micro MAPE mediany wobec ostatniej ceny to **−0,024 p.p.**, po kartach **−0,027 p.p.** — minimalna i niestabilna. Nie wybrano zwycięzcy.

**Eksploracyjny bootstrap grupowany po kartach** (3 000 replikacji, stałe ziarno 2654435761, różnica `mediana - ostatnia` przy macro): PS **+0,114 p.p.** (percentylowy zakres 95% od −0,493 do +0,767 p.p.); PC **−0,027 p.p.** (od −1,260 do +1,200 p.p.). Zakładamy niezależność klastrów-kart, ale pomijamy wspólne szoki rynkowe i dobór selekcyjny; **nie są to solidne przedziały dla całej populacji rynku i nie dowodzą równoważności metod**.

## 4. Test odporności — rzadsze pochodzenia (co >=2h, bez nakładania okien w obrębie karty)

| Platforma | Karty | Wyniki | Ostatnia micro | Mediana micro | Ostatnia macro | Mediana macro |
|---|---:|---:|---:|---:|---:|---:|
| PS | 35 | 99 | **3,320** | 3,571 | **3,434** | 3,513 |
| PC | 30 | 88 | **3,675** | 4,520 | **3,608** | 4,443 |

**Wniosek:** po usunięciu nakładania w pojedynczej karcie zmienia się kierunek mikroprzewagi na PC. To test wrażliwości, nie osobny zbiór out-of-sample (mamy te same karty i podobne godziny rynku).

Dodatkowo, rozcinając bieżące próby PC na wcześniejsze i późniejsze pochodzenia, średnia po kartach różnica `mediana - ostatnia` zmienia się z **−0,495 p.p.** we wcześniejszej części na **+0,690 p.p.** w późniejszej. Podział został wykonany diagnostycznie i nie stanowi walidacji temporalnej nowych wag.

## 5. Wynik oddzielnie po ratingach — micro MAPE (wariant pochodzeń co 1h)

| Rating | PS: karty (odczyty) | PS: ostatnia / mediana | PC: karty (odczyty) | PC: ostatnia / mediana |
|---|---:|---:|---:|---:|
| 88 | 3 (7) | 3,349 / 3,846 | brak | — |
| 89 | 11 (55) | 3,813 / 4,977 | 10 (50) | 3,412 / 4,228 |
| 90 | 10 (50) | 3,152 / 3,428 | 11 (55) | 3,993 / 4,433 |
| 92 | 10 (46) | 3,119 / **2,683** | 8 (36) | 4,777 / **3,507** |
| 93 | 1 (5) | 3,424 / 1,758 | 1 (5) | 9,279 / 4,712 |

W tej próbie niższe z dostępnych ratingów (89–90) częściej sprzyjają ostatniej cenie, a 92 medianie, ale podgrupy są małe, krótkotrwałe i obciążone wielokrotnym analizowaniem tych samych danych. **Nie wdrażamy reguł „per rating”.**

## 6. Dwie oddzielne interpretacje: prognoza a sygnał transakcyjny

Nie wolno mylić *przewidywania ceny w t+2h* z *historyczną bazą do wykrycia przeceny*. Produkcyjny sygnał korzysta z poziomu **sprzed bieżącego odczytu**, żeby aktualna tania oferta nie obniżyła automatycznie progu swojej oceny. To jest celowe i nie jest błędem algorytmu.

Kontrola „tylko informacje sprzed t” (benchmark **poprzednia** obserwacja zamiast p(t), obok starej mediany i EMA):
- PS micro MAPE: poprzednia cena **3,669%**, mediana 3,725%, EMA 4,056%; ostatnia p(t), dla porównania, 3,383%.
- PC micro MAPE: poprzednia cena **3,597%**, mediana 4,184%, EMA 4,668%; ostatnia p(t): 4,168%.

Na PC poprzednia obserwacja w tej próbie prognozuje cenę za 2h lepiej od obecnej, co stanowi **hipotezę o chwilowych wahaniach ofert**, nie dowód możliwości zysku. Dane nadal mają bias selekcji.

## 7. Ważne ograniczenie: EMA shadow ≠ EMA produkcyjna v3

W `scraper/lib/jakosc-historii-kart.mjs` / `eksperyment-historii-kart.mjs` EMA eksperymentalna jest liczona od pierwszego punktu **12-godzinnego wycinka**. Używa tej samej czasowej funkcji `alpha`, ale nie odtwarza pełnego stanu rzeczywiście użytego w rekomendacji.

W produkcji `scraper/lib/okazje.mjs` funkcja `aktualizujPoziomyD`:
- przy świeżej obserwacji aktualizuje poprzedni stan przez `alfaZaCzas(ALFA_D, delta)`;
- po przerwie >2h lub zmianie tożsamości inicjalizuje poziom od nowa, potencjalnie **z szybkiej EMA**, a nie z pierwszej surowej ceny;
- w decyzji transakcyjnej używa stanu sprzed obecnego odczytu, z dodatkowym filtrem ciągłości/trwałości.

Dlatego **nie wolno interpretować błędów shadow EMA (4,032% PS; 4,641% PC) jako walidacji lub porażki produkcyjnej EMA v3**. Rzetelny test jej realnej skuteczności potrzebuje archiwalnych stanów poziomu, wieku, identyfikatora i definicji **w chwili decyzji**, nie rekonstrukcji z niepełnego szeregu.

## 8. Decyzja i następny krok

- **Brak jakiejkolwiek zmiany produkcji.** Nie optymalizować na tej próbce parametrów `ALFA_D`, 12h, wag hybrydy, progów inwestycyjnych ani per-rating.
- Dalsza ocena porównawcza będzie możliwa dopiero po poszerzeniu obserwowalności, ze szczególnym naciskiem na ratingi 83–87 i rzeczywiście rozliczalny horyzont dłuższy niż 2h.
- **Najbardziej wartościowy kierunek techniczny:** projekt pasywnego, minimalnego zapisu *faktycznego stanu poziomu produkcyjnego przed decyzją* (item ID, platforma, t, cena, EMA szybka/dobowa, wersja definicji i status obserwowalności), bez dodatkowych requestów FUT.GG. Projektować i testować osobno; nie włączać bez kontroli rozmiaru pliku, retencji, niezmienności rekomendacji i konfliktów zapisu.
- Raport pozostaje **badaniem opisowym cen dostępnych w rankingu**, a nie testem skuteczności kupna/sprzedaży.

### Uzasadnienie metodyczne (2 źródła)

1. Hyndman RJ, Athanasopoulos G. *Forecasting: Principles and Practice*, 3rd ed. [Time series cross-validation, §5.10](https://otexts.com/fpp3/tscv.html). Uzasadnia rolling-origin, wyłącznie przeszłe dane przy prognozowaniu i określony horyzont oceny.
2. Deen M, de Rooij M. [ClusterBootstrap: An R package for the analysis of hierarchical data using generalized linear models with the cluster bootstrap](https://pmc.ncbi.nlm.nih.gov/articles/PMC7148287/). *Behavior Research Methods*, 2020. Uzasadnia uwzględnianie skorelowanych powtórzeń przez resampling na poziomie obiektu (tutaj karty), bez twierdzenia, że sama ta procedura rozwiązuje selekcję FUT.GG.

**Weryfikacja wewnętrzna:** wyniki metod zrekonstruowano na zamrożonym archiwum; pierwsza tabela replikuje poprzedni szybki audyt dla t-inclusive. Zmiana odstępu pochodzeń oraz porównanie „przed t” są testami wrażliwości. Nie uruchamiano dodatkowych odczytów rynku.
