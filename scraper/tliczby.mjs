import assert from 'node:assert/strict';
import { snapDown, snapUp, listBelow, onGrid, net } from './lib/grid.mjs';
import { alfaZaCzas, aktualizujPoziomy, aktualizujPoziomyD, policzInwestycje } from './lib/okazje.mjs';
import { policz as policzIndeks } from './lib/indeks.mjs';
import { progSbc, zbuduj as zbudujKalendarz } from './lib/kalendarz.mjs';

const eps = (a,b,t=1e-8) => assert.ok(Math.abs(a-b) <= t, `${a} != ${b}`);
const granice = [1000,10000,50000,100000];
for (const granica of granice){
  assert.ok(onGrid(granica));
  assert.ok(onGrid(listBelow(granica)), `nielegalna cena pod ${granica}`);
  assert.ok(listBelow(granica) < granica);
  assert.equal(snapDown(granica),granica);
  assert.equal(snapUp(granica),granica);
  assert.ok(onGrid(snapUp(granica+1)));
  assert.ok(onGrid(snapDown(granica+1)));
}
assert.equal(listBelow(10000),9900);
assert.equal(listBelow(10001),9900);
assert.equal(listBelow(50000),49750);
assert.equal(listBelow(100000),99500);
assert.equal(net(1000,1200),140);
console.log('OK: grid i podatek, wszystkie granice kroku');

eps(alfaZaCzas(.05,300),.05);
eps(alfaZaCzas(.005,300),.005);
const now = 1_800_000_000;
const card = { name:'Test',price:5000,id:'A' };
const key = 'Test 87';
const bands = {87:[card]};
const start = {[key]:{p:5100,n:50,od:now-7200,t:now,v:3,id:'A'}};
const oneMin = aktualizujPoziomy(start,bands,now+60);
const fiveMin = aktualizujPoziomy(start,bands,now+300);
assert.ok(oneMin[key].p < 5100 && oneMin[key].p > 5000);
assert.ok(!Number.isInteger(oneMin[key].p),'EMA nie moze byc zaokraglana co pomiar');
let series = start;
for(let i=1;i<=5;i++)series = aktualizujPoziomy(series,bands,now+i*60);
eps(series[key].p, fiveMin[key].p);
const longMin = aktualizujPoziomyD(start,{},bands,now+60);
const longFive = aktualizujPoziomyD(start,{},bands,now+300);
let longSeries=start;
for(let i=1;i<=5;i++)longSeries = aktualizujPoziomyD(longSeries,{},bands,now+i*60);
eps(longSeries[key].p,longFive[key].p);
assert.ok(longMin[key].p < 5100);
assert.equal(aktualizujPoziomy(start,bands,now+3600)[key].n,1);
assert.equal(aktualizujPoziomyD(start,{},bands,now+4*3600)[key].n,1);
assert.equal(aktualizujPoziomy({...start,[key]:{...start[key],v:2}},bands,now+60)[key].n,1);
assert.equal(aktualizujPoziomy(start,{87:[{...card,id:'B'}]},now+60)[key].n,1);
console.log('OK: EMA zgodna dla cyklu 1 i 5 min, bez dryfu, bez dziedziczenia starej wersji/ID');

const immature = {[key]:{p:7200,n:500,od:now-600,t:now,v:3,id:'A'}};
const streak = {[key]:{n:12,od:now-1800,t:now,id:'A'}};
assert.equal(policzInwestycje(bands,immature,streak,now).length,0);
console.log('OK: liczba próbek nie zastepuje realnego czasu dojrzewania');

const floors = {83:700,84:900,85:2500,86:5000,87:7000,88:12000,89:20000};
const later = {...floors,85:2700,89:21000};
const ixNoDay = policzIndeks([{at:now-10*86400,floors,w:2},{at:now,floors:later,w:2}]);
assert.equal(ixNoDay.zmiana,null);
assert.equal(ixNoDay.odniesienie,'brak-doby');
assert.equal(ixNoDay.szerokosc.razem,0);
const ixDay = policzIndeks([{at:now-86400-1800,floors,w:2},{at:now,floors:later,w:2}]);
assert.equal(ixDay.okno,'24 h');
assert.ok(Number.isFinite(ixDay.zmiana));
console.log('OK: bez 24h danych nie ma falszywej zmiany dobowej');

assert.equal(progSbc({nazwa:'2x 83+ Upgrade', nagroda:89}).prog,null);
assert.equal(progSbc({nazwa:'SBC Test',nagroda:85}).prog,null);
assert.equal(progSbc({wymaganyRating:85,zrodloWymagan:'potwierdzone-wymagania-skladu'}).prog,85);
const cal = zbudujKalendarz({at:now,lista:[{nazwa:'Nagroda 85',nagroda:85,koszt:20000,wygasaAt:now+86400}]},{},{85:2500},now,3);
const wpisy=cal.flatMap(d=>d.wpisy);
assert.ok(wpisy.some(w=>w.tytul==='Wygasa Nagroda 85'&&w.typ==='termin'));
assert.ok(!wpisy.some(w=>w.typ==='sprzedaj'));
console.log('OK: ocena nagrody SBC nie uruchamia polecenia kupna/sprzedazy');

console.log('testy liczbowe: wszystkie zaliczone');
