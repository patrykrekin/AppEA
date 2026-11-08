# Etap 13 — realny R2: immutable delta → HEAD CAS, dwaj piszący, orphan i GC dry-run

**Data: 8 listopada 2026. Wynik: eksperyment integracyjny PASS; rzeczywiste usuwanie i produkcyjne retencje nadal ZABLOKOWANE.**

> [Punkt wznowienia](START_TUTAJ_ANALITYKA.md) · [Rejestr](REJESTR_ZRODEL_BADAWCZYCH.md) · [Etap 12 LIVE](AUDYT_R2_LIVE_PILOT_ETAP12_20261107.md)

## 1. Zakres i bezpieczeństwo

Test na **prawdziwym prywatnym Cloudflare R2** z już skonfigurowanym chronionym GitHub Environment `r2-stage12-pilot`, wyłącznie na **syntetycznych danych** pod jednorazowym prefiksem:

`appea-research/stage13/stage13-42501699777/`

Nie odczytywano prawdziwych kart ani cen; nie wykonywano nowych żądań FUT.GG. Nie zmieniano `scraper/scrape.mjs`, `.github/workflows/refresh.yml`, `data.json`, EMA, definicji okazji ani publikacji. Brak operacji `DeleteObject`, brak zmian lifecycle bucketa.

