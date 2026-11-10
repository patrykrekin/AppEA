# 15J — dwa rzeczywiste konteksty i restart stanu v2

Zakres: dwie zwykłe operacje `fast` w tymczasowej kopii kodu i danych, na oddzielnej gałęzi badawczej. Bez zmiany algorytmu rekomendacji, publikacji produkcyjnej, całodobowego kolektora, R2 i GC. Poprzedni etap 15I domknięty: odtworzenie zachowanej próbki i kontrola hashy zakończyły się powodzeniem.

## Wynik rzeczywistej próby — PASS

[Uruchomienie Actions](https://github.com/patrykrekin/AppEA/actions/runs/42710787449), próba 1, sukces. Commit kodu `f0f07e5206a58c8b8f31c2beab22142b36bc7192`; początkowy commit danych `8468f34afd6e3ef20e0c8711e148105d715c1acf`. Wyzwalacz push wyłączono w `9ff75675e26bdfcc4d2d353e84ee62a9d572efe3`, przed końcem zadania.

| Sprawdzenie | PS | PC |
|---|---:|---:|
| Kwotowania na ramkę, cykl 1 / 2 | 77 / 77 | 77 / 77 |
| Kandydaci, cykl 1 / 2 | 2 / 2 | 2 / 2 |
| Odstęp pobrania paczek | 70 226 ms | 70 268 ms |
| Początkowe wiersze zachowane po restarcie | 2 | 2 |
| Zamknięte wyniki v2 | 0 | 0 |

Dwa różne procesy fast: PID 2470 i 4669. Drugi wczytał zatwierdzony zapis pierwszego; SHA256 całego łańcucha wejść, wyjść i stanów jest zgodny. Osobne ponowienie ramki 1 nie zmieniło stanu ani pliku i nie uruchamiało pobierania. Wejściowe parametry czterech istniejących sygnałów pozostały identyczne. Obie zwykłe publikacje w kopii dokładnie odpowiadają przechwyconym decyzjom i modelom. Stare modele zachowane w pamięci nie dostały nowego czasu obserwacji.

Niezależna kontrola lokalna odtworzyła modele i trwałość z przypiętego wejścia dla cyklu 1 oraz z zachowanego wyjścia 1 dla cyklu 2; następnie dokładnie odtworzyła oba wyniki adaptera, stan po restarcie i pełne podsumowanie serii. PASS. Produkcja i main nie zostały zmienione przez ten etap.

Pełny artefakt zachowano w [evidence.zip](evidence.zip): 251 113 bajtów, SHA256 `fee03b10dc9a2f9670bfbcce00249076e9992287d7cd90de20401aba5e7ac2e3`. Zawiera 22 pliki, 1 434 545 bajtów przed podsumowaniem. Oryginał Actions wygasa 12 listopada; kopia ZIP w repo zachowuje dowód. [live-result.json](live-result.json), [independent-result.json](independent-result.json) i [artifact-metadata.json](artifact-metadata.json) zawierają szczegóły.

Odtworzenie po pobraniu gałęzi (Node 24 i Python 3):

```sh
git fetch --depth 1 origin 8468f34afd6e3ef20e0c8711e148105d715c1acf
python research/stage15j/verify-evidence.py
```

Decyzja: **przyjąć mechanizm ciągłości i restartu do dalszej oceny w gałęzi badawczej**. Nie wdrażać na tej podstawie pomiaru do main ani nie publikować wskaźnika skuteczności. Następny krok powinien dotyczyć treści czterech rzeczywistych kandydatów: jakości wejścia, identyfikacji kart i podstaw wyceny, z rozdzieleniem PS/PC. Obecne dwa odczyty wystarczą do audytu ich pochodzenia; nie wymagają kolejnego pobierania ani całodobowej zbiórki.

## Protokół przed odczytem

Pierwszy proces korzysta z jednego przypiętego commitu main. Drugi korzysta dokładnie z wyjścia pierwszego procesu: SHA256 trzech plików wejściowych musi odpowiadać manifestowi poprzedniego wyjścia. Nie pobieramy świeżego main między cyklami.

Przechwycenie danych zapisuje oczekujący wynik adaptera. Plik stanu v2 jest zatwierdzany dopiero po zakończeniu zwykłego fast i sprawdzeniu zgodności opublikowanego w kopii wyniku z faktycznym kontekstem decyzyjnym. Osobny proces odczytuje pierwszy zapis i ponawia identyczną ramkę bez przeglądarki. Drugi proces fast wczytuje ten sam zatwierdzony stan, pobiera nowy kontekst i zachowuje początkowe parametry istniejących wierszy.

Odstęp pomiędzy źródłowymi odczytami: `observedAtMs₂ − observedAtMs₁`, osobno dla PS i PC, minimum 60 000 ms. To dotychczasowy minimalny odstęp dowodowy v2, bez strojenia na tej próbce. Oczekiwanie kończy się najwcześniej 60 s po zakończeniu pierwszej ramki, co jest ostrożniejsze od mierzenia odstępu od pierwszej paczki rynku. Znacznik dotyczy pobrania paczki platformy, nie czasu wystawienia pojedynczej oferty.

Zapis: plik tymczasowy, sprawdzenie oczekiwanego SHA256 poprzedniego stanu, rename, odczyt kontrolny. Jeden zapisujący w jednym zadaniu. To test restartu procesu; nie dowód odporności na utratę maszyny, brak fsync ani rozproszony CAS. Pozostały plik pending lub uszkodzony JSON zatrzymują pracę; nie usuwamy ich automatycznie.

Limity ochrony próby: 2 fast, 300 s na fast, 15 min zadania, najwyżej 60 s oczekiwania, 24 wywołania pomocnika goto na cykl, 512 KiB na ramkę, 1 MiB na plik, 4 MiB łącznie. Są ograniczeniami zasobów, nie parametrami rynku. Licznik goto nie obejmuje przeładowań platformy ani żądań zasobów przeglądarki. Brak osobnych nawigacji do kart.

## Walidacja

Offline: ledger 15G 32/32, adapter 15H 24/24, zapis i restart 15J 11/11. Zadanie przed pobraniem sprawdza również kontrolki, odświeżanie i stabilność. Historyczne wyniki starego rejestru nie są importowane ani oznaczane jako v2.

Dwie ramki od pustego stanu nie zapewniają dwóch kwalifikujących się dotknięć celu po utworzeniu sygnału. Oferty i kandydaci nie są transakcjami. Ten etap nie mierzy rentowności ani skuteczności inwestycyjnej.

## Źródła techniczne

- [Node.js 24: system plików](https://nodejs.org/docs/latest-v24.x/api/fs.html) — jawny zapis, rename i ograniczenia trwałości; nie zakładamy gwarancji fsync.
- [OpenTelemetry: model danych logów](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — rozdzielenie czasu zdarzenia i obserwacji; tutaj osobno zapisujemy pobranie paczki i zakończenie przetwarzania.
- [GitHub Actions: zdarzenia](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) — jednorazowe uruchomienie na gałęzi; wyzwalacz push usunięty po zakolejkowaniu, bez harmonogramu.
