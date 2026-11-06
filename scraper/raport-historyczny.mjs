/* Raport read-only. Nie zmienia ceny, archiwum ani zasady zakupow. */
import {readFileSync} from "node:fs";
import {jakosc,sprawdzMetody} from "./lib/jakosc-historii-kart.mjs";
const file=process.argv[2] || new URL("../historia-kart.json",import.meta.url);
const raw=readFileSync(file,"utf8");
const stan=JSON.parse(raw);
if(stan.wersja!==1||!Number.isInteger(stan.at)||stan.at<=0){
  throw new Error("Brak poprawnego archiwum: wersja lub znacznik czasu");
}
const report={
  definicja:"jakość historii i ocena warunkowa na obserwowanych notowaniach Fut.gg",
  archiwumAt:stan.at,
  audyt:jakosc(stan),
  backtest:sprawdzMetody(stan),
  ograniczenia:[
    "brak notowania przy zniknięciu karty nie oznacza wzrostu/spadku ani transakcji",
    "historia jest ograniczona do najtańszych ofert, więc wynik może mieć bias selekcji",
    "wynik warunkowy na późniejszym zobaczeniu karty; brak pełnego feedu transakcyjnego",
    "odstające notowanie jest tylko oznaczone, nie usunięte",
    "wynik bez odpowiedniej liczby próbek nie uprawnia do wyboru metody"
  ]
};
console.log(JSON.stringify(report,null,2));
