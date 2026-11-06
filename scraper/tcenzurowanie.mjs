import assert from "node:assert/strict";
import {dopisz,WERSJA,kluczKarty} from "./lib/eksperyment-historii-kart.mjs";
import {statusNaMigawce,audytNieobecnosci,graniceWyniku} from "./lib/cenzurowanie-kart.mjs";

const t=1_800_000_000;
const mk=(id,price,ovr=87)=>({id:String(id),name:"Gracz"+id,price,rating:ovr});
const A=mk(1,5000),B=mk(2,6000),C=mk(3,7000),D=mk(4,8000);
const key=kluczKarty(87,A);
const bands=(ps,pc=ps)=>({ps,pc});
const full=xs=>({87:xs}), plus=()=>({88:[mk(8,12000,88)]});
const old={wersja:1,at:t-600,ps:{[key]:{id:"1",rating:87,nazwa:"Gracz1",punkty:[[t-600,5100]]}},pc:{}};
const first=dopisz(old,bands(full([A,B,C]),full([A,B,C])),t);
assert.equal(first.stan.wersja,WERSJA);
assert.equal(first.stan.ps[key].punkty.length,2,"v1 historia zachowana");
assert.equal(first.stan.migawki.ps.length,1);
assert.equal(first.stan.migawki.pc.length,1);
assert.equal(statusNaMigawce(first.stan,"ps",87,A,t-600),
  "nieocenialne-brak-migawki-pasma","v1 nie ma dowodu nieobecnosci");
assert.equal(statusNaMigawce(first.stan,"ps",87,A,t),"widoczna-w-liscie");
const repeated=dopisz(first.stan,bands(full([A,B,C])),t+60);
assert.equal(repeated.statystyki.dodaneMigawki,0);
assert.equal(repeated.statystyki.dopisano,0);
const second=dopisz(first.stan,bands(full([A,B]),full([A,B,C])),t+600);
assert.equal(second.statystyki.dodaneMigawki,2);
assert.equal(statusNaMigawce(second.stan,"ps",87,C,t+600),"poza-odczytana-lista");
assert.equal(statusNaMigawce(second.stan,"pc",87,C,t+600),"widoczna-w-liscie");
const summary=audytNieobecnosci(second.stan);
assert.equal(summary.platformy.ps.obserwowanePrzejscia,3);
assert.equal(summary.platformy.ps.zniknelyZListy,1);
assert.equal(summary.platformy.ps.zniknieciaWGornejPolowie.brak,1);
assert.equal(summary.platformy.ps.zniknieciaWDolnejPolowie.brak,0);
assert.equal(summary.platformy.ps.remisCen.brak,0);
assert.equal(summary.platformy.pc.zniknelyZListy,0);
assert.equal(summary.platformy.ps.roznicaGoraMinusDolPp,null,"brak istotnosci przy 1 karcie");
const third=dopisz(second.stan,bands({87:[A,{...B,price:9750}],...plus()},
  {87:[A,B,C]}),t+1200);
assert.equal(third.statystyki.odrzuconePasma,1);
assert.equal(statusNaMigawce(third.stan,"ps",87,A,t+1200),
  "nieocenialne-brak-migawki-pasma","wadliwy zakres to nie 'znikniecie'");
assert.equal(statusNaMigawce(third.stan,"ps",88,mk(8,12000,88),t+1200),
  "widoczna-w-liscie");
assert.equal(audytNieobecnosci(third.stan).platformy.ps.zniknelyZListy,1,
  "migawka z wadliwym pasmem nie moze tworzyc falszywego braku");
const next=dopisz(third.stan,bands(full([A,B,C])),t+1800);
assert.equal(statusNaMigawce(next.stan,"ps",87,C,t+1800),"widoczna-w-liscie");
assert.equal(audytNieobecnosci(next.stan).platformy.ps.zniknelyZListy,1,
 "powrot nie jest automatycznie sukcesem ani sprzedaza");
const late=dopisz(next.stan,bands(full([A,B,C])),t+51*3600);
assert.equal(late.stan.migawki.ps.length,1,"prune 48h migawek");
assert.equal(late.stan.ps[key].punkty.length,1,"prune 48h cen");
assert.deepEqual(graniceWyniku({tak:2,nie:3,brak:5}),
 {n:10,zaobserwowane:5,niezaobserwowane:5,
 udzialTylkoZaobserwowanychPct:40,dolnaGranicaPct:20,gornaGranicaPct:70,
 definicja:"granice dla zadanego wyniku W PUNKCIE CZASU; brak=nieznany, nie sprzedaz"});
assert.throws(()=>graniceWyniku({tak:-1}),/ujemnymi/);
console.log("OK: migracja bez utraty cen i bez dorabiania migawek wstecz");
console.log("OK: znikniecie z poprawnej listy != blad odczytu, != sprzedaz");
console.log("OK: PC/PS rozdzielone; remisy cen; okres retencji; scenariusze graniczne");
