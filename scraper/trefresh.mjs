import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { przygotujPublikacje } from "./lib/publikacja.mjs";
import { dopiszRejestr } from "./lib/rejestr.mjs";
import { wybierzRatunek } from "./watchdog.mjs";
import { wybierz } from "./cykl.mjs";

const dane = JSON.parse(readFileSync("../data.json", "utf8"));
const at = dane.atFast + 300;

// 1: Zdrowe ceny są publikowane nawet przy jednym niepoprawnym wyniku rejestru.
const zepsutyRejestr = structuredClone(dane.rejestr);
zepsutyRejestr.ps.wyniki.push({
  klucz:"Testowa 87", def:zepsutyRejestr.ps.def, wejscie:6000,
  werdykt:"cel", doCelu:0, zamkniete:at
});
const wynik = przygotujPublikacje(dane, {
  at, atFast:at, rejestr:zepsutyRejestr, skutecznosc:dane.skutecznosc
});
assert.equal(wynik.odlozonyRejestr, true);
assert.deepEqual(wynik.fields.rejestr, dane.rejestr);
assert.equal(wynik.fields.atFast, at);
assert.ok(wynik.fields.statusRejestru.powod.length);
console.log("ok: uszkodzony rejestr nie blokuje cen");

// 2: Błąd źródła cen nie może zostać ukryty jako błąd analiz.
assert.throws(() => przygotujPublikacje(dane, {
  at, atFast:at, rejestr:zepsutyRejestr,
  snipe:{ ...dane.snipe, ps:{ ...dane.snipe.ps, rows:[] }}
}), /walidacji/);
console.log("ok: błędne ceny nadal blokują publikację");

// 3: Pierwszy odczyt i dubel znacznika nie są trafieniem, a cel wymaga czasu.
const inwestycja = {klucz:"Próbna 87", id:"993144", rating:87,
  cena:6000, poziom:7200, cel:7100, rabat:17, kupnoDo:6200};
const ceny = {"@id:993144":{cena:7200, skad:"pasmo", id:"993144"}};
let r = dopiszRejestr({}, 1_000_000, [inwestycja], ceny, {});
assert.equal(r.otwarte[inwestycja.klucz].celN ?? 0, 0);
r = dopiszRejestr(r, 1_000_020, [], ceny, {});
assert.equal(r.otwarte[inwestycja.klucz].celN ?? 0, 0);
r = dopiszRejestr(r, 1_000_080, [], ceny, {});
assert.equal(r.otwarte[inwestycja.klucz].celN, 1);
r = dopiszRejestr(r, 1_000_080, [], ceny, {});
assert.equal(r.otwarte[inwestycja.klucz].celN, 1);
r = dopiszRejestr(r, 1_000_150, [], ceny, {});
assert.equal(r.wyniki[0].werdykt,"cel");
assert.ok(r.wyniki[0].doCelu > 0);
console.log("ok: trafienie wymaga dwóch różnych późniejszych próbek");

// 3b: Dokładna przyczyna blokady z załączonego data.json: Donnarumma 89.
const legacy = dane.rejestr.ps.otwarte["Donnarumma 89"];
assert.equal(legacy.celOd, legacy.od);
const stanNaprawiony = dopiszRejestr(dane.rejestr.ps, 1_792_674_441, [], {}, {});
assert.ok(!stanNaprawiony.wyniki.some(w => w.klucz === "Donnarumma 89" && w.doCelu === 0));
console.log("ok: naprawa starego licznika Donnarummy bez czyszczenia rejestru");

// 4: Watchdog nie duplikuje zdrowego harmonogramu.
assert.equal(wybierzRatunek({atFast:1000,atSlow:1000}, 1060, 6), "skip");
assert.equal(wybierzRatunek({atFast:100,atSlow:1000}, 1060, 6), "fast");
assert.equal(wybierzRatunek({atFast:50_000,atSlow:1}, 50_060, 6), "slow");
assert.equal(wybierz({atFast:100,atSlow:100}, 100_000, 6), "fast");
assert.equal(wybierz({atFast:99_940,atSlow:100}, 100_000, 6), "slow");
console.log("ok: watchdog i auto przywracają priorytet cen");

// 5: Udany cykl slow nie usuwa ostrzeżenia o wadliwym rejestrze cyklu fast.
const czystySlow = przygotujPublikacje(dane, { at: at + 60, atSlow: at + 60 });
assert.equal(Object.prototype.hasOwnProperty.call(czystySlow.fields, "statusRejestru"), false);
console.log("ok: slow nie czyści stanu rejestru fast");
