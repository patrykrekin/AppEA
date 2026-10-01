/* Test kontrolek sensu.

Zasada: KAŻDY przypadek odtwarza błąd, który naprawdę nam się zdarzył, na
liczbach z tego zdarzenia — nie na wymyślonych. Dodatkowo jeden przypadek
zdrowy, bo walidator, który pada na dobrych danych, zostanie wyłączony
w tydzień i wtedy cała reszta jest bez znaczenia. */

import { kontrolki, POLTRWANIE_D } from "./lib/kontrolki.mjs";

const TERAZ = 1790885155;                  // 01.10.2026 22:05 czasu polskiego
const DEF = "p5-k3-a5-o24-t6-s1500";
let padlo = 0, zdane = 0;

function sprawdz(nazwa, dane, oczekuj){
  const { err, warn } = kontrolki(dane, TERAZ);
  const trafil = oczekuj.err
    ? err.some(e => e.includes(oczekuj.err))
    : (oczekuj.warn ? warn.some(w => w.includes(oczekuj.warn)) : err.length === 0);
  if (trafil){ zdane++; console.log(`  ok   ${nazwa}`); }
  else {
    padlo++;
    console.log(`  PADŁ ${nazwa}`);
    console.log(`       oczekiwano: ${JSON.stringify(oczekuj)}`);
    console.log(`       błędy:  ${JSON.stringify(err, null, 1)}`);
    console.log(`       uwagi:  ${JSON.stringify(warn, null, 1)}`);
  }
}

/* Szkielet zdrowego pliku. Każdy test psuje w nim dokładnie jedną rzecz —
   inaczej nie wiadomo, która kontrolka zadziałała. */
function zdrowy(){
  const wyniki = [];
  for (let i = 0; i < 40; i++){
    wyniki.push({ klucz: `K${i} 86`, def: DEF, wejscie: 5000, cel0: 5400,
                  werdykt: i % 2 ? "cel" : "plasko",
                  doCelu: i % 2 ? 600 + i * 30 : undefined });
  }
  const pdPs = {}, pdPc = {};
  for (let i = 0; i < 60; i++){ pdPs[`K${i} 86`] = { p: 5000 + i * 10 }; pdPc[`K${i} 86`] = { p: 4600 + i * 11 }; }
  return {
    at: TERAZ, atFast: TERAZ - 60, atSlow: TERAZ - 3600,
    nasz: { ps: { zmiana: 0 }, pc: { zmiana: 0 } },
    monitor: { ps: [{ klucz: "Barella 87", rabat: 9.9, odSekund: 960, zawraca: true }], pc: [] },
    okazje: { poziomyD: { ps: pdPs, pc: pdPc } },
    skutecznosc: { ps: { gotowe: true, probek: 40, trafienie: 55, medianaDoCelu: 900 }, pc: null },
    rejestr: {
      ps: { def: DEF, otwarte: { "Tah 87": { def: DEF, wejscie: 5500, cel0: 6100 } }, wyniki },
      pc: { def: DEF, otwarte: {}, wyniki: [] }
    }
  };
}

const K = (f) => { const d = zdrowy(); f(d); return d; };

console.log("\nkontrolki sensu — każdy przypadek to nasza własna wtopa\n");

sprawdz("zdrowy plik przechodzi bez błędu", zdrowy(), {});

sprawdz(
  "martwy cykl fast (dwie i pół godziny bez odczytu)",
  K(d => { d.atFast = TERAZ - 9000; }),
  { warn: "cykl atFast" }
);

sprawdz(
  "slow przeterminowany o 12 h to NIE awaria (okno godzinowe)",
  K(d => { d.atSlow = TERAZ - 12 * 3600; }),
  {}
);

sprawdz(
  "slow martwy od 20 h — to już awaria",
  K(d => { d.atSlow = TERAZ - 20 * 3600; }),
  { warn: "cykl atSlow" }
);

sprawdz(
  "wycofana sekcja top nadal jedzie w pliku",
  K(d => { d.top = { ps: { checked: 25, rows: [], high: [] } }; }),
  { warn: 'klucz "top" jedzie w pliku' }
);

