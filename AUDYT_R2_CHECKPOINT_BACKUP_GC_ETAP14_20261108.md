# Etap 14 — realny Cloudflare R2: checkpoint, backup, odbudowa i kontrolowane usunięcie obiektu testowego

**Data: 8 XI 2026. Wynik: PASS dla checkpointu, backupu i odtworzenia między niezależnymi runnerami oraz testu pojedynczego DELETE; automatyczna retencja i faktyczne GC historycznych delt nadal NIEZATWIERDZONE.**

> [Punkt wznowienia](START_TUTAJ_ANALITYKA.md) · [Rejestr badań](REJESTR_ZRODEL_BADAWCZYCH.md) · [Etap 13](AUDYT_R2_HEAD_DELTA_CAS_ETAP13_20261108.md)

## 1. Zasada izolacji i rozdział dwóch testów

**Dwa osobne wyniki:**
- **[GitHub Actions #42503376666](https://github.com/patrykrekin/AppEA/actions/runs/42503376666)** — Node 24, **39/39** testów inwariantów modelu (checkpoint, backup, uszkodzone dane, przywrócenie, kontrola retencji, zabezpieczenia przed przypadkowym usunięciem). **[Actions #42503394498](https://github.com/patrykrekin/AppEA/actions/runs/42503394498)** i [#42503046868](https://github.com/patrykrekin/AppEA/actions/runs/42503046868) potwierdziły także warianty offline. Testy offline **nie używały** R2.
- **[GitHub Actions #42503579008](https://github.com/patrykrekin/AppEA/actions/runs/42503579008)** — prawdziwe R2, **4/4 joby PASS**: `seed`, `checkpoint`, `restore`, `trash`. Każde zadanie uruchomiono na osobnym GitHub-hosted runnerze, przez chronione środowisko `r2-stage12-pilot`.

Kod pozostaje wyłącznie na [gałęzi research/stage14-r2-checkpoint-restore-gc-20261108](https://github.com/patrykrekin/AppEA/tree/research/stage14-r2-checkpoint-restore-gc-20261108), live checkout zamrożony na SHA `13f65465f6d5f5307ddf69bb8506cc148bca9770`. **Nie podłączono nic do produkcyjnego scrapera/EMA/inwestycji.**

Izolacja R2: wyłącznie sztuczne dane pod nowym, unikalnym prefiksem:
`appea-research/stage14/stage14-42503579008/`

**Nie usuwano niczego z etapu 12 i 13 ani z innych prefiksów.** Nie wykonywano zapytań FUT.GG. Wszystkie sekretne dane dostępu pochodzą z GitHub Environments i nie są wypisywane w raportach.

## 2. Rzeczywisty przebieg: 4 niezależne etapy

### A. `seed` — dwie generacje i kontrolny orphan

Dla nowego prefiksu utworzono `hot/head.json` w generacji 0 przez `If-None-Match: *`. Następnie dopisano dwie syntetyczne delty (`r1`, `r2`) oraz przesunięto HEAD z `If-Match: <poprzedni ETag>` do **generation=2, revision=2**. Trzecią deltę `orphan` zapisano fizycznie, ale celowo **bez publikacji** w HEAD. Odczekiwano ok. 1,3 s pomiędzy zapisami tego samego klucza HEAD, zgodnie z ograniczeniem Cloudflare R2.

**Log:**
```json
{"realR2":true,"synthetic":true,"runId":"stage14-42503579008",
 "generation":2,"revision":2,"committedDeltas":2,
 "uncommittedDeltas":1,"puts":6,"gets":5,"lists":0,"deletes":0}
```

### B. `checkpoint` — osobny snapshot i kopia backup

Kolejny runner odczytał HEAD gen2 i zweryfikował dwa surowe segmenty przez **SHA-256 dokładnych bajtów JSON**. Na ich podstawie utworzył pełny syntetyczny checkpoint (**519 B**) oraz **drugą niezależną kopię obiektu** pod innym kluczem, ale z tym samym SHA-256. Obie kopie zapisał jako immutable `If-None-Match: *`, pobrał i porównał. Następnie atomowo przepiął HEAD przez `If-Match` na checkpoint+backup; generacja zdarzeń pozostała **2**, ale rewizja manifestu wzrosła do **3**. Surowe delty nie zostały skasowane.

**Log:**
```json
{"realR2":true,"runId":"stage14-42503579008",
 "generation":2,"revision":3,
 "checkpointSha":"5b3cd820cfe6a36a8e351aff0b45d90d150b1640ff1e9d022026f1b3c7b3bce9",
 "backupMatches":true,"committedRecords":2,"bytesPrimary":519,"independentKeys":true,
 "puts":3,"gets":6,"lists":0,"deletes":0}
```

**Zastrzeżenie:** backup znajduje się pod innym kluczem, ale **w tym samym buckecie i koncie R2**. Chroni przed utratą pojedynczego obiektu przy zachowanej drugiej kopii; NIE daje geo-redundantnej kopii w niezależnym koncie, ani gotowego planu odzyskania po skasowaniu całego bucketa.

### C. `restore` — odtworzenie bez starego checkpointu i surowej historii

Trzeci runner odczytał checkpoint i osobną kopię backupową. Następnie **odtworzył pierwsze dwa zdarzenia wyłącznie z backupu**, bez pobierania pierwotnych delt ani polegania na treści oryginalnego checkpointu. Dopisał trzecią niezmienną deltę i opublikował `generation=3, revision=4` przy użyciu `If-Match`; odtworzony zestaw **3/3** zdarzeń miał zgodne identyfikatory i SHA-256. Ponowne zatwierdzenie ze starym ETag zostało odrzucone przez **rzeczywiste HTTP 412**.

**Log:**
```json
{"realR2":true,"runId":"stage14-42503579008",
 "generation":3,"revision":4,"recoveredFromBackupWithoutPrimary":true,
 "restoredEvents":3,"oldRawDeltasNotReadForBackup":true,
 "staleEtag":"PRECONDITION_412","puts":3,"gets":6,"lists":0,"deletes":0}
```

**Granica dowodu:** zasymulowano brak dostępu do oryginalnego checkpointu przez *nieużywanie go* podczas odtwarzania, **nie przez jego fizyczne skasowanie**. Tak samo starszych delt nie usuwano przed odtworzeniem. Nie testowano faktycznej utraty całego bucketa.

### D. `trash` — sprawdzenie reguł GC oraz jedno prawdziwe, ograniczone DELETE

Czwarty runner najpierw przeczytał **aktualny** HEAD gen3, checkpoint i backup, sprawdził odtworzenie trzech zdarzeń i wylistował rzeczywiste delty w unikalnym prefiksie runu. Podział dla GC:
- **4 historyczne delty**: 1 aktywna w `HEAD.tail`, 2 starsze skompaktowane w checkpoint i 1 orphan;
- **3 nieaktywne**, lecz świeże (<72h), chronione regułą `KEEP_GRACE`;
- **0** delt dopuszczonych do fizycznego GC i **0** fizycznych usunięć historii.

Następnie utworzył **dokładnie jeden** osobny obiekt `trash/disposable.json` z potwierdzonymi `synthetic=true`, `runId` i `kind=disposable`, sprawdził jego treść i niezmienność HEAD. Wykonał **dokładnie jeden `DeleteObject`** na *tej konkretnej ścieżce*, potwierdził **404** przy nowym GET, ponownie odczytał HEAD i upewnił się, że wszystkie historyczne delty nadal istnieją. Narzucenie ścieżki i budżetu maks. jednego DELETE jest częścią kodu.

**Log:**
```json
{"realR2":true,"runId":"stage14-42503579008",
 "deletedDisposableObjects":1,"deletedHistoryObjects":0,
 "historyObjects":4,"liveTailProtected":1,"youngUncommittedProtected":3,
 "gcEligible":0,"realGcDeletes":0,
 "backupStillRestorable":true,"checkpointAndHistoryIntact":true,
 "puts":1,"gets":9,"lists":2,"deletes":1}
```

**To NIE jest dowód produkcyjnego GC delt**. Fizyczny DELETE sprawdził tylko specjalny, natychmiast kasowalny obiekt jednorazowy, nie obiekt podlegający regule 72h. Nie usuwaliśmy żadnej historycznej delty świeższej niż 72h. Źródło Cloudflare potwierdzające S3 API: [Delete objects](https://developers.cloudflare.com/r2/objects/delete-objects/).

## 3. Stan końcowy bucketa (wyłącznie prefiks etapu 14)

Po kontrolowanym usunięciu jednorazowego obiektu pozostają **7 małych obiektów**:
- 1 `hot/head.json`, `generation=3, revision=4`;
- 1 `checkpoints/<sha256>.json`;
- 1 `backups/<sha256>.json`;
- 4 `deltas/<sha256>.json` (dwie z poprzedniej historii materializowane w checkpoint, jedna nowa tail i jedna niezatwierdzona orphan).

Nic nie zostało skasowane ani zmienione pod prefiksami stage12/stage13. `HEAD` i obiekty z testu stage14 pozostawiono jako dowód; nie są częścią produkcyjnego magazynu.

## 4. Koszty, limity, ograniczenia

Z logów poszczególnych jobów **sumaryczne wywołania na poziomie ścieżki skryptu**:
- **13 prób PUT** (w tym jedno oczekiwane odrzucenie 412);
- **26 GET**, **2 ListObjectsV2**, **1 DeleteObject**;
- 4 osobne runnery i około 519 B na obiekt checkpointu.
To NIE jest raport z panelu Cloudflare Billing ani formalnie policzona faktura. Odrzucone operacje mogą różnić się klasyfikacją billingową. Niewielka skala mieści się planistycznie w darmowej puli, lecz brak gwarancji rachunku zero.

Bezpieczniki: `permissions: contents: read`, chronione środowisko `r2-stage12-pilot`, test tylko `synthetic`, ograniczenie ścieżki do `stage14-<github.run_id>`, warunkowe PUT, budżety w procesie **8 PUT / 30 GET / 3 LIST / 1 DELETE** maksimum, brak bulk delete, brak automatycznych lifecycle, rozróżnienie 412 od innych błędów. Jednorazowy workflow najpierw miał błąd parsowania YAML — [run #42503472554](https://github.com/patrykrekin/AppEA/actions/runs/42503472554), **zero jobów / zero operacji R2**; po zacytowaniu dwukropka w nazwie kroku następny [run #42503579008](https://github.com/patrykrekin/AppEA/actions/runs/42503579008) był PASS.

Po sukcesie **usunięto automatyczny trigger push** z workflow `.github/workflows/stage14-live-r2-one-shot.yml` w commicie `744c8f0e7d37ddce33ced6df7b1a19804115868a`. Pozostał tylko `workflow_dispatch` z potwierdzeniem `RUN_STAGE14_R2`; brak harmonogramu. Nie włączono żadnych nowych uruchomień odświeżania cen.

## 5. Ważne granice architektury

1. **Checkpointing udowodniony dla 2 poprzednich zdarzeń + 1 kolejnego**, nie dla 48h/7 dni rzeczywistych zdarzeń; docelowy stan i ledger wymagają rotacji, skalowania, kontroli wzrostu, osobnego audytu strat.
2. Dwie kopie checkpointu w **jednym buckecie** to jeszcze nie pełny disaster recovery / offsite backup.
3. Reguła **72h grace** jest wartością projektową dla ostrożnego dry-run, nie estymacją optymalnej retencji i nie oznacza automatycznego pozwolenia na kasowanie po 72h. Bezpiecze GC wymaga również *wykluczenia aktywnych writerów*, trwałego checkpointu/backup i ponownej kontroli referencji bez wyścigu TOCTOU.
4. **Nie uruchomiono żadnej lifecycle expiration rule**; taka reguła na całym buckecie mogłaby usunąć wskazywane obiekty [Cloudflare R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
5. Nie sprawdzono fizycznego zaniku zasilania w locie, zdalnej utraty ACK przed ostatecznym wynikiem, wymuszonego `429`, restore po utracie całego bucketa, twardego limitu kosztów lub jakości sygnałów.
6. R2 dokumentuje silną spójność listowania i odczytu oraz widoczność usunięcia [Consistency](https://developers.cloudflare.com/r2/reference/consistency/); nie daje to automatycznie atomowej transakcji obejmującej kilka obiektów.

## 6. Wniosek i punkt wznowienia

**Etap 14: PASS jako ograniczony test checkpointu/backup, odtwarzania na nowej VM, ochrony historii i pojedynczego `DeleteObject` dla specjalnego obiektu jednorazowego.**

**Nie zamykamy jako gotowy produkcyjny GC ani pełny disaster recovery.** Wciąż wymagane:
- bezpieczna, trwała rotacja dużego ledgeru bez ukrytej utraty potrzebnych obserwacji;
- właściwe referencyjne GC po wieku i zatwierdzonym checkpoint/backupu, z fencing/lease przeciw writerom (nie tylko jedno GET przed DELETE);
- backup na niezależnym zasobie, odtwarzanie po utracie obiektów/całego bucketa;
- koszt/alerty i kontrola faktycznej retencji.

**Proponowany etap 15:** izolowany pilotaż *realnego pasywnego zbierania decyzji* na bardzo ograniczonej grupie i czasie, **tylko po** ustaleniu, jak bezpiecznie zatrzymywać rosnący dziennik. Alternatywnie najpierw 15A: skalowanie checkpoint+backup i protokół fencing/GC; nie łączyć collectora z `refresh.yml` dopóki te elementy nie będą sprawdzone. Nie zmieniać EMA, selekcji inwestycji ani częstotliwości zbierania.

## 7. Źródła zewnętrzne

- [Cloudflare R2 Consistency](https://developers.cloudflare.com/r2/reference/consistency/) — atomowe warunki i silna spójność odczytu/listowania/usuwania.
- [Cloudflare R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) — reguły expiry mogą zadziałać niezależnie od referencji aplikacji.
- [Cloudflare R2 Delete objects](https://developers.cloudflare.com/r2/objects/delete-objects/) — działanie S3 `DeleteObject`.
- [Cloudflare R2 Limits](https://developers.cloudflare.com/r2/platform/limits/) — maksymalnie 1 zapis/sekundę na ten sam klucz i limit długości nazwy.
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — opłaty za storage i operacje; brak gwarancji zerowego kosztu.
