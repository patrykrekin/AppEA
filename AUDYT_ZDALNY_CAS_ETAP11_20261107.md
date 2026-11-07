# Etap 11 — zewnętrzna trwałość, atomowy CAS i koszt magazynu AppEA

**Data: 7 listopada 2026. Status: ZAKOŃCZONE BADANIE / GOTOWY PROTOTYP, ALE BEZ ŻYWEJ INTEGRACJI R2 I BEZ WDROŻENIA PRODUKCYJNEGO.**

> Punkt wznowienia: [START_TUTAJ_ANALITYKA.md](START_TUTAJ_ANALITYKA.md) · Rejestr: [REJESTR_ZRODEL_BADAWCZYCH.md](REJESTR_ZRODEL_BADAWCZYCH.md) · Etap 10: [AUDYT_MAGAZYN_WATCHLIST_ETAP10_20261107.md](AUDYT_MAGAZYN_WATCHLIST_ETAP10_20261107.md).

## 1. Co porównano i czego nie robiono

Cel: wybrać najprostszy bezpieczny magazyn dla aktywnej watchlisty oraz dziennika obserwowanych sygnałów **pomiędzy niezależnymi uruchomieniami** i przetestować prawidłowość CAS/ponowień.

| Wariant | Zapis między runnerami | Mechanizm konfliktu | Ryzyko i decyzja |
|---|---|---|---|
| Lokalny SQLite z etapu 10 | **Nie** (nowy runner nie ma poprzedniego dysku) | Lokalny transaction/commit | Odrzucony jako jedyny magazyn trwały |
| GitHub, **osobna gałąź badawcza** | **Tak**, repo jest zdalne | `expected_sha` + rodzic commitu + non-fast-forward update | **Rzeczywiście przetestowany** na małej sztucznej gałęzi; niezalecany na wielomiesięczne setki aktualizacji dziennie |
| Cloudflare **R2 Standard** | **Tak** | Atomowe `PutObject` `If-Match` / `If-None-Match: *` z ETag + strong read-after-write | **Preferowany kandydat docelowy**, ale **bez faktycznego testu na koncie R2** |
| Artefakty GitHub Actions | Czasowo | Brak atomowego CAS dla wspólnego HOT | Nie są trwałą bazą z kontrolą konkurencji |

Brak prób dodatkowych żądań FUT.GG, prawdziwych rekomendacji i aktualizacji `scraper/scrape.mjs`, `refresh.yml`, `data.json`, `historia-kart.json` lub progów.

## 2. Rzeczywisty test zdalnego repo GitHub — co POTWIERDZONO

Utworzono **wyłącznie gałąź** `research/remote-cas-stage11-20261107`, początkowo z SHA `9188a5bd652a5848a704551458fe6f199fe37664`. Wszystkie obiekty były **syntetyczne**. Zapis przez Git blob → tree → commit → zdalny update ref z `expected_sha`, `force=false` (nie za pomocą `create_file` na domyślnej gałęzi).

