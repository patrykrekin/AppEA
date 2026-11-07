# Etap 10 — odporność magazynu watchlisty, retry i awarii

**Data: 7 XI 2026. Status: test lokalny OFFLINE, bez produkcyjnego wdrożenia, bez nowego workflow i bez połączenia do FUT.GG.**

> Punkt wznowienia: [START_TUTAJ_ANALITYKA.md](START_TUTAJ_ANALITYKA.md) · Rejestr: [REJESTR_ZRODEL_BADAWCZYCH.md](REJESTR_ZRODEL_BADAWCZYCH.md) · Analiza retencji: [AUDYT_RETENCJA_HYBRYDOWA_20261107.md](AUDYT_RETENCJA_HYBRYDOWA_20261107.md).

## 1. Pytanie i kryteria

W etapie 9 wyszło, że aby nie utracić późniejszych obserwacji sygnałów, trzeba pamiętać między przebiegami `fast` aktywne okna `+2h±15min` i `+12h±15min`. Magazyn **nie może** przy retry ponownie otworzyć tego samego sygnału, utracić starszych poprawnych zdarzeń albo uznać brak ceny za sprzedaż.

Testujemy przede wszystkim:
- **Idempotencję:** identyczny ponowny odczyt `t+digest` daje no-op, bez nowych zdarzeń i zmiany rewizji; zmieniony wsad przy tym samym `t` albo przestarzały odczyt jest odrzucany.
- **Atomowość i odzyskanie:** błąd przed atomowym rename/COMMIT pozostawia poprzedni spójny stan; utrata ACK po rename/COMMIT daje po ponowieniu no-op.
- **Wersje i tożsamości:** platforma+OVR+ID profilu FUT.GG+nazwa, pełny podpis definicji i SHA wersji algorytmu, sygnały tylko dla kart z bieżącego poprawnego wsadu.
- **Odroczone obserwacje:** `pending` do końca okna; potem `observed` z naprawdę widzianą ceną lub `unobserved` (bez domniemania sprzedaży). Tylko wcześniejsze sygnały mogą uruchamiać późniejsze okna.
- **Bezpieczeństwo zapisów:** lock/konflikt — fail closed, jawna inicjalizacja (brak pliku na runnerze nie może ukradkiem wyzerować archiwum), walidacja siatki monet, checksum, limit bajtów, brak zapytań do rynku.
- **Skalowanie:** 203 kolejne przebiegi × 154 obserwacje = **31 262 sztucznych obserwacji** (identyczna nominalna liczba jak w etapie 9, ale **nie są to te same rzeczywiste historyczne ceny**); symulowany churn, 16 sztucznych sygnałów, dwa horyzonty.

Wyniki dotyczą **mechaniki przechowywania**, nie jakości prognoz, rynku FUT, zysków ani wskaźnika trafności AppEA.

## 2. Dwa wykonane prototypy, obydwa lokalne

### A. Snapshot JSON, checksum, lock, atomic rename

Deterministyczny reducer wylicza nowy stan bez zmiany starego. Zapis:
1. otwiera `file.lock` w trybie exclusive create (`wx`), bez automatycznego usuwania potencjalnie starej cudzej blokady;
2. wczytuje poprzedni plik, weryfikuje SHA256 i rewizję;
3. przetwarza wsad oraz zapisuje `tmp`, `fsync`, atomowy rename w tym samym katalogu i `fsync` katalogu;
4. zwalnia lock. Przy błędzie przed rename poprzedni plik zostaje cały, a przy błędzie po rename ponowienie identycznego wsadu jest no-op.

**Ograniczenia:** snapshot ma **wspólny rosnący `journal`** z dziennikiem zdarzeń i listą aktywnych obserwacji. Po nagłym zabiciu procesu może pozostać blokada wymagająca kontrolowanej obsługi. Testy wyjątków nie symulowały przerwy zasilania czy gwarancji sprzętowych.

### B. SQLite — aktywna lista + append-only ledger w jednej transakcji

Lokalny prototyp `node:sqlite`, tabela `hot` (schema, ostatni timestamp i digest, rewizja, ostatnia widoczność, aktywne watches) + `events` (unikalne ID, typ, czas i podpis). Dla każdego przebiegu: **`BEGIN IMMEDIATE` — walidacja SHA256 — reducer — INSERT eventów — UPDATE hot — COMMIT**. Jedna transakcja zapobiega sytuacji, gdy sygnał zostaje dopisany, ale nie ma jego watchlisty, albo odwrotnie.

