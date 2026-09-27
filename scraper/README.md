# Terminal FUT — scraper

Pisze `data.json` w kontrakcie, który czyta strona. Nic poza tym plikiem nie produkuje.

## Co jest zweryfikowane, a co nie

**Zweryfikowane i przetestowane:** siatka cen, liczenie netto po podatku, walidacja przed
publikacją, atomowy zapis z lockiem, zachowanie przy błędzie (nic nie nadpisuje).

**NIEZWERYFIKOWANE:** selektory CSS w `config.js`. Nie dało się ich sprawdzić przy pisaniu,
bo środowisko budowy nie miało dostępu do Futbina. Wypełnia się je na serwerze, patrząc na
realną stronę — `probe.mjs` do tego służy. Dopóki są puste, `scrape.mjs` kończy się błędem
i świadomie nie publikuje niczego.

## Gdzie to uruchomić

**Domyślnie: GitHub Actions.** Nie potrzeba serwera ani grosza. Workflow leży w
`.github/workflows/refresh.yml` i robi wszystko: pobiera ceny, waliduje, commituje `data.json`,
a Netlify sam deployuje. Push wykonuje wbudowany `GITHUB_TOKEN` — **żaden własny token nie jest
potrzebny**, nic nie trzeba trzymać w sekretach.

Minuty: **publiczne repo — bez limitu. Prywatne na darmowym planie — 2 000 min/mies.**
Przebieg trwa ok. 2 min, więc na prywatnym repo mieści się mniej więcej jeden na godzinę.
Chcesz co 15 minut — repo musi być publiczne. Na tej stronie nie ma nic tajnego.

Czego się spodziewać: harmonogram w Actions nie jest punktualny. Przy obciążeniu GitHuba
przebiegi potrafią się opóźnić o kilkanaście minut, a pojedyncze wypaść. Dla danych
odświeżanych co pół godziny to bez znaczenia — licznik świeżości i tak pokaże prawdę.

Uruchomienie: zakładka **Actions** → *Odświeżenie cen* → **Run workflow** (można wymusić
`fast` albo `slow` ręcznie, bez czekania na harmonogram).

Cykl `top` sprawdza ceny z całego zakresu do 200 000 monet osobno na konsoli i PC.
Do strony przechodzą tylko karty, których taśma ma co najmniej 3 sprzedaże w 10 minut,
powtarzające się tanie wejścia i dodatni zysk po podatku; droższe muszą też mieć co najmniej
12% rozrzutu między typowym tanim wejściem a ceną wystawienia. Droższe karty są alternatywami
do wyboru; strona pokazuje najwyżej trzy i oznacza je jako maksymalnie jedną sztukę.

## Instalacja na własnym serwerze (opcjonalnie, gdy Actions nie wystarczy)

```bash
sudo apt update && sudo apt install -y nodejs npm git
mkdir -p ~/fut-scraper && cd ~/fut-scraper      # tu wypakuj archiwum
npm install
npx playwright install --with-deps chromium
```

Token do GitHuba — plik, nie zmienna w historii powłoki:

```bash
printf '%s' 'TU_TOKEN' > ~/.gh-token && chmod 600 ~/.gh-token
git clone https://github.com/patrykrekin/AppEA.git ~/AppEA
```

## Uzupełnienie selektorów

```bash
node probe.mjs          # zrzuca strukturę stron do ./probe/
```

Otwórz `probe/market.json`, `probe/cheapest.json`, `probe/momentum.json`. Każdy kandydat ma
gotowy selektor i tekst, który pod nim siedzi — przepisz właściwe do `SELECTORS` w `config.js`.

```bash
node scrape.mjs fast    # sprawdź, czy liczby zgadzają się z tym, co widzisz w przeglądarce
node validate.mjs data.json
```

**Porównaj ręcznie pierwszy przebieg z Futbinem otwartym obok.** Scraper, który pobiera złą
kolumnę, wygląda dokładnie tak samo jak działający.

## Ile razy odpytywać

Nie zgaduj — zmierz:

```bash
node calibrate.mjs 180
```

Loguje wartość co minutę przez 3 godziny i mówi, co ile **faktycznie** się zmienia. Dopiero ta
liczba wyznacza cron. Odpytywanie częściej niż źródło się odświeża daje ten sam wynik,
niepotrzebny ruch i ryzyko blokady IP.

## Cron

Wartości startowe — popraw po kalibracji:

```cron
*/15 * * * *  cd ~/fut-scraper && node scrape.mjs fast >> log 2>&1 && ./deploy.sh >> log 2>&1
11 7,19 * * * cd ~/fut-scraper && node scrape.mjs slow >> log 2>&1 && ./deploy.sh >> log 2>&1
0 4 * * 0     find ~/fut-scraper -name 'log' -size +5M -delete
```

`deploy.sh` wysyła tylko wtedy, gdy plik faktycznie się zmienił — cisza na rynku nie robi
commitów.

## Podpięcie strony

W `index.html` jedna linia:

```js
var DATA_URL = "https://twoj-serwer/data.json";
```

Serwer musi oddawać nagłówek `Access-Control-Allow-Origin: *` (inna domena niż strona).
Prościej: niech scraper dalej pisze do repo, a Netlify serwuje `data.json` z tej samej
domeny co stronę — wtedy CORS w ogóle nie wchodzi w grę i `DATA_URL` zostaje `"data.json"`.

## Struktura

```
config.js        źródła, selektory, podział na cykle    ← jedyne do uzupełnienia
probe.mjs        zrzut struktury stron
scrape.mjs       fast | slow — pobiera i zapisuje
validate.mjs     bramka: siatka cen, netto, pokrycie drabiny budżetów
calibrate.mjs    pomiar realnej częstotliwości zmian
deploy.sh        commit + push, tylko przy zmianie
lib/grid.mjs     siatka cen, podatek, cena wystawienia
lib/store.mjs    atomowy zapis z lockiem (dwa crony, jeden plik)
```

## Zasada, na której to stoi

Przy każdym błędzie — brak sieci, pusta tabela, cena poza siatką, dziura w drabinie budżetów —
scraper **nie nadpisuje pliku** i kończy się kodem 1. Strona zostaje na starych danych,
a licznik świeżości uczciwie pokaże, że są stare. Złe ceny są gorsze niż nieaktualne.