- Generacja 1: commit [`e361defe821e0a86a48f516cdcd989643a869175`](https://github.com/patrykrekin/AppEA/commit/e361defe821e0a86a48f516cdcd989643a869175) — JSON `revision=1`, jeden sygnał testowy. Zdalny ref wskazał commit; następny odczyt przez osobne wywołanie API potwierdził tę samą treść.
- Generacja 2: dwaj kandydaci A i B z **tym samym rodzicem**. A [`f11b7c8ba13dec2ff4d447fbeaafbe8196d7eff6`](https://github.com/patrykrekin/AppEA/commit/f11b7c8ba13dec2ff4d447fbeaafbe8196d7eff6) zapisał się i ref się zmienił; B `0bfb24d15ef44a00f329e8e2d0f64863964c13f4` nie został opublikowany. Wywołanie B dało jednak **ogólny błąd GraphQL (UNKNOWN)**, także przy powtórzeniu na starym `expected_sha`, **nie** jednoznaczny `409`. Obserwowany brak utraty aktualizacji jest wartościowy, ale nie uznajemy go za ścisły test kodu CAS/409.
- Generacja 3: [`694b2d382b3440fb186a4f65016069e4ff134ef9`](https://github.com/patrykrekin/AppEA/commit/694b2d382b3440fb186a4f65016069e4ff134ef9) wskazuje rodzica gen2. Po udanym zapisie **zasymulowano utratę potwierdzenia** (wyjście nie było używane do odzyskania). W kolejnym niezależnym wywołaniu zdalny `state.json` miał `revision=3`, prawidłowe `runId`/`digest` i wszystkie trzy testowe zdarzenia; zatem należało **nie powtarzać zapisu**.
- Końcowa linia genealogiczna **Gen1 → Gen2(A) → Gen3**, ref pozostał na Gen3. Nie wykonano testu **pomiędzy dwoma GitHub-hosted runners**; użyto odrębnych klientów/następujących po sobie wywołań API.

Nie wolno na tej podstawie twierdzić, że GitHub będzie optymalnym magazynem wysokiej częstotliwości. Dokumentacja [GitHub Refs](https://docs.github.com/en/rest/git/refs) gwarantuje tryb bez `force` pilnujący fast-forward, ale nie jest równoważna **naszemu** przechwyceniu jawnego błędu 409. Według [Repository Limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) automatycznie generowane szybko rosnące pliki lepiej trzymać poza Git, by nie pogarszać działania repozytorium.

**Ważny audyt izolacji:** testowe rewizje nie zostały scalone do `main`. Kod w `main` i `refresh.yml` nadal należy osobno sprawdzać po każdej operacji; poprzedni etap wykazał ryzyko niezamierzonej edycji domyślnej gałęzi.

## 3. Preferowany protokół R2 — bez multi-key transaction

Przyjęty design to **immutable delta + jeden atomowo aktualizowany manifest HOT** w prywatnym bucket R2 Standard.

1. `GET hot/head.json` — odczytaj ETag, `generation`, `lastAt`, `lastDigest`, aktywną watchlistę, SHA256 stanu i ograniczony zbiór ostatnich identyfikatorów zatwierdzonych wsadów. Brak pliku bez wyraźnej flagi init → błąd.
2. Nie zmieniając przeszłości, użyj poprzedniego deterministycznego reduktora z etapu 10. Wyciągnij nowe *wyłącznie obserwowane* zdarzenia. Stan `unobserved` nie oznacza sprzedaży.
3. Zapisz **niezmienną paczkę delta** pod kluczem zależnym od SHA256 jej bajtów, za pomocą `PutObject If-None-Match: *`. Zweryfikuj istniejący obiekt przy powtórzeniu.
4. Dopiero kiedy delta jest potwierdzona, zapisz zmieniony `head.json` z `If-Match: <odczytany ETag>` (pierwszy raz `If-None-Match: *`). **Ten jeden warunkowy PUT jest punktem commit**. Przy `412 PreconditionFailed` odczytaj nowy HEAD i **przelicz** stan; żadnych bezwarunkowych overwrite.
5. W razie utraty ACK odczytaj HEAD i porównaj oryginalny `at+normalizedDigest`. Jeśli nowszy writer nadpisał HEAD, szukaj własnego wsadu w **ograniczonym** dzienniku `receipts`. Gdy wpis wygasł, zakończ jako **ambiguous/fail-closed**, nigdy jako automatyczny nowy sukces.
6. Niepoprawny checksum, brak wskazanej delta lub przekroczenie 64 KiB HOT → przerwij i zachowaj poprzedni zatwierdzony stan.

**Źródło gwarancji:** [Cloudflare R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) i [Conditional S3 operations](https://developers.cloudflare.com/r2/api/s3/extensions/): R2 dokumentuje silną spójność odczytu oraz atomowe sprawdzanie `If-Match`/`If-None-Match` przy `PutObject`. To **deklaracje dostawcy**, jeszcze nie zweryfikowane na koncie AppEA.

**Nie jest to transakcja obejmująca dwa obiekty**: niezatwierdzona delta może zostać **osierocona**, np. po awarii przed zmianą HEAD. Usuwanie takich delta wymaga bezpiecznej rotacji; automatyczny TTL nie może usunąć obiektu, na który nadal wskazuje HOT. Dodatkowo po bardzo długiej przerwie HEAD wciąż będzie wskazywał ostatni segment — trzeba zdefiniować checkpoint, archiwizację i bezpieczną procedurę konserwacji. To **otwarta kwestia przed wdrożeniem**.

## 4. Lokalne testy modelu CAS (Cloudflare nie wywołane)

Odrębny test z użyciem lokalnego emulatora silnie spójnego, warunkowego zapisu do plików, współdzielonych przez niezależne procesy Node 22.16.0:

- **19/19 PASS**, w tym brak HEAD i jawne init, idempotentne retry, zmiana wsadu przy tym samym czasie, ponowny odczyt w drugim procesie, wynik w przyszłym oknie, błąd przed zmianą HEAD, utrata ACK po zmianie HEAD, **utrata ACK, po której inny writer zapisał nowszy stan**, brak ceny → `unobserved`, `412` przy błędnym ETag, zapobieganie bezwarunkowemu zapisywaniu, równoległe utworzenie tego samego klucza (dokładnie jeden zwycięzca), uszkodzony hash, brak segmentu, limit 64 KiB, wygaśnięcie historii receipt → fail-closed.
- **Stres 350 przebiegów × 154 sztuczne karty = 53 900 obserwacji**, generacje **350/350**, aktywne watches na końcu **12**.
- **Rozmiar HOT 35 756 B przy limicie 65 536 B**, w tym max **256 ostatnich `receipts`**; 350 immutable delta i całkowity rozmiar w lokalnym emulatorze **414 555 B**. Średni czas wsadu w tym jednym teście ~**3,70 ms**, `p95=5,35 ms`, max **27,44 ms**; pamięć szczyt RSS ok. **47,0 MB**. To szybkość lokalnego systemu plików **NIE** sieci Cloudflare.
- **UWAGA:** `receipts` maksymalnie 256 i okno czasu maksymalnie 48h, zależnie od tego, które ograniczenie zadziała wcześniej. Przy rzeczywistym interwale 2min to zaledwie ~8,5h pozytywnego rozpoznawania późniejszego ACK; dla starszych ponowień system ma odmówić automatycznego zapisu, nie dublować zdarzenie. 12h-watchlisty są niezależnym mechanizmem.
- Specjalny adapter `r2-s3-adapter.mjs` z użyciem oficjalnej konfiguracji S3 oraz `If-Match`/ETag jest **przygotowany jako kod referencyjny i sprawdzony składniowo**, ale **nie uruchomiono go**, bo Cloudflare R2 i SDK nie zostały podłączone ani zainstalowane. Nie ogłaszamy zdanych testów sieciowych.

**Syntetyczne dane nie mogą być traktowane jako prawdziwe historyczne sygnały AppEA.** Test nie porównywał nowych progów wejścia, wskaźników EMA ani rzeczywistej sprzedaży na rynku.

## 5. Wstępny koszt (źródło 30.10.2026)

[Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) podaje w klasie Standard 10 GB-month, 1 mln operacji zapisu klasy A i 10 mln operacji odczytu klasy B miesięcznie w darmowej puli, liczonej łącznie dla konta.

**Model planistyczny, nie rzeczywiste zużycie konta:** każdy udany przebieg: **2 PUT + około 2 GET**, brak konfliktów i ponowień, 30 dni w miesiącu.

| Cykl fast | Przebiegi / 30 dni | PUT klasy A | GET klasy B | Obiekty delta przy hipotetycznych 5 KiB/szt. |
|---|---:|---:|---:|---:|
| Co 5 minut | 8 640 | **17 280** | **17 280** | ~42,19 MiB |
| Co 2 minuty | 21 600 | **43 200** | **43 200** | ~105,47 MiB |

Liczby są zdecydowanie poniżej opublikowanych progów darmowej puli **przy braku innego ruchu na danym koncie**, ale nie jest to gwarancja braku opłat: wielkość delta (5 KiB to *założenie*), retry, listowanie, backup, dodatkowe zasoby konta, stawki i polityki billingowe mogą się różnić. Przy wykorzystaniu całkowicie płatnym koszt samych modelowanych operacji 2-minutowych wyniósłby orientacyjnie ok. **$0,21/mies.** przed kosztami storage i innymi usługami; to nie jest rachunek za rzeczywiste AppEA. R2 Standard bez opłat za egress według tej samej dokumentacji.

**Dlaczego GitHub branch nie jest magazynem docelowym:** przy odświeżaniu co 2 minuty byłoby około 21 600 commitów/miesiąc, a rosnąca historia i obciążenie API/push współdzieliłyby infrastrukturę repozytorium produkcyjnego. Nawet jeśli ref-test działa, nie warto pogarszać jakości `main` dla historii badawczej.

## 6. Bezpieczeństwo i nadal otwarte blokery

- Brak uprawnień/połączenia do R2 w tej sesji. Żadnych tokenów/sekretów w kodzie; adapter oczekuje `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` **wyłącznie z bezpiecznych zmiennych środowiskowych**. Token powinien mieć dostęp *tylko* do prywatnego testowego bucketa.
- Brak testu na Node 24 GitHub Actions; testy lokalne używały Node 22.16.0.
- Brak testu `If-Match`/`412` i odzyskania utraconego ACK na **prawdziwym R2** między **dwoma odrębnymi runnerami**. GitHub remote pilot przez oddzielne wywołania API to cenny dowód, ale nie zamiennik.
- Brak zatwierdzonego lifecycle/GC dla orphanów i łańcucha delta, ustalonego mechanizmu checkpoint/snapshot/export, alertów „degraded”, dokumentacji recovery z backupu i limitów opłat.
- Żadnego automatycznego dodawania nowych requestów FUT.GG ani zmiany implementacji rekomendacji.

## 7. Artefakty i decyzja

Kompletny pakiet `AppEA_etap11_protokol_CAS_i_testy.zip` wygenerowano lokalnie, SHA256 **`57e46c616488be3835ee32637cf36ebb2e2885635001c403fd8e9841b92e1cba`**: kod protokołu, referencyjny adapter S3, emulator, kopia reduktora z etapu 10, 19 testów, stres 350×154, model kosztu, wyniki i README. **Plik ZIP jest dostępny w tej rozmowie, nie został wypchnięty do produkcji ani dodany do repo.** Trwałe wyniki utrwalono tutaj.

**Decyzja etapu 11:** preferowany kierunek to **Cloudflare R2 Standard + immutable event delta + atomowy HOT manifest CAS**, z krótkim oknem deduplikacji i fail-closed. GitHub remote branch pozostaje jednorazowym dowodem koncepcji przechowywania/recovery. **Nie wdrożono R2 ani żadnego produkcyjnego zapisu.**

**Następny etap 12:** dopiero po świadomym udostępnieniu osobnego prywatnego bucketa R2 i tokenu o minimalnych uprawnieniach (przekazywanego przez sekret, **nigdy przez chat lub commit**) wykonać **krótką rzeczywistą próbę**: `GET`→`PUT If-None-Match`, `PUT If-Match`, konflikt dwóch zapisów oczekujących tego samego ETag (jawne `412`), restart na nowym runnerze, utrata ACK, kontrola pełnej retencji i kwoty. Dopiero wtedy rozważyć osobny workflow badawczy; `refresh.yml` pozostaje nietknięty.