Ustawienia badawcze: SQLite rollback journal `DELETE`, `synchronous=FULL`, `busy_timeout=0` (konflikt kończy się odmową, nie wyścigiem), UNIQUE event ID. Brak WAL, by nie mnożyć plików bocznych przy ewentualnym kopiowaniu. Test w Node **22.16.0**; `node:sqlite` generował ostrzeżenie statusu eksperymentalnego w tym środowisku. **Nie potwierdzono jeszcze działania w produkcyjnym Node 24**, na GitHub Actions ani przeniesienia bazy pomiędzy runnerami.

Obydwa prototypy są **niepodłączone do `scrape.mjs`, `refresh.yml`, `data.json`, `historia-kart.json`, EMA i rekomendacji**. Nie mają mechanizmu zapisu do trwałego zewnętrznego magazynu.

## 3. Testy — wynik pozytywny, ale w wyznaczonym zakresie

**JSON: 25/25** testów, m.in. rzeczywisty nowy proces Node czytający wcześniejszy plik, idempotentny retry i niezależna kolejność wejścia, błędny batch z tym samym `t`, nielegalna cena, niejednoznaczność profilu, sygnał nieobecny w wycinku, `unobserved` zamiast „sprzedano”, brak pliku, naruszona suma, limit bajtów, konflikt locka, wymuszony wyjątek przed rename i po rename. Dodatkowo 150 kolejnych restartów logicznych po 14 kart z pomiarem rozmiaru.

**SQLite: 11/11** testów, w tym brak stanu, duplikacja, konflikt, wymuszona awaria przed COMMIT i po COMMIT, `unobserved`, limit, blokada osobnej transakcji, uszkodzenie SHA, odtworzenie 203 kolejnych syntetycznych przebiegów. **Test SQLite `PRAGMA integrity_check` po obciążeniu: OK**.

Nie testowano `SIGKILL` w losowej instrukcji procesu, sprzętowego power loss, odtwarzania po corrupt fizycznym SQLite, wielu niezależnych hostów, odległego magazynu lub prawdziwych historycznych stanów produkcyjnej EMA. Nie są to potwierdzone gwarancje end-to-end.

## 4. Stres 203 × 154 — jeden lokalny pomiar, dwa formaty

Wskaźniki z **Node.js 22.16.0**, syntetyczny churn i **16 sztucznych sygnałów**, bez internetu. Oba moduły zastosowały ten sam reducer i semantykę zdarzeń, ale inne reprezentacje na dysku.

| Metryka | JSON snapshot | SQLite hot + events |
|---|---:|---:|
| Testy funkcjonalne PASS | **25/25** | **11/11** |
| Przebiegi / przyjęte ceny | 203 / 31 262 | 203 / 31 262 |
| Dziennik zdarzeń | 8 876 | 8 876 |
| Aktywne watches na końcu | 5 | 5 |
| Rozmiar aktywnego snapshotu JSON / `hot` | **1 231 152 B** | **14 515 B** |
| Rozmiar całej bazy/pliku | **1 231 152 B** | **2 125 824 B** |
| Rozmiar po 160 przebiegach (JSON) | 978 445 B | — |
| Limit 1 MiB przebity przez JSON | **171. przebieg** | `hot` pozostawał <15 kB |
| Czas całego przebiegu testowego | 3,85 s | 0,68 s |
| Średni czas wsadu (lokalnie) | 18,96 ms | 3,33 ms |

**Interpretacja:** SQLite izoluje zwięzły stan roboczy od rosnącego dziennika, ale **cały plik SQLite jest większy**, bo przechowuje osobne rekordy i indeksy bez kompaktowej retencji/kompresji. Czasy są wyłącznie orientacyjne, z pojedynczego uruchomienia lokalnego, różnym kodem I/O i bez CI Node24 — to nie jest certyfikowany benchmark wydajnościowy. Wyniki pamięci JSON: szczyt RSS ~95,8 MB i heap ~42,4 MB dla całego procesu Node (nie samych danych). Nie wnioskować o koszcie zewnętrznej usługi magazynu z tych bajtów.

**Krytyczny wynik negatywny:** monolityczny JSON z rosnącym journalem nie spełnia założenia niewielkiego hot state. Lokalny SQLite spełnia założenie hot state w syntetycznym stresie, ale sam **nie rozwiązuje retencji**, nie jest „tańszym plikiem” i nie rozwiązuje zdalnej trwałości.

## 5. Nierozwiązana bariera — wiele procesów GitHub Actions

