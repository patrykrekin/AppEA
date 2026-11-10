# 15B — ograniczony audyt rzeczywistych decyzji

8 listopada 2026. PASS dla odtworzenia kontraktu jednej historycznej migawki. Skuteczność inwestycyjna: NIEBADANA.

## Pochodzenie i izolacja

Baza audytu: main `67837b4a0833ea7f224693cb8fa32cfc9723d06b`. Poprzedni etap: raport 15A.2 oraz bezpośrednio potwierdzony status success runu [42507330286](https://github.com/patrykrekin/AppEA/actions/runs/42507330286), SHA `47c08c947604c369de9e903b0730d630e0ffc1e0`. Otwarty offsite backup nie zostaje zamknięty tym audytem.

Wybrano istniejący artefakt zamiast nowego scrapingu: [run etapu 8](https://github.com/patrykrekin/AppEA/actions/runs/42408574206), artifact ID 13588009799, kod `d27061cdb6d662fad2ff153ac63f19739532dfd1`. Archiwum ZIP ma 7309 B, SHA256 `56df706e5242c3a88ca578fa2688106266d5b555d5d6fd6f567fb69aa9fb2dfb`, zgodny z digest GitHub. Zawiera wyłącznie migawkę i poprzednie podsumowanie; brak oddzielnego data.json. Kopia JSON w input zachowuje oryginalne bajty. Czas decyzji: 7 listopada 2026, 20:56:08 Europe/Warsaw (Unix 1794081368 s). To nie bieżące ceny.

Limit: jedna migawka, plik wejściowy <=65536 B, bez sieci w skrypcie, bez R2 i bez zmian produkcji. Wynik zapisany tylko w katalogu badania. Moduł okazje.mjs porównano bajtowo z kodem etapu 8: zgodny. Runtime lokalny Node 24.22.1.

## Wynik i formuły

| Miernik z migawki | Konsola | PC |
|---|---:|---:|
| Wiersze koszyka 83–89 | 77 | 77 |
| Szybkie sygnały: suma flag kolumny 13 | 4 | 1 |
| Inwestycje: suma flag kolumny 14 | 4 | 2 |
| Odtworzone inwestycje zgodne z flagami i cenami docelowymi | 4/4 | 2/2 |
| W zasięgu: liczba inwestycji z cena <= kupnoDo | 3 | 2 |

Weryfikacja: odtworzono bands, EMA pre-update i trwałość z wierszy; uruchomiono niezmienione policzOkazje i policzInwestycje. Porównano pełne zbiory kluczy sygnałów, cele i limity, chronologię EMA, siatkę cen i brak mutacji pliku. Wyliczenie celu: listBelow(EMA dobowa przed odczytem); limit: snapDown(floor(cel*0.95/1.05)). Jednostka cen: monety; współczynniki podatku 5% i marży 5% pochodzą z istniejącego kodu, nie są nową kalibracją ani nową weryfikacją reguł EA.

Przypadek Pajor 89/konsola: obserwowana cena 106000, cel 113000, kupnoDo 102000 monet. Flaga inwestycji=1, ale wzasiegu=false. Warunkowa marża przy zakupie po obserwowanej cenie: (113000*0.95-106000)/106000*100 = ok. 1.27%, poniżej 5%. To poprawne rozróżnienie kandydata i możliwości zakupu, nie wykazany błąd algorytmu. Nie jest to zrealizowany zwrot.

## Granice dowodu

- Brak data.json w ZIP: nie powtarzamy niezależnej zgodności z publikacją; poprzednie podsumowanie nie jest drugim niezależnym źródłem.
- Brak czasu ostatniej aktualizacji trwałości tr.t. W rekonstrukcji wpisano czas decyzji, pole nie jest używane przez policzInwestycje. Nie potwierdza to wcześniejszego filtra świeżości trwałości.
- Brak surowego wejścia przed filtrami, więc nie sprawdzono poprawności odrzucania kart na wcześniejszych etapach. Replay potwierdza zgodność z tą samą logiką, nie jej ekonomiczną optymalność.
- Jedna migawka nie pozwala liczyć skuteczności, czasu do celu, sprzedaży ani rolling-origin. Brak późniejszej karty w rankingu nie jest transakcją. Nie dopasowywano progów i nie zmieniono rekomendacji.

## Decyzja i dalsza praca

15B zamknięty w zakresie jednorazowego audytu kontraktu istniejącej próbki. Nie uruchamiać stałego kolektora na podstawie tego wyniku. Następny eksperyment powinien sprawdzić kompletność istniejących następczych obserwacji dla tych samych tożsamości i platform; zanim policzymy wyniki, zamrozić horyzont, tolerancję czasu oraz sposób oznaczania braków. Gdy brak danych, raportować nieobserwowalność zamiast dopisywać sukces/porażkę.

Źródła metodologii (sprawdzone 08.11):

1. [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — rozdzielenie czasu zdarzenia i czasu jego obserwacji; zastosowanie: zachować czas pierwotnej decyzji, nie zastępować czasem audytu.
2. [Hyndman, Athanasopoulos: Forecasting, rozdział 5](https://otexts.com/fpp3/toolbox.html) — chronologiczna walidacja i benchmarki; zastosowanie dopiero po uzyskaniu serii następczych obserwacji. Nie przedstawiać tej migawki jako backtestu.

Uruchomienie: `node research/stage15b/audit.mjs`. Dodatkowa kontrola istniejącej arytmetyki: `node scraper/tliczby.mjs` — PASS. Wyniki liczbowe i hash źródła: result.json.