**Dowody:**
- [GitHub Actions #42501699777](https://github.com/patrykrekin/AppEA/actions/runs/42501699777) — **6/6 jobów PASS**: `init`, `candidate_B`, `candidate_A`, `orphan`, `inspect`, `advance`. Run final `completed/success`.
- [GitHub Actions #42501564803](https://github.com/patrykrekin/AppEA/actions/runs/42501564803) — **24/24** offline testów inwariantów danych i `node --check` w Node 24, również kontrola niezmienionego SHA produkcyjnego `scrape.mjs`.
- Kod badawczy (niezmergowany): [research/stage13-r2-immutable-cas-20261108](https://github.com/patrykrekin/AppEA/tree/research/stage13-r2-immutable-cas-20261108), pliki `research/stage13/core.mjs`, `test-core.mjs`, `live-pilot.mjs`. Runner live przypięty do commit SHA `ea6e6f9deca14dcd98dc31a4bcbd9e8e98b85139`.
- [`.github/workflows/stage13-live-r2-one-shot.yml`](https://github.com/patrykrekin/AppEA/blob/main/.github/workflows/stage13-live-r2-one-shot.yml) — dopuszczono tylko **jeden** push z unikalnym znacznikiem `[stage13-authorized-live-once]`, po teście **usunięto push trigger** w commicie `4a77383a0f7f7617904f6bee51cf606f86d1f8fd`. Obecnie wyłącznie `workflow_dispatch` z wymaganym tekstem `RUN_STAGE13_R2`, bez harmonogramu.

## 2. Faktyczny wynik R2 — bez emulatora

### Start

`init`: `PutObject If-None-Match: *` utworzył **HEAD generation=0**, wyłącznie w nowym prefixie runu. ETag został przekazany do obu równoległych, niezależnych jobów GitHub. Żaden z nich nie miał prawa wykonać bezwarunkowego nadpisania.

### Dwaj konkurenci A/B (ten sam bazowy ETag)

- **B — COMMITTED**: najpierw zapis niezmiennej delty o nazwie zawierającej jej SHA256, następnie `PutObject If-Match: <gen0 ETag>` zatwierdził `HEAD generation=1`. Log: `STAGE13_CANDIDATE {"realR2":true,"writer":"B","result":"committed","headGeneration":1,...}`.
- **A — PRECONDITION_412**: osobna deltapaczka została zapisana jako niezmienna, ale aktualizacja `HEAD` z **tym samym starym ETag** została odrzucona rzeczywistym **HTTP 412**. Log: `STAGE13_CANDIDATE {"realR2":true,"writer":"A","result":"PRECONDITION_412","headGeneration":1,...}`.
- Joby uruchomiono współbieżnie na dwóch runnerach GitHuba, lecz nie dowodzimy, że ich dwa `PutObject` były *w tej samej milisekundzie*. Istotne jest, że **próbowały zatwierdzić różny stan z tej samej wersji początkowej**.
- Nie wystąpił `429` w tym jednym uruchomieniu; obsługa `429` pozostaje świadoma i oddzielona od `412`, ale nie jest empirycznie zbadana pod dużym obciążeniem.

### Celowa awaria przed commit HEAD i kontrola orphan

Osobny job `orphan` zapisał deltapaczkę i **celowo nie aktualizował HEAD**.

Kolejny job `inspect` z niezależnego runnera:
- odczytał `HEAD generation=1`;
- pobrał wskazaną deltę, zweryfikował **SHA256 jej oryginalnych bajtów** i schemat oznaczony `synthetic=true`;
- zlistował dokładnie **3 delty** w obrębie tego runu;
- sklasyfikował **1 referencjonowaną**, **2 orphan** (przegrana oferta A i celowo niezatwierdzona delta);
- ocenił je jako **KEEP_GRACE** (wiek młodszy niż przyjęte minimum 72 h). **Zero delete.**

Dowód: `STAGE13_INSPECT {"realR2":true,"phase":"inspect","runId":"stage13-42501699777","generation":1,"winner":"B","objects":3,"orphan":2,"eligibleForGc":0,"deletes":0,...}`.

### Nowsza generacja, historia i symulowany utracony ACK

Ostatni job `advance`:
1. Odczytał gen1 i pobrał jej deltę.
2. Zapisał nową niezmienną deltę `RECOVERY` i `PutObject If-Match: <gen1 ETag>`, otrzymując **gen2**.
3. **Celowo zignorował odebraną odpowiedź sukcesu**; nowy `GET` znalazł gen2 oraz `receipt` nowego wsadu, dzięki czemu nie dodano go ponownie.
4. Pobrał i sprawdził hashe **obydwu** delt wskazanych w łańcuchu HEAD.
5. Spróbował zapisać ze starym ETag gen1 — rzeczywisty **412**; gen2 pozostała nienaruszona.
6. Ponownie wykonał **GC dry-run**: **4 delta, 2 zatwierdzone, 2 orphan** (wciąż chronione grace). **Zero delete**.

Dowód z logu:

```json
{"realR2":true,"runId":"stage13-42501699777","generation":2,
 "receiptsVerified":2,"staleWrite":"PRECONDITION_412",
 "orphanUncommitted":2,"orphanGcDryRun":0,"actualDeletes":0,
 "simulatedLostAckRecovered":true,"synthetic":true,
 "puts":3,"gets":6,"lists":1}
```

**Koniec:** 1 `hot/head.json` + 4 odrębne `deltas/<sha256>.json` = **5 małych obiektów** w testowym prefixie. Dwa składniki łańcucha są zatwierdzone; dwie niezatwierdzone delty **pozostawiono nienaruszone**. Dodatkowo w buckecie może pozostawać obiekt etapu 12, pod **innym prefixem**.

## 3. Koszt, limity i kontrola zagrożeń

Ten eksperyment wykonał wg faktycznej ścieżki kodu **9 prób PUT** (7 skutecznych i 2 odrzucone 412), około **15 GET** oraz **2 ListObjectsV2**. Nie czytano billingowego stanu konta; nie twierdzimy, że każda odrzucona operacja podlega tej samej stawce. Zastosowano:
- `@aws-sdk/client-s3`, `maxAttempts:1`, żadne sekrety nie są logowane;
- wyłącznie prefix `appea-research/stage13/<GITHUB_RUN_ID>/`, oddzielny od istniejących danych;
- każda operacja PUT obowiązkowo z `If-None-Match: *` albo `If-Match: ETag`, bez overwrite bez warunku;
- limit payload `MAX_HEAD=65 536 B`, `MAX_DELTA=8 192 B`, maks. 3 PUT na job i 3 paginowane listowania;
- brak retry w ciemno po nieznanym ACK; to celowo *tylko* krótki pilot, bez długiego cyklu produkcyjnego;
- limit z dokumentacji R2: **1 zapis/s na ten sam klucz** (w stresie `429` może maskować `412`); po etapie 13 nie automatyzujemy zapisu co sekundę.

**Nie wprowadzono reguły lifecycle do bucketa.** Automatyczny expiry oparty jedynie na wieku może skasować deltę wskazywaną przez aktualny HEAD — nie wolno tego uruchomić bez trwałego checkpoint/backup i dowodu, że wskazany obiekt ma zewnętrzną kopię.

## 4. Zastrzeżenia / czego jeszcze nie wiemy

- Brak fizycznego rozłączenia sieci w trakcie `in-flight PUT`. Utrata ACK jest **tylko symulowana** poprzez zignorowanie otrzymanego sukcesu; po zerwaniu połączenia negatywny GET nie dowodzi finalnego niepowodzenia, jeśli PUT nadal może zostać zatwierdzony.
- Nie próbowano fizycznego `DeleteObject`. Próg **72 h** to minimalny bezpieczny czas **przyjęty na potrzeby dry-run**, a nie optymalny wymóg strategii AppEA. Testy offline obejmują starsze orphan jako `ELIGIBLE_DRY_RUN_ONLY` i nigdy nie usuwają wskazanych obiektów. Nie dowiedziono skutecznego, odpornego GC/compaction.
- Brak automatycznej kopii zapasowej, sprawdzenia trwałego checkpointu ani pełnego odtwarzania po usunięciu starej delty. `HEAD` trzyma tylko krótką listę przy tym pilocie (max16 generacji), więc **nie nadaje się** bezpośrednio na długotrwały collector.
- Nie testowano prawdziwych sygnałów produkcji, rozkładu wysokości cen, dynamiki 1–2min, budżetu konta, billing alertów lub zachowania przy throttlingu 429.
- R2 `If-Match` daje atomowość **jednego klucza**, nie transakcyjność zapisu HEAD+DELTA. Niezatwierdzony segment zachowujemy jako orphan, nie „udajemy”, że należał do historii.

## 5. Decyzja i następny krok

**Etap 13 — pilot protokołu commit i równoległych piszących: PASS**. Udowodniono na prawdziwym R2:
- `immutable delta → HEAD CAS` i stabilność opublikowanego stanu;
- jeden zwycięzca i jeden odmówiony writer o tym samym ETag, bez utraty zwycięskich danych;
- odróżnienie orphan od obiektu zatwierdzonego;
- poprawność chain/sha256 po kolejnej generacji;
- idempotentne rozpoznanie **symulowanej** utraty ACK w najnowszej generacji;
- bezpieczną **symulację** GC bez usuwania.

**Zadanie GC / checkpoint / retencja nadal OTWARTE.** Nie wdrażamy jeszcze produkcyjnego kolektora. Kolejny kontrolowany etap 14 powinien obejmować: trwały snapshot/checkpoint, odbudowę łańcucha po przycięciu, udokumentowane safe GC (z ochroną obiektów referencjonowanych i bounded deletes tylko na testowym prefixie), backup restore oraz alerty budżetu. Dopiero po ich teście wolno rozważyć samodzielny *pasywny* collector. Wcześniejszy test wspierający statystyczny brak grupy kontrolnej z etapu 9 też pozostaje ważny.

### Zewnętrzne źródła

- [Cloudflare R2 conditional operations](https://developers.cloudflare.com/r2/api/s3/extensions/) — atomowe warunki.
- [Cloudflare R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) — read-after-write i niepewny in-flight.
- [Cloudflare R2 limits](https://developers.cloudflare.com/r2/platform/limits/) — 1 zapis/s na ten sam klucz, 429 przy throttle.
- [Cloudflare R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) — reguły expiry, opóźnienia i zakres prefixu.
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — rozliczenia zależne od liczby operacji i storage, bez gwarancji rachunku.
