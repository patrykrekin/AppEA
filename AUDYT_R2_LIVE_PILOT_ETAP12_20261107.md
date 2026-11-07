# Etap 12 — rzeczywisty test Cloudflare R2 Standard (LIVE, syntetyczne dane)

**Data: 7 listopada 2026. Wynik: PASS w przetestowanym zakresie.**

To jest **nowszy raport** niż [AUDYT_R2_NODE24_ETAP12_20261107.md](AUDYT_R2_NODE24_ETAP12_20261107.md), który dokumentował etap *przed* otrzymaniem dostępu do prawdziwego R2. Po skonfigurowaniu przez użytkownika prywatnego bucketa i czterech sekretów chronionego GitHub Environment `r2-stage12-pilot` przeprowadzono **rzeczywisty, jednorazowy test sieciowy do Cloudflare R2**. Nie oznacza to jeszcze gotowości produkcyjnego HOT/COLD.

## 1. Dowód i zakres uprawnień

- **GitHub Actions run [#42416561870](https://github.com/patrykrekin/AppEA/actions/runs/42416561870)**: `completed/success`, **writer PASS + reader PASS**, dwa niezależne GitHub-hosted runners.
- **Workflow**: [`.github/workflows/stage12-live-r2-one-shot.yml`](https://github.com/patrykrekin/AppEA/blob/main/.github/workflows/stage12-live-r2-one-shot.yml), utworzony wyłącznie po wyraźnej zgodzie użytkownika na jednorazowy test. Pierwszy run wystartował przez ściśle ograniczony trigger push jednego pliku, z kontrolą unikalnego znacznika autoryzacji. **Natychmiast po zakończeniu testu trigger push został usunięty** w commicie `a76e279434d131d7a78cdba77bf9ef27a6802583`. Obecnie działa **tylko `workflow_dispatch`** i to po wpisaniu `RUN_STAGE12_R2`. Żaden cron nie został dodany.
- **Kod pilota** przypięty do zamrożonego SHA `03226d8f8e84360ec924f83168eb1fee1d5c63c1` na gałęzi [research/stage12-node24-s3-contract-20261107](https://github.com/patrykrekin/AppEA/tree/research/stage12-node24-s3-contract-20261107); dwa joby pobrały ten sam, niemodyfikowany skrypt.
- Środowisko `r2-stage12-pilot` dostarczyło sekrety R2 bez wypisywania ich wartości w logach. **Nie sprawdzano automatycznie** zakresu nadanych uprawnień tokenu na poziomie Cloudflare — ograniczenie do osobnego testowego bucketa zostało skonfigurowane przez użytkownika.
- Testowy, prywatny obiekt: `appea-research/stage12/stage12-42416561870/head.json` w buckecie wskazanym przez `R2_BUCKET`. Tylko sztuczny JSON z `stage=12, synthetic=true, revision, runId, receipt`. **Nie odczytywano i nie zmieniano rzeczywistych kart ani cen FUT.GG. Nie wykonywano DeleteObject**. Ten maleńki obiekt pozostaje w testowym buckecie, dopóki nie zostanie osobno usunięty.
- `scraper/scrape.mjs` i `refresh.yml` nie były modyfikowane; test nie jest połączony z odświeżaniem cen.

## 2. Wynik rzeczywistej usługi R2

### Job writer (GitHub Actions)

Potwierdzenie w logu z **2026-11-07 21:35:23 UTC**:

```text
STAGE12_REAL_R2_WRITER {"realR2":true,"phase":"writer","revision":2,"was412":true,"runId":"stage12-42416561870","synthetic":true}
```

**Wykonane operacje na Cloudflare R2:**
1. `GET` nieistniejącego przed testem, unikalnego klucza; `404`.
2. `PutObject If-None-Match: *` — zapis generacji 1; **sukces**.
3. Kolejna próba `PutObject If-None-Match: *` — **412 PreconditionFailed** (zgodnie z oczekiwaniem).
4. `GET` — pobrana generacja 1 i ETag.
5. `PutObject If-Match: <ETag gen1>` — zapis generacji 2; **sukces**.
6. `PutObject If-Match: <stary ETag gen1>` — **412 PreconditionFailed**.
7. `GET` — potwierdzona gen2.

### Job reader (na niezależnym runnerze)

Potwierdzenie w logu z **2026-11-07 21:35:40 UTC**:

```text
STAGE12_REAL_R2_READER {"realR2":true,"phase":"reader","revision":3,"was412":true,"recoveredAfterSimulatedLostAck":true,"runId":"stage12-42416561870","synthetic":true}
```

1. Nowy runner otworzył ten sam obiekt z R2 i **odczytał generację 2**, zapisaną przez inny runner.
2. `PutObject If-Match: <ETag gen2>` — zapis gen3, sukces.
3. W kodzie **celowo pominięto otrzymane potwierdzenie** i wykonano nowy `GET`: odzyskano gen3 z tym samym `receipt`.
4. `PutObject If-Match: <stary ETag gen2>` — **412**.
5. Cały workflow zakończył się **success**.

**Wynik:** rzeczywisty, zdalny `IfNoneMatch`, `IfMatch`, `412` i przenoszenie zatwierdzonego stanu pomiędzy dwoma osobnymi runnerami zostały **faktycznie potwierdzone**, a nie tylko zasymulowane.

## 3. Granice dowodu — nie mylić z gotowością produkcji

- Test celowo wykorzystywał kolejność *writer → reader*, a nie **jednoczesny wyścig dwóch niezależnych writerów**. Potwierdza semantykę CAS z nieaktualnym ETag, nie obejmuje stresu współbieżności lub dystrybucji.
- **Utrata ACK została zasymulowana przez pominięcie odebranego potwierdzenia po sukcesie**, nie przez rzeczywiste zerwanie połączenia przed poznaniem wyniku. Otwarta jest ambiwalencja in-flight `PUT` oraz jego późniejszego zatwierdzenia.
- R2 dokumentuje limit **1 zapis/s dla jednego klucza**; między próbami na tym kluczu odczekiwano ok. 1200 ms, żeby zwykły `429 TooManyRequests` nie maskował `412`. W realnym protokole potrzebne są bounded backoff i fail-closed przy niepewnym wyniku.
- Test dotyczył **pojedynczego obiektu manifestu**. Nie wykonał pełnego wieloetapowego protokołu z `immutable delta → commit HEAD`, odzyskiwania osieroconych delta, TTL/GC, walidacji hash segmentów ani backupów.
- Bucket jest rzeczywisty, ale brak automatycznej kontroli **jego klasy, reguł lifecycle, ustawień prywatności i zakresu uprawnień tokenu** przez narzędzie; to należy sprawdzić w panelu R2.
- Nie oceniano szybkości/efektywności inwestycyjnej ani cen sprzedaży kart.

## 4. Koszt i bezpieczeństwo

Zachowano tylko **jeden mały obiekt JSON** pod unikalnym prefiksem tego pilota. Test wykonał **6 wywołań `PutObject`** (w tym 3 oczekiwane odmowy z kodem 412) i **5 wywołań `GetObject`**, nie licząc ewentualnych wewnętrznych żądań infrastruktury; liczbę wyprowadzono z rzeczywiście wykonywanej ścieżki kodu, a nie z faktury Cloudflare.

To zużycie jest **bardzo małe wobec darmowej puli**, ale **nie deklarujemy konkretnego rachunku ani gwarancji zerowego kosztu**: danych billingowych konta nie odczytywano. Token i dane karty nie były udostępniane w rozmowie ani repozytorium.

Po udanym teście wyłączono automatyczny trigger push, pozostawiając tylko ręczne `workflow_dispatch` z wyraźnym hasłem potwierdzenia; `permissions: contents: read`, joby `timeout-minutes: 4`, chronione środowisko R2, brak operacji `DeleteObject`, brak cron i dodatkowych pobrań FUT.GG.

## 5. Decyzja i dalszy etap

**Etap 12: ZAMKNIĘTY jako jednorazowy, skuteczny test prawdziwego R2 i odtworzenia między dwiema VM.** Wcześniejszy status „otwarty — nie podłączono R2” w dokumencie przedpilotażowym jest **nieaktualny** po tym teście.

**Nie ma jeszcze zgody na produkcyjny collector.** Następny etap 13 powinien przetestować w izolacji:
- pełny protokół **immutable delta → HEAD CAS**, z możliwością pozostawienia i bezpiecznego sprzątania osieroconych delta;
- kontrolowane `412` oraz `429` w konkurencji *dwóch rzeczywistych writerów*, bez naruszania limitu 1 write/s/key w normalnej pracy;
- bezpieczne wznowienie po przerwanym `PUT` w locie i po wygaśnięciu `receipts`;
- bezpieczną retencję segmentów, checkpoint/backup, ograniczenia kosztu i alerty degradacji;
- dopiero później **pasywne** zbieranie prawdziwych decyzji w osobnym procesie, niezmieniającym logiki produkcyjnej.

**Źródła:**
- [Cloudflare R2 S3 conditional PutObject](https://developers.cloudflare.com/r2/api/s3/extensions/) — atomowy `If-Match`, `If-None-Match`;
- [Cloudflare R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) — spójność i niepewny wynik in-flight;
- [Cloudflare R2 limits](https://developers.cloudflare.com/r2/platform/limits/) — 1 write/s/key;
- [Cloudflare R2 error codes](https://developers.cloudflare.com/r2/api/error-codes/) — rozróżnienie 412/429;
- [GitHub workflow_dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) — ręczne uruchamianie z gałęzi domyślnej.