Zgodnie z [GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners), większość uruchomień dostaje **nową VM**. Lokalny plik/katalog testowy z poprzedniego procesu nie jest automatycznie dostępny w następnym workflow. Sam `fsync` czy `COMMIT` na runnerze nie daje ciągłości między nowymi jobami. **Przeniesienie pliku za pomocą artefaktów workflow nie jest równoznaczne z zewnętrznym trwałym magazynem o kontrolowanej konkurencji i retencji** — artefakty [wygasają](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

Wymagany jest osobny protokół:
1. odczyt potwierdzonego ostatniego stanu o konkretnym **revision/generation/ETag** przed przejściem;
2. wyliczenie i zatwierdzenie transakcji w magazynie (najlepiej trwałej bazie lub wersjonowanym obiekcie);
3. jednoznaczny mechanizm **compare-and-swap/fencing** przy równoległych piszących;
4. bezpieczny retry, także po przerwaniu pomiędzy lokalnym `COMMIT` a odległym potwierdzeniem;
5. jawna polityka braku `reset to empty`, odtwarzanie `watch` i dziennika, **krótkie aktywne okna + trwałe historyczne wyniki**;
6. retencja/rotacja starszych `events`, limity bajtów na zapis oraz obserwowalny tryb `degraded` bez wpływu na publikowanie ceny.

Nie ma jeszcze decyzji o dostawcy storage, kosztach, autoryzacji czy ostatecznym procesie przy konfliktach. **Nie wolno** włączać lokalnego SQLite do zwykłego runnera i uznać problemu trwałości za rozwiązany.

## 6. Źródła i transfer do AppEA

1. [SQLite — Atomic Commit](https://www.sqlite.org/atomiccommit.html) — transakcyjne `COMMIT/ROLLBACK` i zasady odporności na awarie. Uzasadnia *lokalną* semantykę transakcji, a nie rzekomą trwałość między runnerami.
2. [SQLite — Transactional](https://www.sqlite.org/transactional.html) — atomowość SQLite, testowana przez projekt SQLite również pod kątem crashy. Nasz test lokalny nadal nie obejmował takich fizycznych awarii.
3. [GitHub Docs — GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners) — osobna maszyna dla nowego joba; podstawa identyfikacji problemu trwałości.
4. [GitHub Docs — Actions artifact retention](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository) — ograniczona retencja artefaktów jako dowodu i plików, nie gwarantowany stały magazyn.
5. [GitHub Docs — Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) — nie zwiększać częstych, często nadpisywanych plików generowanych na `main`.

## 7. Artefakt i decyzja

Pełny, **izolowany pakiet ZIP** zawierający `shadow-store.mjs`, `sqlite-store.mjs`, kopię walidacji siatki `grid.mjs`, testy, replay stresowy, README, surowe logi i `wyniki_etap10.json` wygenerowano w tej rozmowie jako `AppEA_etap10_prototyp_i_testy.zip`, SHA256 **`f78ba9c3c878db9ece6e9588127a393bc2a94eb17a5a7679a06e0151a9964ad3`**. Link do pobrania jest w odpowiedzi czatu; repozytorium zawiera niniejszy trwały raport i metodologię, ale **źródła kodu eksperymentalnego nie zostały wypchnięte na GitHub** (celowo, by nie powtórzyć wcześniejszego przypadkowego wprowadzenia kodu do `main`). Do kontynuacji testów kodu zachować ZIP lokalnie lub umieścić go świadomie na nowej odseparowanej gałęzi, po audycie operacji GitHub.

**Decyzja etapu 10:**
- **Potwierdzone lokalnie:** deterministyczny reducer, idempotencja i transakcyjne retry, obsługa pending/observed/unobserved, brak duplikacji oraz korzystniejszy rozdział HOT/COLD z SQLite. łącznie **36/36** testów funkcjonalnych.
- **Odrzucone do wdrożenia:** pojedynczy rosnący snapshot JSON; SQLite z wyłącznie lokalną bazą na runnerze.
- **Kandydat do kolejnego pilota:** transakcyjny magazyn HOT/COLD (SQLite albo trwała baza o analogicznych gwarancjach), po odrębnym sprawdzeniu kosztu, migracji i trwałości między runnerami.
- **Brak produkcyjnego wdrożenia i zmian algorytmicznych.**

**Etap 11:** zidentyfikować najmniejszy bezpieczny **trwały zewnętrzny backend** z atomowym compare-and-swap, ponowieniem po utracie ACK i czasową retencją; przetestować odtwarzanie stanu z oddzielnego procesu/job bez rozbudowy ani jednego produkcyjnego workflow. Dodatkowo dopiero w izolacji zweryfikować kompatybilność z Node 24.

**Uwaga o czasie:** README i logi dokumentują pomiary lokalne z syntetycznymi wejściami. Nie utożsamiać ich z historycznymi wynikami inwestycji FUT.GG z etapu 9.
