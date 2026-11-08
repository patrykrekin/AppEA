# Etap 15A — R2: rotacja historii, fencing podczas konserwacji i kopia poza R2

**Data: 8 listopada 2026. Status: PASS dla wykonanych prób; NIE pełna gotowość długoterminowego magazynu, GC ani trwałego backupu poza bucketem.**

> [Punkt wznowienia](START_TUTAJ_ANALITYKA.md) · [Rejestr badań](REJESTR_ZRODEL_BADAWCZYCH.md) · [Etap 14](AUDYT_R2_CHECKPOINT_BACKUP_GC_ETAP14_20261108.md)

## 1. Dwa niezależne eksperymenty, ich granice i dowody

**Node 24 na GitHub Actions, syntetyczny stres (bez R2):** [run #42505548172](https://github.com/patrykrekin/AppEA/actions/runs/42505548172), `bounded-replay` PASS, **37/37** testów, Node `v24.22.2`; dodatkowe wcześniejsze zielone przebiegi #42505215324, #42505489977. Przebadano 1024 syntetyczne zdarzenia w odstępach umownych 120 sekund, 63 niezmienne strony po 16 rekordów i bieżące 16 rekordów w `tail`. Żadnych cen z FUT.GG. Kod czytelny na [gałęzi research/stage15a-rotation-fencing-20261108](https://github.com/patrykrekin/AppEA/tree/research/stage15a-rotation-fencing-20261108).

**Rzeczywisty Cloudflare R2, jednorazowy przebieg syntetyczny:** [run #42505631775](https://github.com/patrykrekin/AppEA/actions/runs/42505631775), final **6/6 jobs PASS**: `seed`, `lock`, `stale`, `rotate`, `export`, `offsite-verify`. Sześć zadań na osobnych GitHub-hosted runners. Konto R2 podłączone sekretnymi danymi `r2-stage12-pilot`, bez umieszczania kluczy w logach lub repo. W tym przypadku R2 faktycznie wykonywało GET/PUT/412/LIST. Ostatnie dwa zadania wykonały także eksport i odtworzenie sztucznej kopii poprzez GitHub Actions artifact **bez sekretów R2 w jobie odtworzeniowym**.

**Kod i workflow:**
- `research/stage15a/core.mjs` — model manifestu, per-page SHA256, rotacja, tryb maintenance/fencing, rekonstrukcja i GC dry-run.
- `research/stage15a/test.mjs` — 37 testów i stres.
- `research/stage15a/live-pilot.mjs` — rzeczywisty R2, tylko syntetyczny prefiks, max7 PUT/job, bez DeleteObject.
- `research/stage15a/verify-offsite.mjs` — SHA256 i odtworzenie bez R2.
- [workflow testowy na `main`](.github/workflows/stage15a-live-r2-one-shot.yml) — po zakończeniu **usunięto automatyczny trigger push** w commicie `a5d15668873e14b20581077f0aca0002f3eec85c`. Pozostał wyłącznie `workflow_dispatch` i dokładne potwierdzenie `RUN_STAGE15A_R2`. **Brak crona i brak modyfikacji produkcyjnego `refresh.yml`.**

## 2. Stres 1024 zdarzeń — skalowanie aktywnego HEAD i koszt rotacji

Model: jedna nowa delta o kolejnym `seq` i rosnącym `at`; `tail` do **16**, po czym HEAD przechodzi CAS-em w `mode=maintenance`, archiwizuje odczytane i zweryfikowane delta w **niezmiennej stronie**, zapisuje drugą kopię pod `page-backups/`, przestawia wskazanie strony w HEAD i dopiero potem CAS-em wraca do `mode=active`.

Architektura nie spłaszcza całej historii w HEAD. Każda strona ma `prev` z wskaźnikiem na poprzednią stronę i jej backup; aktualny HEAD wskazuje tylko ostatnią stronę, aktywny tail i maks. 64 ostatnie receipts. Wznowienie pełnej historii przechodzi po łańcuchu SHA256, sprawdza ciągłość sekwencji i brak cykli, a następnie scala aktualny `tail`.

| Miara | Wynik offline Node24 |
|---|---:|
| Syntetyczne zdarzenia w pełni odtworzone | **1024/1024** |
| Niemodyfikowalne strony | **63** |
| Żywy ogon HEAD (`tail`) | **16** |
| Rozmiar zapisanego HEAD | **6756 B** |
| Limit HEAD | **8192 B** |
| Obiekty mock (surowe delty + strony i backupy) | **1150** |
| Suma bajtów payload mock | **636 586 B** |
| Testy | **37/37 PASS** |

**Uwaga o kosztach i limitach:** 1150 obiektów i 636 586 B to lokalny mock, nie pomiar zużycia R2 ani opłat za żądania. Nie należy bezpośrednio ekstrapolować go na produkcyjny rynek. Przy `maxPages=128` pojedyncze odtwarzanie ma twardy limit ok. **2048 rekordów archiwalnych plus aktywny tail**, czyli **~68 h przy jednym rekordzie co 2 min**; nie wystarcza to do tygodniowej/stałej historii. Zanim wejdzie ciągłe zbieranie trzeba wdrożyć wyższy poziom indeksowania/segmenty rolowane, paginację odbudowy i kontrolę limitów.

Receipts są świadomie ograniczone do **64 ostatnich**; bardzo stary retry dostaje status `AMBIGUOUS_FAIL_CLOSED`. Dodatkowo nowy wsad ma oczekiwany kolejny `seq` i ściśle rosnący `at`, więc stara delta nie może zostać ponownie dopisana jako nowa bez przebudowania kontekstu. To mechanizm ochronny, nie jeszcze pełny dowód bezpieczeństwa wszystkich retry po utracie sieci.

## 3. Fencing i GC — dowody oraz granica

Model `freeze()` i `release()` zwiększa `epoch` przy obu przejściach. Wszystkie zapisujące klienty muszą czytać aktualny HEAD i stosować `If-Match` z bieżącym ETag; ponadto przy `mode=maintenance` `append()` odmawia działania. **Nie ma automatycznego wygaśnięcia blokady**: awaria konserwatora pozostawia fail-closed i wymaga świadomej interwencji. Dzięki temu nie ma „wyścigu po upłynięciu lease”, ale jest ryzyko utrzymywania zatrzymanego badawczego collectora.

W offline 1024 zdarzeniach:
- 63 zamknięte strony i ich 63 kopie oraz 16 aktywnych delt = **142 obiekty osiągalne**, które GC musi ochronić;
- 1008 starszych surowych delt były młodsze niż założony okres 72h, więc `KEEP_GRACE`;
- po **wyłącznie syntetycznym postarzeniu timestampów** 1008 przeszło do `ELIGIBLE_DRY_RUN_ONLY`, ale **nadal `deleteOperations=0`**;
- niepełny łańcuch, utrata obu kopii strony, obcy prefix, błędna data, zbyt krótki grace i GC poza trybem maintenance powodowały odmowę.

**To nie jest dowód bezpiecznego fizycznego kasowania historii.** Nie wykonano żadnego historycznego DELETE, nie testowano aktywnych, długo trwających czytelników ani rzeczywistego failover po przerwaniu PUT. Próg 72h jest hipotezą ochronną, a nie rekomendacją inwestycyjną ani gwarancją bezpiecznego GC.

## 4. Wyniki z prawdziwego R2

Testowy prefiks to:
`appea-research/stage15a/stage15a-42505631775/`

Dane **syntetyczne**; w momencie końca pozostawiono **1 `hot/head.json`, 2 zatwierdzone surowe `deltas/`, 1 niezatwierdzoną deltę starego writera, 1 `pages/` i 1 `page-backups/`** = razem **6 małych obiektów**. Nic nie usuwano.

| Job | Faktyczny wynik |
|---|---|
| `seed` | HEAD `generation=2, revision=2` i dwie niezmienne delty |
| `lock` | R2 HEAD `mode=maintenance`, `epoch=1` |
| `stale` | Writer z ETag sprzed blokady dostał **prawdziwe HTTP 412**, a HEAD pozostał w `maintenance` |
| `rotate` | Dwa niezmienne obiekty strony o identycznym SHA256, manifest po rotacji `generation=2, epoch=2, mode=active`; GC dry-run **2 chronione strony + 3 młode delty, 0 kwalifikujących się, 0 DELETE** |
| `export` | Odczyt 466-bajtowego backupu z prawdziwego R2 i porównanie SHA256 |
| `offsite-verify` | Drugi runner bez sekretów R2 odtworzył **2/2** syntetycznych zdarzeń z GitHub artifact, potwierdził identyfikatory i SHA256 |

Log `STAGE15A_ROTATE` pokazał `gc:{live:2,hold:3,eligible:0,deleteOperations:0,objects:5,maintenanceEpoch:1}`, a końcowy HEAD po zwolnieniu konserwacji miał `epoch=2`.

**Ograniczenia:** rzeczywisty R2 412 wykazuje obronę przed przestarzałym writerem, ale `stale` startował **po** zatwierdzeniu trybu maintenance; nie testowano dosłownie jednoczesnych operacji na tym samym kluczu ani rzeczywistego GC vs aktywny reader. Przy `429` R2 trzeba odróżnić rate-limit od konfliktu CAS — tutaj nie wywołano throttlingu.

## 5. Kopia poza R2 — rzeczywisty eksport, nietrwały nośnik

W jobie `export` pobrano z R2 sztuczny backup o SHA256:
`5796e6cc7e7e51a87b15ef1399b3c0c24893b41ba371a207c4b709c04d580889` (**466 B**).

Zapisano go do **GitHub Actions artifact** `stage15a-temporary-offbucket`, ID `13626369715` (kompresja artefaktu do 341 B). Job `offsite-verify` na osobnej VM pobrał go z GitHuba, **bez połączenia i poświadczeń R2**, zweryfikował hash przeciw wartości otrzymanej z poprzedniego joba i odtworzył 2 rekordy.

**Twardy termin wygaśnięcia z API:** **2026-11-15 17:35:33 UTC**. Ustawiono `retention-days: 7`. Repo `patrykrekin/AppEA` jest publiczne; artefakty są dostępne dla użytkowników mających prawo odczytu repo. **Tylko sztuczne dane zostały skopiowane**. Nie używać tego procesu do przenoszenia niepublicznych strategii, plików z kluczami czy danych prywatnych.

**Wniosek:** udowodniono możliwość eksportu do niezależnego systemu i odzyskania na innym runnerze, ale **NIE udowodniono trwałego, poufnego off-site disaster recovery**. Artefakt wygasa po 7 dniach, może zostać skasowany razem z przebiegiem Actions, nie posiada gwarantowanego prywatnego i nieograniczonego czasu przechowywania. Do produkcji potrzebny będzie osobny prywatny, trwały magazyn/konto z własną retencją i ograniczonym tokenem, albo inny niezależny mechanizm tworzenia zweryfikowanych kopii.

## 6. Kontrola kosztów i niezmienności produkcji

Ograniczony zdalny test wykonał w przybliżeniu **12 prób PUT** (w tym 1 oczekiwana odmowa 412), **17 GET**, **1 LIST**, **0 DELETE**, plus jednorazowe przesłanie/odczyt tymczasowego artefaktu GitHub. Nie wywołano żadnego requestu do FUT.GG. **Brak dostępu do faktycznego billingu Cloudflare** — nie podawać gwarantowanej kwoty $0.

Po uruchomieniu **wyłączono automatyczny trigger push** testowego workflow w commicie `a5d15668873e14b20581077f0aca0002f3eec85c`. [`.github/workflows/stage15a-live-r2-one-shot.yml`](.github/workflows/stage15a-live-r2-one-shot.yml) jest teraz wyłącznie ręczny (`workflow_dispatch`) z wyraźnym potwierdzeniem `RUN_STAGE15A_R2`. Kod produkcyjny `scraper/scrape.mjs` i `.github/workflows/refresh.yml` pozostają niezmienione; żadna implementacja nie została scalona do aplikacji.

## 7. Decyzja i bezpieczny następny krok

**Etap 15A wykonany w zakresie proof-of-concept: PASS** dla większej rotacji, modelu fencing, rzeczywistego R2 CAS po zamknięciu zapisów i krótkotrwałego eksportu poza bucket. 

**Nadal otwarte dla produkcji:** długotrwały, stronicowany index/odtwarzanie >128 stron, rzeczywiste GC przy aktywnych czytelnikach i restartach, obsługa zablokowanego konserwatora, trwała kopia poza bucktem, testy skutków ubocznych, koszt i alerty. Nie włączać nocnego czyszczenia, expiry ani stałego collectora.

**Proponowany następny krok 15A.2:** zamknąć długohoryzontowe indeksowanie + niezależny prywatny backup (nie 7-dniowy publiczny artifact) + fencing/GC pod realnym współbieżnym obciążeniem. Dopiero po tych warunkach uruchomić długotrwały collector. **Ewentualny etap 15B** można ograniczyć do krótkiego, odizolowanego *read-only* pilota prawdziwych sygnałów, **bez GC i bez podłączania do produkcyjnego `refresh.yml`**, z twardym limitem liczby przebiegów i bajtów; nie wolno utożsamiać go z pełną produkcyjną archiwizacją.

### Źródła

1. [Cloudflare R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) i [R2 conditional writes](https://developers.cloudflare.com/r2/api/s3/extensions/) — atomowość `If-Match` na pojedynczym obiekcie, nie transakcja wielu kluczy.
2. [Cloudflare R2 durability](https://developers.cloudflare.com/r2/reference/durability/) — replikacja R2 nie chroni przed przypadkowym czy celowym usunięciem obiektów.
3. [GitHub Actions artifact retention](https://docs.github.com/en/actions/tutorials/store-and-share-data) i [GitHub download artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts) — techniczny cross-job export, 7-dniowa retencja pilota, dostęp dla uprawnionych czytelników repo.
