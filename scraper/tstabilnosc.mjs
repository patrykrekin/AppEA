import assert from 'node:assert/strict';
import {
  filtrujPoziomy, filtrujTrwalosc, aktualizujPoziomy, aktualizujPoziomyD,
  aktualizujTrwalosc, policzInwestycje,
  MAX_PRZERWA_EMA_SZYBKA, MAX_PRZERWA_EMA_DOBOWA, MAX_ODSTEP_TRWALOSCI
} from './lib/okazje.mjs';
import { dopiszRejestr, skutecznoscInw } from './lib/rejestr.mjs';
import { validate } from './validate.mjs';
import { readFileSync } from 'node:fs';

const at = 1_800_000_000;
const bands = { 87: [{name:'Próbna',id:'993144',price:6000}] };
const key = 'Próbna 87';
const old = { [key]: { p:7200, n:150, od:at-7*86400-7200, v:3, t:at-7*86400, id:'993144' } };
const fresh = { [key]: { p:7200, n:150, od:at-7200, v:3, t:at-60, id:'993144' } };
assert.deepEqual(filtrujPoziomy(old, at, MAX_PRZERWA_EMA_SZYBKA), {});
assert.deepEqual(filtrujPoziomy(old, at, MAX_PRZERWA_EMA_DOBOWA), {});
assert.equal(Object.keys(filtrujPoziomy(fresh, at, MAX_PRZERWA_EMA_SZYBKA)).length,1);
assert.deepEqual(filtrujPoziomy({[key]:{p:7200,n:3,t:at+60}},at,MAX_PRZERWA_EMA_DOBOWA),{});
console.log('ok: przeterminowane i przyszłe modele nie wchodzą do bieżącej wyceny');

const szybka = aktualizujPoziomy(old,bands,at);
assert.equal(szybka[key].p,6000);
assert.equal(szybka[key].n,1);
const dobowa = aktualizujPoziomyD(old,{},bands,at);
assert.equal(dobowa[key].p,6000);
assert.equal(dobowa[key].n,1);
assert.equal(aktualizujPoziomy(fresh,bands,at)[key].n,151);
assert.equal(aktualizujPoziomyD(fresh,{},bands,at)[key].n,151);
console.log('ok: EMA jest resetowana dopiero po przerwie, a ciągłość działa');

const trwa = { [key]: {n:5,od:at-1500,t:at-4*86400,id:'993144'}};
assert.deepEqual(filtrujTrwalosc(trwa,at),{});
const afterGap = aktualizujTrwalosc(trwa,bands,{[key]:{p:7200,id:'993144'}},at);
assert.equal(afterGap[key].n,1);
assert.equal(afterGap[key].od,at);
assert.equal(policzInwestycje(bands, fresh, afterGap, at).length,0);
const recentT = { [key]: {n:5,od:at-1800,t:at-60,id:'993144'}};
assert.equal(aktualizujTrwalosc(recentT,bands,{[key]:{p:7200,id:'993144'}},at)[key].n,6);
assert.deepEqual(filtrujTrwalosc(recentT,at+MAX_ODSTEP_TRWALOSCI+61),{});
console.log('ok: brak łączenia pomiarów po czterech dniach i długiej przerwie');

const inv = {klucz:key,id:'993144',rating:87,cena:6000,poziom:7200,cel:7100,rabat:17,kupnoDo:6200};
const price = {'@id:993144':{cena:7200,skad:'pasmo',id:'993144'}};
let x = dopiszRejestr({},at,[inv],price,{});
assert.equal(Object.keys(x.otwarte).length,1);
x = dopiszRejestr(x,at+2*3600+1,[],price,{});
assert.equal(Object.keys(x.otwarte).length,0);
assert.equal(x.wyniki.length,1);
assert.equal(x.wyniki[0].werdykt,'urwane');
assert.equal(x.wyniki[0].doCelu,null);
console.log('ok: ponowne zobaczenie po wielogodzinnej przerwie nie fałszuje trafienia');

const invalid = {klucz:'Wynik wadliwy',def:'test',wejscie:6000,cel:7100,werdykt:'cel',doCelu:0};
const valid = {klucz:'Wynik dobry',def:'test',wejscie:6000,cel:7100,werdykt:'plasko',doCelu:null};
const malformed = { ...inv,def:'',od:at,ostatnio:at,cel0:7100, wejscie:6000 };
const before = {otwarte:{Legacy:malformed},wyniki:[valid,invalid]};
const clean = dopiszRejestr(before,at,[],{},{});
assert.equal(clean.wyniki.length,1);
assert.equal(clean.wyniki[0].klucz,'Wynik dobry');
assert.equal(clean.odrzucone.length,2);
assert.equal(Object.keys(clean.otwarte).length,0);
const twice = dopiszRejestr(clean,at+60,[],{},{});
assert.equal(twice.odrzucone.length,2);
console.log('ok: wadliwe dziedzictwo w kwarantannie; poprawne wyniki bez zmian');
const nierozstrzygniete = Array.from({length:20},(_,i)=>({klucz:'U'+i, def:'test', werdykt:'urwane'}));
const sk = skutecznoscInw({otwarte:{},wyniki:nierozstrzygniete},'test',15);
assert.equal(sk.gotowe,false);
assert.equal(sk.znane,0);
assert.equal(sk.trafienie,null);
console.log('ok: stare urwane wyniki nie tworzą fałszywej gotowości statystyk');

// Model nadal potrafi zgłosić realną, ciągłą przecenę po 6 obserwacjach.
const slowModel = {[key]: {p:7200,n:40,od:at-7200,t:at-6*300,v:3,id:'993144'}};
let streak = {};
for (let j=0;j<6;j++){
  const t=at+j*300;
  const model = {[key]:{...slowModel[key],t:t-300}};
  streak = aktualizujTrwalosc(streak,bands,model,t);
}
assert.equal(streak[key].n,6);
assert.equal(streak[key].od,at);
assert.equal(policzInwestycje(bands,{[key]:{p:7200,n:50,od:at-7200,t:at+5*300,v:3,id:'993144'}},streak,at+5*300).length,1);
console.log('ok: sześć rzeczywiście kolejnych pomiarów nadal daje sygnał');



// Dane źródłowe mają być nadal akceptowane: bez kasowania historii rynku.
const file = JSON.parse(readFileSync('../data.json','utf8'));
const result = validate(file);
assert.equal(result.err.length,0,result.err.slice(0,5).join(' | '));
console.log('ok: kontrakt dotychczasowego data.json nadal poprawny');
console.log('testy stabilności: komplet zaliczony');
