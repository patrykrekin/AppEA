# Etap 12 — Node 24, warunkowe S3 i przygotowanie realnego testu Cloudflare R2

> **AKTUALIZACJA PO TESTACH NA PRAWDZIWYM R2:** [AUDYT_R2_LIVE_PILOT_ETAP12_20261107.md](AUDYT_R2_LIVE_PILOT_ETAP12_20261107.md) — rzeczywisty `PUT/GET/412` w R2 oraz dwa niezależne runnery **PASS** ([Actions #42416561870](https://github.com/patrykrekin/AppEA/actions/runs/42416561870)). Poniższy raport opisuje **historyczny stan przed podłączeniem bucketa**; jego dawne określenie „R2 niepodłączone” zostało już zastąpione wynikami pilota. Produkcja nadal bez zmian.

**Data: 7 listopada 2026. Status: CZĘŚCIOWO WYKONANY. Testy Node24 i dwa niezależne joby GitHub PASS; RZECZYWISTEJ OPERACJI NA R2 JESZCZE NIE WYKONANO. Nie uruchomiono produkcyjnej instrumentacji.**

> [Punkt wznowienia](START_TUTAJ_ANALITYKA.md) · [Rejestr źródeł](REJESTR_ZRODEL_BADAWCZYCH.md) · [Etap 11](AUDYT_ZDALNY_CAS_ETAP11_20261107.md).

## 1. Zamierzony zakres i dostęp

Etap 12 wymagał osobnego prywatnego bucketa Cloudflare R2 Standard, tokenu ograniczonego do tego bucketa, rzeczywistych warunkowych PUT i odtworzenia stanu na drugim runnerze. **W czasie eksperymentu nie było dostępnego, autoryzowanego połączenia do bucketa R2** ani możliwości odczytu skonfigurowanych sekretów repozytorium. Wyszukiwanie dostępnych integracji nie ujawniło bezpośredniego połączenia Cloudflare R2. Nie wolno było użyć sekretu w chacie ani wymyślać wyniku sieciowego.

Zamiast udawać pełny sukces R2 wykonano:
- rzeczywisty GitHub Actions na **Node.js 24.22.2** z **rzeczywistym klientem AWS SDK v3**, ale **lokalnym serwerem testowym udającym S3**;
- niezależny drugi job na innym runnerze czytający zdalne syntetyczne dane **z GitHub**, nie z R2;
- gotowy skrypt MANUAL ONLY, wymagający świadomego włączenia i sekretów R2, oraz nieaktywny wzorzec workflow;
- audyt istotnego limitu R2 i ryzyk, bez ingerencji w produkcję.

## 2. Dowód wykonywania na GitHub Actions

**Pozytywny finalny test:** [Actions #42413953288](https://github.com/patrykrekin/AppEA/actions/runs/42413953288), gałąź **[research/stage12-node24-s3-contract-20261107](https://github.com/patrykrekin/AppEA/tree/research/stage12-node24-s3-contract-20261107)**, główny SHA kodu próby `03226d8f8e84360ec924f83168eb1fee1d5c63c1`. Dwa joby:

- `sdk-wire`: **9/9 PASS** w Node **v24.22.2** na localhost, `@aws-sdk/client-s3` z `maxAttempts:1`, bez prawdziwych danych dostępowych i bez endpointu R2. Zweryfikowano natywne `PutObjectCommand({IfNoneMatch:'*'})`, `PutObjectCommand({IfMatch:etag})`, duplicate `412`, stale ETag `412`, dwa konkurencyjne `IfMatch` (jeden sukces/jeden `412` **w lokalnym serwerze**), konkurencyjny create-only, odczyt zapisanego obiektu po utracie odpowiedzi, podpis SigV4 zawierający nagłówek `if-match` i brak obiektu `404`.
- `remote-restart-read`: niezależny runner Node **v24.22.2** pobrał **istniejący zdalny commit GitHuba z etapu 11** i poprawnie odczytał `revision=3`, `runId=etap11-fixture-r3`, `digest=fixture:c3`, 3 sztuczne zdarzenia. Dowód przenoszenia danych przez GitHub w innym jobie, **NIE przez R2**.
- Finalny workflow sprawdził też `node --check research/stage12/live-r2-manual.mjs`; **nie uruchomił** tego skryptu.

**Wniosek techniczny:** natywny, aktualny AWS SDK pozwala użyć `IfMatch`/`IfNoneMatch` w `PutObjectCommand` zamiast własnego middleware z wcześniejszego prototypu `@smithy/core`. To mniej zależności i mniejsza powierzchnia potencjalnych błędów. **Nie jest to jeszcze test kompatybilności konkretnych żądań na serwerze Cloudflare.**

## 3. Przygotowany manualny test żywego R2

Kod na **gałęzi badawczej**, a nie produkcyjnej:
- [`research/stage12/live-r2-manual.mjs`](https://github.com/patrykrekin/AppEA/blob/research/stage12-node24-s3-contract-20261107/research/stage12/live-r2-manual.mjs) — dwa tryby `writer` i `reader`, wyłącznie sztuczny JSON, klucz `appea-research/stage12/<unikalny-run-id>/head.json`, guard `APPEA_STAGE12_LIVE_CONSENT=yes`, kontrola formatu identyfikatora i endpointu HTTPS R2, brak `DeleteObject`. Sekrety tylko ze zmiennych środowiskowych, żadne nie są wypisywane.
- [`research/stage12/live-workflow-template.yml`](https://github.com/patrykrekin/AppEA/blob/research/stage12-node24-s3-contract-20261107/research/stage12/live-workflow-template.yml) — **nieaktywny wzorzec**, nie znajduje się w `.github/workflows/` na `main`, więc nie może się sam uruchomić. Przyszły wariant `workflow_dispatch` musi być umieszczony na gałęzi domyślnej dopiero po wyraźnej zgodzie, konfiguracji osobnego chronionego środowiska GitHub i sekretów.
- Przekazana w rozmowie paczka **`AppEA_etap12_Node24_i_pilot_R2.zip`**, SHA256 **`74ac7b9db2da5dca45ca4e57669d2492a04e2f0a3aaa3d607f50303be21c325e`**, zawiera README, test wire, ręczny skrypt i szablon. Repo ma wersję źródłową na badawczej gałęzi.

W przyszłym, **nieuruchomionym** teście na R2:
1. `writer` w jobie A: dla nowego unikatowego klucza `IfNoneMatch:'*'` (sukces), drugi create-only (oczekiwane 412), zmiana z pasującym ETag, odmowa ze starym ETag (412), kontrola finalnej generacji 2.
2. `reader` w jobie B na osobnej VM: `GetObject` tej samej generacji, `IfMatch` do generacji 3, kontrolny odczyt jako **symulacja** utraconego ACK (odrzucenie potwierdzenia już otrzymanego przez klienta), `412` ze starym ETag.
3. Nie dotyka `data.json`, `refresh.yml`, ceny FUT.GG, EMA ani rekomendacji.

**Niedopowiedziane przypadki:** manualny scenariusz nie wymusza równoczesnego wyścigu dwóch **żywych** klientów R2 (te wyścigi sprawdzono na localhost). Nie testuje odległego niepewnego ACK z aktywnym `in-flight PUT`, pełnego produkcyjnego protokołu HOT/COLD, bezpiecznego GC, retencji ani billingów. To etap przed pełnym proof-of-production, nie jego substytut.

## 4. Ważny, nowy limit R2: 429 i warunkowe 412

Oficjalne [R2 Limits](https://developers.cloudflare.com/r2/platform/limits/) i [Error Codes](https://developers.cloudflare.com/r2/api/error-codes/) określają **maksymalnie jeden zapis na sekundę dla tego samego klucza obiektu**. Konkurencyjne lub zbyt częste zapisy do jednego `head.json` mogą dostać **HTTP 429 TooManyRequests**, nawet jeśli test oczekuje `412 PreconditionFailed`. Nie wolno uznawać 429 za potwierdzony konflikt CAS. W ręcznym pilocie rozdzielono operacje na tym samym kluczu o ok. 1,2 s; w docelowym protokole należy zastosować rozsądne tempo, bounded backoff i ponowny odczyt stanu, nie bezwarunkowe powtórzenie PUT.

Co więcej, dokument [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) podkreśla, że **GET 404 po utraconej odpowiedzi nie dowodzi, iż wcześniejszy PUT nie zostanie później zatwierdzony**, jeśli był w locie. Ponowienia wymagają identyfikatora wsadu, warunku zapisu oraz jasnego statusu `ambiguous/fail-closed`. Stary model z etapu 11 zachowuje ten kierunek, ale musi zostać zweryfikowany na żywej usłudze.

## 5. Co trzeba przygotować do prawdziwego pilota

Zgodnie z [R2 S3 setup](https://developers.cloudflare.com/r2/get-started/s3/) i [GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets/):

1. Osobny **prywatny bucket Standard** dedykowany wyłącznie sztucznym próbom, bez publicznego endpointu i bez włączania produkcyjnego eksportu.
2. Token R2 **Object Read & Write**, ograniczony do tego bucketa. Sekrety **nigdy w czacie/commicie**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` jako sekrety chronionego środowiska GitHub `r2-stage12-pilot`. Opcjonalne `R2_ENDPOINT` jako zmienna środowiska, jeśli bucket ma jurysdykcję UE/USA.
3. Świadoma akceptacja **oddzielnego, ręcznego** workflow (z szablonu) umieszczonego na `main` wyłącznie po zgodzie. Nie zmieniać istniejącego `refresh.yml`.
4. Jednorazowy `workflow_dispatch`, dwa osobne runnery, jednoznaczny raport `412`, weryfikacja czasu i `429`; zachować logi. Brak działań, jeśli brak sekretów; nie resetować automatycznie wcześniejszego stanu.
5. Osobno potem zatwierdzić politykę lifecycle dla osieroconych delta i niekasowania segmentów wskazywanych przez HEAD, checkpoint/backup, limit bajtów, budżet i alerty. Ręczny skrypt nie usuwa niczego, bo bez przeglądu GC usuwanie byłoby ryzykowne.

## 6. Stan końcowy i wznowienie

**Potwierdzono:** 9/9 kompatybilności warunkowych operacji klienta AWS SDK na Node24 przeciwko lokalnemu S3, poprawny podpis warunków, dwa niezależne joby CI, odtworzenie syntetycznej rewizji z GitHuba przez drugi job, przygotowanie kodu do ręcznego testu R2.

**Nie potwierdzono:** jakiegokolwiek realnego `PUT`/`GET`/`412` na Cloudflare R2, konkurencji dwóch żywych writerów R2, rzeczywistego potwierdzenia utraconego ACK, retencji/GC na R2, kosztu konta lub produkcyjnej użyteczności. **Etap 12 pozostaje OTWARTY do momentu autoryzowanego testu R2 i oddzielnej oceny GC/monitoringu.**

**Wymagane następne działanie:** użytkownik samodzielnie przygotowuje prywatny bucket, ograniczony token i bezpieczne sekrety GitHub. Po potwierdzeniu gotowości i zgodzie można dopiero uruchomić jeden ręczny test na żywym R2; nie należy prosić użytkownika o wklejanie kluczy do rozmowy.

**Kontrola bezpieczeństwa z dnia testu:** `scraper/scrape.mjs` w `main` nadal miał blob `88912b6f7b8cdc679d1a94ba62510e465d7adac6` bez sondy, a `.github/workflows/refresh.yml` blob `05b3f109a0f17b21073628b60e52ac218be33d2d`; ostatni sprawdzony `data.json` miał `awaria:null`. Nowy workflow CI jest wyłącznie na badawczej gałęzi. Repozytorium `main` zawiera **tylko raporty**, nie instrumentację.
