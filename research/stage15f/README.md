# 15F — kontrakt rejestru i znaczenie skuteczności

9 listopada 2026. **Audyt zakończony: 5 odtworzonych kontrprzykładów w kodzie pomiarowym. Nie naprawiono ich w tym etapie.** Testy odtwarzające problemy przechodzą jako dowód ich istnienia, nie jako certyfikat poprawności rejestru.

## Domknięcie poprzedniego etapu i źródła

Potwierdzono zdalny 15E `4e680e14d7008df40e7bc50989f64206812f28c2`; ponownie wykonano followup12.py i verify.mjs — PASS. Przed nowymi testami zapisano protocol.json lokalnym commitem `747e0de`. Zakres: kod rejestru, źródła cen, statystyki, walidator i statyczny frontend; bez zmian produkcji, kolektora, GC i nowych zapytań FUT.GG.

Aktualny main przypięto do `55d3b2e8ca0780448741bf0d5637796ae36c9d8c`. data.json ma blob `4745969730b15d6cebfc3664bf778818cad56a72`, at=1794259107 s, czyli **09.11.2026 22:18:27 Europe/Warsaw**, awaria=null. Nie jest to gwarancja stanu przyszłych cykli. Kod rejestru, jego zależności i index.html sprawdzono haszami; są identyczne z odpowiednimi plikami w bazie gałęzi badawczej. Kod rejestru blob `6d07c5bee519bc8ad439fc8258ab3cf31c811e68`, UI `d4ad63455342f6aca068aef87eff5b471191dc4c`; scraper i refresh pozostają odpowiednio `88912b6f7b8cdc679d1a94ba62510e465d7adac6` i `05b3f109a0f17b21073628b60e52ac218be33d2d` w przypiętym main.

audit.mjs czyta współczesny data.json przez `git show` przypiętego commitu. Nie kopiujemy całego pliku ani nie odczytujemy sekretów. Plik wynikowy zawiera podsumowania i syntetyczne dowody. Wcześniejsza rzeczywista migawka 15B służy wyłącznie do pokazania, że jeden profil może mieć kilka ratingów; nie mieszamy jej kohorty z obecnym rejestrem.

## Co mierzy rejestr

Nowy wiersz powstaje dla każdej przekazanej inwestycji, bez wymogu `wzasiegu=true` i bez zdarzenia potwierdzającego zakup. `wejscie` jest zaobserwowaną ceną rynkową w chwili wykrycia; `sufit` jest limitem hipotetycznego kupna. Żadne pole nie dowodzi wykonania aukcji po suficie. To **rejestr kandydatów i późniejszych obserwacji**, nie transakcji.

Pierwotny cel i poziom są zamrożone prawidłowo: aktualizacja EMA nie obniża `cel0`. Dla normalnych, jednoznacznych cen pasma pojedynczy kontakt z celem nie zamyka pozycji; dwa późniejsze odczyty z odstępem przynajmniej 60 s potwierdzają cel, a odczyt poniżej celu resetuje licznik. Test kontrolny to potwierdził.

## Potwierdzone problemy

| Problem | Minimalny dowód | Wniosek |
|---|---|---|
| **ID profilu miesza ratingi** | Ten sam ID ma pasmo 88 z ceną 12000 i pasmo 89 z ceną 30000. Cel wiersza 88 to 15000. Dokładny klucz 88 wskazuje 12000, ale alias `@id` wskazuje 30000. Po dwóch cyklach wiersz 88 dostaje `cel`. | Wynik może używać ceny innego wariantu, mimo obecności poprawnej ceny właściwego ratingu. Walidator akceptuje skonstruowany fałszywy wynik. |
| **Ponowne użycie ceny momentum liczy się jako drugie potwierdzenie** | Jedna obserwacja źródła z `ostatnio=t+120` jest dostępna w cyklach t+120 i t+240. Pozostaje świeża według limitu 600 s; kod gubi jej czas i zamyka wiersz jako `cel`. | Dwa czasy przetwarzania nie dowodzą dwóch różnych odczytów źródła. |
| **Przyszły czas momentum przechodzi filtr** | `ostatnio=t+3600` jest przyjęte w cyklu t+120, bo test sprawdza tylko `at−ostatnio<=600`. | Brakuje dolnej granicy wieku >=0. Nie dowiedziono, że taki czas wystąpił w realnym feedzie. |
| **Aktualizacja poziomu nie sprawdza tożsamości ID** | Dla pozycji z ID 900001 model EMA pod tym samym kluczem nazwa+rating ma ID 900002 i poziom 10000. Rejestr przyjmuje ten poziom. | Może zmienić diagnozę `poziom` na podstawie innej tożsamości; konieczna kontrola zgodności, nie tylko nazwy, ratingu i wersji EMA. |
| **Niestandardowa mediana bez dokumentacji konwencji** | Czasy 2 i 10 min → kod zwraca 10, standardowa mediana to 6. Dla starszych wyników PC rzeczywiste dane dają 201 zamiast 198 min. | Kod bierze górną środkową wartość dla parzystego n. Trzeba poprawić lub jawnie nazwać tę konwencję. |

