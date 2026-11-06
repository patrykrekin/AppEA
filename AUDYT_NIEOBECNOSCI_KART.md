# Audyt obserwowalności — dlaczego karta znika z listy najtańszych?

## Punkt wyjścia
`historia-kart.json` v1 przechowywał wyłącznie dodatnie obserwacje, bez informacji, czy nastąpił kompletny odczyt tej części listy, gdy karty nie było. Z tego powodu nie wolno było interpretować luki w szeregu jako zniknięcia karty, a tym bardziej transakcji.

## Porównanie rozwiązań
| Metoda | Co daje | Dlaczego nie / tak |
|---|---|---|
| Licz jako sukces lub porażkę, gdy karta znika | Sztucznie kompletne wyniki | Odrzucone: imputacja bez informacji o cenie |
| Wyłącznie karty z późniejszą ceną | Bezpośredni porównywalny błąd ceny | Pozostaje jako **wynik warunkowy**, ale ma bias selekcji |
| Kaplan–Meier / IPCW bez modelu braków | Pozornie skorygowana skuteczność | Odrzucone teraz: nie uzasadniono niezależnego cenzurowania ani modelu obserwowalności |
| Zapisywanie poprawnie odczytanych migawek pasm | Rozdziela nieobecność w obserwowanym wycinku od nieodbytej próby odczytu | **Wybrano do shadow-audytu**, nie zmienia rekomendacji |

## Co dokładnie zapisujemy
Archiwum `historia-kart.json` v2 zawiera:
- wszystkie poprawne punkty v1 oraz nowe punkty cenowe bez zmiany klucza karty,
- `migawki.ps` i `migawki.pc`: `[czas, [oceny poprawnie odczytane z listy]]` co najmniej co 10 min,
- jeśli choć jeden rekord dla ratingu jest wadliwy, nie oznaczamy tego ratingu jako bezpiecznej podstawy stwierdzenia nieobecności,
- migawki są odrębne dla platform, nie mają cen ani danych transakcyjnych; archiwum zachowuje retencję 48h.

**Poprawnie odczytane pasmo** oznacza jedynie, że wszystkie wyłuskane przez parser rekordy z tej części strony przeszły walidację. Nie dowodzi, że źródło pokazało kompletny rynek. Dlatego nazywamy wynik **nieobecnością w odczytanym wycinku**, nie brakiem karty w grze.

Danych z czasów przed v2 nie uzupełniamy fikcyjnymi migawkami.

## Diagnostyka
Dla dwóch kolejnych migawek (nie dalej niż 20 minut) w tym samym ratingu i na tej samej platformie porównujemy obecność tej samej wersji karty:
- widoczna w obu; widoczna w pierwszej i poza odczytanym wycinkiem w drugiej; nieocenialna, gdy brak pełnej próby danego ratingu;
- rozdzielamy ceny poniżej mediany, powyżej mediany i remisy w momencie pierwszego odczytu;
- `odsetek zniknięć = karty poza listą w kolejnej migawce / wszystkie widziane w wyjściowej migawce`;
- `różnica górna–dolna = odsetek droższych – odsetek tańszych` w punktach procentowych; nie pokazujemy porównania dla grup o liczebności <20;
- obserwacje kart i migawek nie są niezależne, zatem to metryka opisowa, nie jeszcze test istotności.

Następnie, gdy dojrzeje historia, przeprowadzimy **prospektywny** test relacji między poprzednio obserwowaną ceną a prawdopodobieństwem późniejszej widoczności. Sam dodatni związek nie potwierdzi wszystkich mechanizmów cenzurowania. Przy realnej korekcie selekcji potrzebne będą nowe źródła, niezależne pokrycie kart albo uzasadniony model braków.

## Granice scenariuszy
Dla binarnego **wyniku zaobserwowanej ceny dokładnie w punkcie h** (nie „kiedykolwiek karta została sprzedana”):
- `S` = wynik dodatni i zaobserwowany; `F` = niedodatni i zaobserwowany; `U` = brak obserwacji,
- `N=S+F+U`; warunkowy odsetek w widocznych danych `S/(S+F)`,
- skrajne zakresy: `S/N` do `(S+U)/N`.
Nie nazywamy zakresu przedziałem ufności ani prawdopodobieństwem transakcji. Przy braku ciągłego feedu nie można też traktować 10-minutowego braku odbicia jako dowodu, że odbicia w ogóle nie było.

## Zabezpieczenia
- Bez dodatkowych zapytań do fut.gg i bez zmian w `refresh.yml`.
- Bez usuwania ani dopisywania fikcyjnych cen.
- Wersja 2 zachowuje dane wersji 1, ale nie uzupełnia wstecz brakujących migawek.
- Nowe testy: brak przyszłych odczytów, migracja, rozdział PC/PS, zniknięcia, remisy, wadliwe pasma i retencja.
- Obecny `sprawdzMetody()` nadal daje wynik warunkowy na późniejszym notowaniu i nie jest wykorzystywany w automatycznej rekomendacji.

## Źródła etapu
1. Little RJA, Rubin DB. *Statistical Analysis with Missing Data*, wyd. 3 (2019), rozdz. 3. https://onlinelibrary.wiley.com/doi/10.1002/9781119482260.ch3
2. Columbia Mailman School of Public Health, *Time-To-Event (TTE) Data Analysis*. https://www.publichealth.columbia.edu/research/population-health-methods/time-event-data-analysis

Status: eksperymentalne, wymaga kolejnych migawek i rzeczywistej weryfikacji na danych EA.