sprawdz(
  "wycofana sekcja record nadal jedzie w pliku",
  K(d => { d.record = { open: [], closed: [], summary: { n: 0 } }; }),
  { warn: 'klucz "record" jedzie w pliku' }
);

sprawdz(
  "cel o jeden krok nad wejściem (5800 → 5900, krok 100)",
  K(d => { d.rejestr.ps.otwarte["McCabe 86"] = { def: DEF, wejscie: 5800, cel0: 5900 }; }),
  { err: "McCabe 86" }
);

sprawdz(
  "cel o dwa kroki też za mało (5800 → 6000)",
  K(d => { d.rejestr.ps.otwarte["Martínez 87"] = { def: DEF, wejscie: 5800, cel0: 6000 }; }),
  { err: "Martínez 87" }
);

sprawdz(
  "cel o trzy kroki przechodzi (5800 → 6100)",
  K(d => { d.rejestr.ps.otwarte["Barella 87"] = { def: DEF, wejscie: 5800, cel0: 6100 }; }),
  {}
);

sprawdz(
  "43 z 84 trafień w ≤120 s — prawdziwy rozkład z 01.10",
  K(d => {
    const w = [];
    for (let i = 0; i < 84; i++){
      const t = i < 43 ? 120 : (i < 57 ? 300 : (i < 81 ? 900 : 3600));
      w.push({ klucz: `K${i} 86`, def: DEF, wejscie: 5000, cel0: 5400, werdykt: "cel", doCelu: t });
    }
    d.rejestr.ps.wyniki = w;
  }),
  { err: "rotacja ofert" }
);

sprawdz(
  "skuteczność 100% przy medianie 120 s — liczby z 01.10",
  K(d => {
    d.rejestr.ps.wyniki = [];
    d.skutecznosc.ps = { gotowe: true, probek: 84, trafienie: 100, medianaDoCelu: 120 };
  }),
  { err: "miernik mierzy sam siebie" }
);

sprawdz(
  "stara definicja p5-k1 nie blokuje nowej",
  K(d => {
    d.rejestr.ps.otwarte["Stary 86"] = { def: "p5-k1-a5-o24-t6-s1500", wejscie: 5800, cel0: 5900 };
    for (let i = 0; i < 84; i++)
      d.rejestr.ps.wyniki.push({ klucz: `S${i} 86`, def: "p5-k1-a5-o24-t6-s1500", werdykt: "cel", doCelu: 3 });
  }),
  {}
);

sprawdz(
  "Messi pod progiem 13 h bez zwrotu — wiersz z 01.10",
  K(d => { d.monitor.ps.push({ klucz: "Messi 89", rabat: 18, odSekund: 47692, zawraca: false }); }),
  { err: "to nie rabat, to nowa cena" }
);

sprawdz(
  "ta sama karta 13 h, ale ZAWRACA — zostaje",
  K(d => { d.monitor.ps.push({ klucz: "Messi 89", rabat: 18, odSekund: 47692, zawraca: true }); }),
  {}
);

sprawdz(
  "platformy sklejone — wyciek cookie z 28.09",
  K(d => { for (const k of Object.keys(d.okazje.poziomyD.ps)) d.okazje.poziomyD.pc[k] = { ...d.okazje.poziomyD.ps[k] }; }),
  { err: "wycieku cookie platformy" }
);

sprawdz(
  "indeks 0,0% nad listą przecenionych kart",
  K(d => {
    d.monitor.ps = [];
    for (let i = 0; i < 6; i++) d.monitor.ps.push({ klucz: `K${i} 88`, rabat: 15, odSekund: 600, zawraca: false });
  }),
  { warn: "dwie sprzeczne historie" }
);

sprawdz(
  "brak rejestru (pierwszy przebieg) nie wywala walidatora",
  K(d => { delete d.rejestr; delete d.skutecznosc; delete d.monitor; delete d.okazje; }),
  {}
);

console.log(`\n  zdane ${zdane}, padłe ${padlo}\n`);
process.exit(padlo ? 1 : 0);