W rzeczywistej migawce 15B ID `248822` występuje jako Bühl 88 i Bühl 89 na obu platformach. Zatem wieloratingowe ID nie jest wyłącznie abstrakcyjną możliwością. To nadal **nie dowodzi**, że którykolwiek konkretny historyczny werdykt `cel` powstał przez tę kolizję: zamknięte wyniki nie zachowują kompletu surowych danych potwierdzających.

Drugi kontrprzykład ma osiągalną ścieżkę w scraperze: przy braku wpisów lub błędzie pobrania zostaje poprzedni szereg momentum, a `zrodloCen` dopuszcza poszczególne wpisy do 600 s. Dotyczy to konsoli; integracja PC przekazuje do rejestru `null` zamiast momentum. Nie wnioskujemy częstości błędu z samego istnienia tej ścieżki.

## Dalsze ograniczenia kontraktu

- **Przerwa w obserwacji nie zeruje rozpoczętego potwierdzenia celu.** Pierwsza cena na celu, cykl bez ceny, druga cena na celu po 3480 s nadal daje `cel`. To nie dowód utrzymania ceny przez całą przerwę. Polityka maksymalnego odstępu potwierdzeń wymaga jawnej decyzji i testów; nie dobieramy nowego progu w tym audycie.
- **Werdykt `poziom` ma pierwszeństwo przed `urwane`.** Wiersz ze znanym wcześniejszym zejściem EMA, po utracie ceny, zamyka się jako `poziom` i wchodzi do znanych wyników. To diagnoza poziomu, nie kompletny dowód ścieżki cen do końca horyzontu. Nie zakładać, że wszystkie nieobserwowalne wyniki siedzą w `urwane`.
- Statystyka liczy tylko ostatnie **150 zamkniętych wierszy na platformę**, dzieląc je na bieżącą definicję i starsze. To nie historia całego życia strategii. Warunek min. 15 znanych rozstrzygnięć jest istniejącym progiem kodu, nie dowodem reprezentatywności czy niezależności próby.

## Co faktycznie zawiera przypięty data.json

| Bieżąca definicja | Konsola | PC |
|---|---:|---:|
| Otwarte wiersze rejestru | 1 | 3 |
| Zachowane zamknięte wiersze tej definicji | 19 | 26 |
| Werdykt cel | 11 | 15 |
| Werdykt poziom | 6 | 8 |
| Werdykt głębiej | 2 | 3 |
| Werdykt urwane | 0 | 0 |
| Kodowe trafienie | 58% | 58% |
| Wiersze z ceną przy wykryciu > limitem kupna | 14/19 | 15/26 |

Procenty wyliczono jako zaokrąglenie do liczby całkowitej `100*cel/znane`, gdzie `znane=cel+poziom+glebiej+plasko`. Zatem PS: 11/19=57,89%, PC: 15/26=57,69%. Opublikowane liczby są **zgodne arytmetycznie z obecną funkcją**, ale potwierdzone luki dowodowe nie pozwalają przedstawiać ich jako prawdopodobieństwa sprzedaży czy odsetka udanych zakupów. Liczby 14/19 i 15/26 również nie oznaczają, że nie dało się kupić taniej na aukcji — oznaczają tylko, że rejestr nie zapisał wykonania zakupu po limicie.

Starsze wyniki: PS 131 wierszy, w tym 5 urwanych, `cel=73`, `znane=126`; PC 124 wiersze, 3 urwane, `cel=84`, `znane=121`. Nie łączymy starszych definicji z bieżącą. Dla prostego syntetycznego przykładu 2 celów, 1 niecelu i 1 urwanego kod daje 67% wśród 3 znanych; skrajne przypisania brakującego wyniku dają 50–75% wśród 4. To granice scenariuszy na podstawie etykiet, nie przedział ufności ani korekta niezweryfikowanych cen. Nie rozwiązuje to błędów tożsamości czy potwierdzania celu.

**Brak konfliktu z 15E:** 0/6 odnotowanych celów do 12h w jednej migawce nie jest porównywalne z 58% w rejestrze. Inne są czasy wejścia, populacja, horyzont rejestru (24h), częstotliwość odczytów i źródła cen. Nie rekonstruujemy ani nie przepisujemy historycznych etykiet na podstawie tej różnicy.

## Co pokazuje frontend

Statyczna inspekcja obecnego index.html nie wykazała konsumenta `data.skutecznosc`; identyfikator `skutecznosc` w ogóle nie występuje w tym pliku. Sekcji rejestrowych procentów nie należy więc przedstawiać jako aktualnie widocznego rankingu skuteczności aplikacji. Dane i logi scrapera nadal je wyliczają. Jest to audyt źródła, bez testu przeglądarkowego.

