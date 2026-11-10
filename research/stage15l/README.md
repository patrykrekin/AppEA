# 15L — jawny warunek ceny zakupu przy netto

**PASS — gotowa poprawka prezentacji na gałęzi badawczej, bez wdrożenia do main.** 10 listopada 2026. Poprzedni etap 15K sprawdzono ponownie: 8 zapisów, 4 kandydatów, brak zmiany wyników.

## Ustalenie audytu

`index.html` nie odczytuje `data.inwestycje` i nie pokazuje pola `zwrot` kandydatów analizowanych w 15K. Nie należy przenosić ich wycen do widoku obserwacji. Sekcja „Ruch na drogich kartach” korzysta z `data.obserwacja` tylko dla konsoli i z własnego `obsPlan`: celu odtworzonego z ceny oraz zmiany dobowej. Przed poprawką miała już limit zakupu, informację „za drogo” i napis „netto warunkowo”. Brakowało bezpośredniego wskazania przy kwocie netto, po jakiej cenie zakup został założony.

HTML porównano z main `f99ca8bb3988b081406f70c753ca7065f8d73d59`: identyczny z bazą badawczą przed poprawką. To potwierdza zakres audytu na moment sprawdzenia; nowe zmiany na main wymagają ponownego porównania przed scaleniem.

## Poprawka

- Nagłówek „Limit zakupu”.
- Przy każdym netto widoczny warunek „przy zakupie za [limit]”, także na telefonie i bez tooltipa.
- Widoczny opis: wynik zakłada zakup po limicie i sprzedaż po celu, po podatku 5%; to scenariusz.
- Netto kart ponad limitem ma kolor neutralny, zamiast zielonego. Warunek tekstowy pozostaje widoczny niezależnie od koloru.

Nie zmieniono wartości netto, ceny, celu, limitu, selekcji, sortowania, progów, przycisków pozycji ani rozdzielenia platform. Nie dodano nowego rodzaju rekomendacji ani wyniku przy cenie bieżącej. `obsPlan`, `obsTrend` i `wGoreSiatki` sprawdzono jako identyczne tekstowo. Diff HTML obejmuje wyłącznie opis, etykietę, formatowanie i element warunku.

Obecne obliczenia obserwacji pozostają: cena „wczoraj” z `cena / (1 + zmiana24/100)`, potem istniejąca siatka; cel krok poniżej tego poziomu; limit z `cel × 0,95 / 1,05` zaokrąglony w dół do siatki; netto `floor(cel × 0,95 − limit)`. To odrębny plan od EMA inwestycji z 15K. Nie ujednolicano tu jego zaokrągleń z backendowym `round`.

## Walidacja i dowód

[Actions, udana próba](https://github.com/patrykrekin/AppEA/actions/runs/42816626893). Szczegóły: [ui-result.json](ui-result.json), [run-metadata.json](run-metadata.json). Wyzwalacz push wyłączono po zakolejkowaniu; końcowy workflow jest wyłącznie ręczny, bez harmonogramu i odczytów rynku.

Lokalne uruchomienie Chromium uniemożliwiło ograniczenie socketów środowiska; nie było to niepowodzenie aplikacji. Weryfikację ukończono na standardowym runnerze GitHub z Node 24 i Chrome. Test ładuje wyłącznie lokalny HTML i syntetyczną watchlistę na zachowanej otoczce danych 15J. Wszelkie pozostałe żądania stron są blokowane, nie pobiera się cen FUT.GG. Instalacja biblioteki testowej i checkout są czynnościami przygotowawczymi CI.

| Przypadek | 1280 px | 390 px |
|---|---|---|
| Karta ponad limitem | PASS | PASS |
| Karta w limicie | PASS | PASS |
| Karta bez planu | PASS | PASS |
| Liczby, kolejność i statusy identyczne z bazą | PASS | PASS |
| Warunek widoczny, bez poziomego przepełnienia sekcji i warunku | PASS | PASS |
| PC bez danych konsolowych, powrót na PS | PASS | PASS |
| Błędy JS | 0 | 0 |

Zrzuty obejrzano po teście: [komputer](preview-1280.png), [telefon](preview-390.png). To kontrolowane przykłady testowe, nie cztery rzeczywiste sygnały z 15K. Nie przeprowadzano pełnego audytu dostępności, wszystkich szerokości ani testu gwarantującego zachowanie przy dowolnie długiej nazwie lub kwocie. Test nie jest dowodem skuteczności rynku. Zachowano dokładne pliki wynikowe i obrazy, aby nie zależeć od trzydniowej retencji artefaktu Actions.

Odtworzenie w środowisku z Pythonem 3, Node 24, Playwright i Chrome:

```sh
git fetch --depth 1 origin 5082cbca3689862b229a692bd9a496fb185ff0f7
# Gdy Playwright jest w scraper/node_modules:
export CODEX_PRIMARY_RUNTIME_NODE_MODULES="$PWD/scraper/node_modules"
export FUT_CHROMIUM="$(command -v google-chrome)"
node research/stage15l/check-ui.mjs
node research/stage15k/audit.mjs
```

Test porównuje bazowy i zmieniony widok w prawdziwej przeglądarce. Nie dodajemy osobnego testu powtarzającego treść kilku etykiet; sprawdzamy znaczenie prezentacji, zachowanie liczb i platform oraz przepełnienie układu.

## Źródła porównawcze

1. [SEC / Investor.gov: Understanding Order Types](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-14). Wykorzystano rozróżnienie limitu i wykonania: limit warunkuje rachunek, nie dowodzi zakupu. AppEA nie jest systemem zleceń giełdowych; nie przenosimy zasad ich realizacji na EA.
2. [W3C: Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html). Warunek i jego kwota są dostępne w tekście obok wyniku; nie polegają wyłącznie na kolorze ani tooltipie. To wskazówka projektowa, nie deklaracja zgodności całej aplikacji z WCAG.

Decyzja: przyjąć poprawkę do przeglądu, zachować na oddzielnej gałęzi. Produkcja, scraper i dane rynku bez zmian. Kolejny etap powinien wrócić do analityki: określić na istniejącym archiwum, które obserwacje wystarczą do uczciwego porównania celu EMA z bazowym utrzymaniem ceny, bez uruchamiania kolektora i bez oceniania trafności na czterech wybranych kandydatach.
