# Etap 15A.2 — hierarchiczny indeks, pin czytelnika, fencing GC i blokady dalszej retencji

**Data: 8 listopada 2026. Status: PASS dla 44 testów offline i ograniczonego LIVE CAS na R2; otwarte trwałe off-site backup, produkcyjny GC i długoterminowy reader protocol.**

> [Punkt wznowienia](START_TUTAJ_ANALITYKA.md) · [Rejestr badań](REJESTR_ZRODEL_BADAWCZYCH.md) · [Etap 15A](AUDYT_R2_ROTACJA_FENCING_BACKUP_ETAP15A_20261108.md)

## 1. Założenia i rygor testu

Cel: pokonać uprzedni limit odtwarzania `maxPages=128`, zweryfikować czytelników aktywnych podczas przełączenia HEAD w konserwację i zabezpieczyć manifest przed sprzątaniem, zanim dopuścimy jakiekolwiek rzeczywiste kasowanie historycznych fragmentów.

- Przebiegi **WYŁĄCZNIE syntetyczne**. Żadnych rzeczywistych kart FUT.GG, sieciowych żądań do FUT.GG, aktualizacji modelu EMA/okazji/indeksu ani zmiany produkcyjnego `scraper/scrape.mjs` i `.github/workflows/refresh.yml`.
- Utrwalony kod [research/stage15a2-index-reader-gc-20261108](https://github.com/patrykrekin/AppEA/tree/research/stage15a2-index-reader-gc-20261108), nie scalany do `main`.
- [Offline CI #42506845106](https://github.com/patrykrekin/AppEA/actions/runs/42506845106), po dopracowaniu skryptu [CI #42507150529](https://github.com/patrykrekin/AppEA/actions/runs/42507150529): Node **24.22.2**, **44/44 PASS**, kontrola haszy produkcji i składni skryptu realnego R2.
- [R2-live final #42507330286](https://github.com/patrykrekin/AppEA/actions/runs/42507330286): **6/6 jobów PASS** na osobnych runnerach, z Cloudflare R2 przez bezpieczne środowisko GitHub `r2-stage12-pilot`.
- Test ograniczony do nowego, unikalnego prefiksu `appea-research/stage15a2/stage15a2-42507330286/`. Nie ma `DeleteObject`, nie modyfikowano lifecycle, lock rules, ani żadnego innego prefiksu.

## 2. Archiwum >128 stron — rzeczywisty test CI, nie obciążenie R2

Prototyp rozdziela archiwum na:
- immutable strony `pages/<sha256>.json` i osobne `page-mirrors/<sha256>.json` (16 zdarzeń/stronę);
- grupy indeksowe `groups/<sha256>.json` i `group-mirrors/<sha256>.json` (maksymalnie 64 strony/grupę);
- niezmienny `roots/<sha256>.json`, który zawiera listę grup i licznik zdarzeń;
- mały, zmieniany warunkowym CAS `hot/head.json`, odwołujący się do root i trzymający `revision`, `epoch`, `mode` oraz listę aktywnych czytelników.

Każdy wskaźnik ma pełną nazwę w bieżącym prefiksie i SHA-256 bajtów JSON. W odtwarzaniu, jeśli obiektu pierwotnego brakuje, algorytm dopuszcza odczyt niezmiennej kopii; jeśli istniejący obiekt ma zły SHA, kończy **fail-closed**, nie przełącza się milcząco na kopię. Sprawdzana jest ciągłość `seq`, brak duplikatów, poprawność schematu i limit ilości.

| Metryka | Lokalny CI Node24 |
|---|---:|
| Testy poprawności | **44/44** |
| Sztuczne zdarzenia odtworzone | **16 384/16 384** |
| Strony (po 16 rekordów) | **1024** |
| Grupy (do 64 stron) | **16** |
| Obiekty (1024 primary + 1024 mirror + 16 primary group + 16 mirror group + 1 root) | **2081** |
| Łączna ilość payload JSON | **3 786 846 B** |
| Niezmienny root | **7652 B** |
| Potwierdzona ochronna lista obiektów w GC | **2081** |
| Fizyczne operacje Delete | **0** |

**Wynik:** pojedynczy indeks o 16 grupach i 1024 stronach jest odtwarzalny, co usuwa wcześniejszy limit 128 stron. Jest to wciąż **ograniczony eksperymentalny format**: maks. 128 grup ×64 strony ×16 zdarzeń = 131 072 zdarzeń i limit `MAX_B=65 536` na obiekt. Duża historia rzeczywista może wymagać osobnego indeksowania po przedziałach czasu, szybkiej paginacji, rotacji root, rebalansowania lub strumieniowego replay. Nie dowiedziono kosztu 2081 obiektów na prawdziwym R2; **nie zapisano tych 16 384 zdarzeń w Cloudflare**.

## 3. Piny czytelników i bezpieczny GC

Model `pin()` dodaje identyfikator czytelnika do HEAD **wyłącznie przy `mode=active`** i musi być opublikowany `PutObject If-Match: <odczytany ETag>`. `freeze()` podbija `epoch`, ustawia `maintenance`, ale **nie usuwa aktywnych pinów**. Dopiero po świadomym `unpin()` i nowym odczycie HEAD konserwator może sprawdzać GC. W razie braku pinu, błędnego ETag, braku root, brakujących kopii lub uszkodzonego SHA — operacja kończy się odmową. `release()` przywraca `active` z kolejną epoką, tylko gdy nie ma czytelników.

**Offline testy:** dwa konkurencyjne zamiary aktualizacji tego samego HEAD (pin czytelnika i freeze) ze starym ETag — pierwszy zatwierdzony, drugi 412 w lokalnym CAS modelu. Próby GC z pinem, nieaktualnym ETag, podczas `active`, poza prefiksem, z przyszłym timestampem lub brakującymi obiektami kończą się odmową. Symulowany stary orphan (>72h) jest **wyłącznie kandydatem w DRY-RUN**, nie jest usuwany.

**Ważna granica:** tylko czytelnicy korzystający z obowiązkowego protokołu pin/CAS są chronieni. Istniejący czytelnik omijający pin, przerwany proces z niezwolnionym pinem, niedokładny zegar i długotrwałe odczyty nadal wymagają osobnej polityki. `expires` jest zapisywane informacyjnie; w tym prototypie **NIE ma automatycznego wygaśnięcia ani przejmowania pinów**. Po awarii czytelnika GC pozostaje zablokowany (fail closed) aż do kontrolowanej interwencji. W prototypie limit wynosi tylko **16 jednoczesnych pinów**; każda rejestracja i zwolnienie to zapis HEAD, więc limit R2 **1 write/s/key** może stanowić wąskie gardło. Nie zalecać tego bezpośrednio jako rozwiązania przy tysiącach klientów.

## 4. Realny Cloudflare R2: wyniki 6/6 PASS

[Rzeczywisty run #42507330286](https://github.com/patrykrekin/AppEA/actions/runs/42507330286), unikalny prefiks `stage15a2-42507330286`:

1. **seed:** 32 sztuczne zdarzenia w 2 stronach, 1 grupie i 7 niezmiennych obiektach; HEAD utworzony `If-None-Match: *`; 8 PUT.
2. **pin:** aktywny czytelnik `reader-15a2` został zapisany CAS-em do HEAD, licznik `readers=1`, `revision=1`.
3. **stale:** inny runner próbował zapisać HEAD ze starym ETag i dostał rzeczywisty **HTTP 412**; pin pozostał, a GC poprawnie odmawiał działania z aktywnym pinem.
4. **maintenance:** wyrejestrowano czytelnika przez CAS, następnie zamrożono HEAD (`mode=maintenance,epoch=1,readers=0`).
5. **inspect:** zdalny LIST i GET zweryfikowały 32 rekordy oraz 7 immutable objectów w pełnej ścieżce `root→group→page`; GC `reachable=7,eligible=0,deleteOperations=0`.
6. **release:** konserwacja zwolniona CAS; końcowy `mode=active,epoch=2,readers=0`.

**Skala ostatniego żywego runu (z kodu):** 13 prób PUT (w tym jedna odmowa 412), 19 GET, 1 LIST i **0 DELETE**. 8 małych obiektów w nowym prefiksie (7 archiwum + 1 HEAD). **Nie weryfikowano billingu**, zatem nie podawać ceny na fakturze. Bez sekretów w logach.

### Błąd w pierwszym podejściu i bezpieczne odzyskanie

Pierwszy [live #42506908561](https://github.com/patrykrekin/AppEA/actions/runs/42506908561) miał błąd **skryptu inspekcji**: podano do GC wszystkie obiekty z prefiksu, w tym `hot/head.json`, mimo że planer przyjmuje tylko obiekty archiwum. Kontrola **fail-closed** dała błąd `GC_UNSAFE_LISTING`. R2 nie było uszkodzone, nie wykonano DeleteObject, ale końcowy job nie ruszył, co zostawiło synthetic HEAD w `maintenance`.

Następny osobny, [naprawczy run #42507203051](https://github.com/patrykrekin/AppEA/actions/runs/42507203051) po sprawdzeniu **wszystkich 7 archiwalnych obiektów**, 32 zdarzeń, ich SHA oraz braków pinów wykonał CAS i przywrócił `mode=active,epoch=2` **bez kasowania żadnego obiektu**. Naprawiono wyodrębnienie HEAD z listy przekazywanej do planera GC i zaktualizowano końcowy job release, aby po udanej konserwacji mógł się wykonać również wtedy, gdy nie powiedzie się sama inspekcja (guard `always() && needs.maintenance.result == 'success'`). Poprawiony kompletny run 6/6 przeszedł pomyślnie.

**Bezpieczeństwo:** po obu testach usunięto jednorazowe triggery `push`; pozostały tylko ręczne `workflow_dispatch` i jawne potwierdzenia `RUN_STAGE15A2_R2` / `RECOVER_STAGE15A2`. Brak crona, brak podłączenia do produkcji.

## 5. Trwały backup poza R2 i lock rules — nadal otwarte

**Nie utworzono nowego, prywatnego, niezależnego backupu** w tym etapie. Dostępne uprawnienia obejmują istniejący prywatny bucket R2 i GitHub; wcześniejszy publicznie czytelny artefakt GitHub Actions miał retencję **7 dni**. Nie jest dopuszczalnym trwałym magazynem dla przyszłych rzeczywistych danych. Nie można twierdzić, że cel offsite backup został zrealizowany.

Nowa praktyczna możliwość: Cloudflare R2 dokumentuje **[Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)** pozwalające ustawić retencję per-prefix i zabezpieczyć obiekty przed nadpisaniem oraz usunięciem. Można w kolejnym pilocie rozważyć lock dla **niezmiennych segmentów i backupów**, lecz **NIE dla `hot/head.json`**, bo zamroziłoby to CAS HEAD. Lock rules nie stanowią niezależnej kopii poza kontem Cloudflare, mogą generować dodatkowy koszt utrzymywania obiektów i wymagają świadomej zmiany konfiguracji bucketa; **nie włączano ich**. Przy odmowie lock może zwrócić **409** (`ObjectLockedByBucketPolicy`), co należy odróżnić od CAS 412 i throttlingu 429.

**Nadal potrzebne przed stałym collectorem:** prywatny odrębny magazyn/konto lub osobny provider do trwałych kopii, ograniczone do niego sekrety, dowód przywrócenia po utracie całego pierwotnego bucketa, polityka rotacji/GC, limity kosztów oraz odporność na długotrwałe i porzucone piny. Nie aktywowano automatycznej polityki lifecycle, nie usuwano starych delt.

## 6. Wniosek i następny cel

**Etap 15A.2: PASS jako test hierarchicznego archiwum i kontrolowanej ochrony czytelnika**, z rzeczywistą próbą R2 oraz naprawionym, odizolowanym błędem inspekcji. To nie jest produkcyjna implementacja archiwum ani bezpieczny, autonomiczny GC.

**Rekomendowany następny krótki etap 15B (read-only, bezpieczny):** izolowany, jednorazowy odczyt **niewielkiej próbki rzeczywistych decyzji** z istniejącego procesu lub archiwum i walidacja kontraktu bez nowego stale działającego scrapera, bez GC i bez zmiany `refresh.yml`, `data.json`, EMA oraz rekomendacji. Nie przekształcać tego w stały collector przed zamknięciem trwałych kopii. Równolegle możliwy **15A.3**, dopiero po świadomym przygotowaniu drugiego prywatnego backup target i polityki reader-pins.

### Źródła i transfer

1. [Cloudflare R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) — silna spójność oraz atomowe warunkowe PutObject.
2. [Cloudflare R2 conditional operations](https://developers.cloudflare.com/r2/api/s3/extensions/) — jednoznaczne CAS 412.
3. [Cloudflare R2 limits](https://developers.cloudflare.com/r2/platform/limits/) — 1 write/second/key, zatem częste piny w HEAD nie skalują bez ograniczeń.
4. [Cloudflare R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/) — per-prefix retencja, 409 przy ObjectLockedByBucketPolicy, nie włączać dla zmiennego HEAD.
5. [GitHub Actions artifact retention](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository) — brak nieograniczonej retencji artefaktów.