Napis **„cel osiągnięty”** w sekcji własnych pozycji pochodzi z osobnego planu `obsPlan`, wyznaczanego z bieżących danych momentum, a nie z zamrożonego `cel0` rejestru. Nie dowodzi sprzedaży i nie jest potwierdzeniem tego samego celu, który badaliśmy w 15E. Własne pozycje mają cenę wpisaną przez użytkownika; rejestr kandydatów nie jest z nimi połączony jako historia zakupów.

## Decyzja i plan naprawy

**Wstrzymać używanie obecnego trafienia jako miary jakości inwestycji oraz strojenie rekomendacji na tej podstawie.** Nie wyłączamy produkcji i nie zmieniamy historycznych danych w audycie. Ceny i rekomendacje pozostają bez zmian.

Najbliższy etap **15G — izolowana naprawa kontraktu pomiarowego**:

1. Porównać rozwiązania routingu: pełny klucz platforma/rating/ID, odrzucanie niejednoznacznego ID-only i zachowanie zgodnej ścieżki legacy. Nie wybrać milczącego fallbacku na inny rating. Momentum bez dowodu ratingu/edycji traktować ostrożnie.
2. Przenosić czas obserwacji źródła i wymagać dwóch różnych, nieprzyszłych odczytów. Oddzielić czas odczytu od czasu przetwarzania. Jawnie określić zachowanie po brakach i maksymalny odstęp, zamiast dopisać nową arbitralną liczbę.
3. Sprawdzać ID modelu przy aktualizacji poziomu i poprawić konwencję mediany. Dodać negatywne regresje dla odtworzonych przypadków oraz pozytywne dla poprawnych trafień, podziału PC/PS i stabilnego odświeżania.
4. Zmiany znaczenia wyniku opatrzyć nową wersją kontraktu/definicji; stare wyniki zachować osobno, bez ponownego uznawania ich za zweryfikowane i bez zerowania historii. Nie mieszać statystyk sprzed i po naprawie.
5. Najpierw testy i replay offline na osobnej gałęzi. Bez podłączenia do refresh/main w tym kroku; ewentualne wdrożenie dopiero po przeglądzie skutków ubocznych i konkretnego diffu.

To naprawa pomiaru, nie nowy algorytm zakupowy ani kalibracja EMA. Kolejne badanie jakości rekomendacji ma sens dopiero na poprawnie zdefiniowanym pomiarze.

## Reprodukcja i walidacja

Na gałęzi badawczej:

```
git fetch --depth 1 origin 55d3b2e8ca0780448741bf0d5637796ae36c9d8c
node research/stage15f/audit.mjs
```

Pierwsza komenda pobiera istniejący publiczny commit, bez nowych żądań FUT.GG. Skrypt wymaga lokalnego obiektu Git i sprawdza jego hash danych. Wykonuje 11 scenariuszy: 3 kontrole pozytywne, 3 przypadki znaczenia/ograniczeń kontraktu i 5 potwierdzonych kontrprzykładów. Wynik result.json zawiera ich konkretne parametry, rzeczywiste liczniki i niezależne przeliczenie statystyk.

Istniejące `node trefresh.mjs` i `node tstabilnosc.mjs` z katalogu scraper — PASS. To nie obejmuje wykrytych nowych luk: dotychczasowe testy odróżniały dubel czasu przetwarzania, ale nie dwa cykle korzystające z tego samego czasu źródła. Walidator przepuszcza skonstruowany fałszywy cel wynikający z ratingowego aliasu, bo sprawdza kontrakt wynikowego JSON, nie pełne pochodzenie dowodu.

Zweryfikowano nienaruszalność stanów wejściowych fixture i pusty diff dla produkcyjnych plików. Zmiany wyłącznie w research/stage15f; brak sekretów, R2, DELETE, harmonogramu i zapisów do produkcyjnego data.json.

## Źródła i krytyczna adaptacja

1. [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — osobne Timestamp i ObservedTimestamp oraz atrybuty kontekstu. Adaptacja: dowód ceny potrzebuje własnego czasu i tożsamości; nowy cykl przetwarzania nie tworzy nowej obserwacji.
2. [NIST/SEMATECH — Censoring](https://www.itl.nist.gov/div898/handbook/apr/section1/apr131.htm) — brak zdarzenia, nieznany czas i niepełna obserwacja nie są jednym wynikiem. Nie stosujemy tu automatycznie Kaplan–Meier ani założenia niezależnego cenzurowania; brak w rankingu jest selektywny i cena nie jest zdarzeniem sprzedaży.
3. [NIST/SEMATECH — Measures of Location](https://www.itl.nist.gov/div898/handbook/eda/section3/eda351.htm) — standardowa mediana dla parzystej próby to średnia dwóch środkowych wartości. Adaptacja: niezależne przeliczenie czasów w minutach bez zmiany historii.

Źródła sprawdzone 09.11.2026. Wnioski o konkretnych błędach pochodzą z kodu i reprodukcji, nie z zewnętrznych twierdzeń o rynku EA.
