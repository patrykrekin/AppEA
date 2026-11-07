import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zbudujMigawkeDecyzji, KOLUMNY, SHADOW_SCHEMA } from "./lib/shadow-decyzje.mjs";

const t = 1794079947;
const valid = () => ({
  at: t,
  bands: {
    ps: { "85": [
      { id: "111", name: "A", price: 1000, pos: "ST" },
      { id: "222", name: "B", price: 1200, pos: "CM" }
    ]},
    pc: { "85": [{ id: "111", name: "A", price: 1050, pos: "ST" }] }
  },
  preFast: {
    ps: { "A 85": {id:"111", p:1250.7, n:40, od:t-10000, t:t-600, v:3}},
    pc: { "A 85": {id:"111", p:1100.7, n:30, od:t-8000, t:t-800, v:3}}
  },
  preSlow: {
    ps: {
      "A 85": {id:"111", p:1325.5, n:85, od:t-30000, t:t-900, v:3},
      "B 85": {id:"999", p:1500, n:85, od:t-30000, t:t-900, v:3}
    },
    pc: { "A 85": {id:"111", p:1400, n:45, od:t-20000, t:t-1200, v:3}}
  },
  trwaloscPo: {
    ps: { "A 85": {id:"111", n:5, od:t-2200, t:t}},
    pc: { "A 85": {id:"111", n:3, od:t-900, t:t}}
  },
  okazje: { ps: { karty:[{klucz:"A 85"}]}, pc:{karty:[]} },
  inwestycje: { ps:[{klucz:"A 85",id:"111",cel:1350,kupnoDo:1050}],pc:[]}
});

let count=0;
const check=(label,fn)=>{fn();count++;console.log("OK: "+label);};
check("stan faktycznej decyzji, t oraz niezależność PC/PS",()=>{
 const v=valid(), before=JSON.stringify(v);
 const {migawka,statystyki}=zbudujMigawkeDecyzji(v);
 assert.equal(JSON.stringify(v),before,"funkcja nie moze zmieniac danych produkcyjnych");
 assert.equal(migawka.schemat,SHADOW_SCHEMA);
 assert.equal(KOLUMNY.length,migawka.ps[0].length);
 assert.equal(migawka.ps.length,2);
 assert.equal(migawka.pc.length,1);
 assert.deepEqual(migawka.ps[0].slice(0,3),[85,"111",1000]);
 assert.equal(migawka.ps[0][3],1250.7);
 assert.equal(migawka.ps[0][5],600);
 assert.equal(migawka.ps[0][7],1325.5);
 assert.equal(migawka.ps[0][9],900);
 assert.equal(migawka.ps[0][10],30000);
 assert.equal(migawka.ps[0][11],5);
 assert.equal(migawka.ps[0][12],2200);
 assert.deepEqual(migawka.ps[0].slice(13),[1,1,1350,1050]);
 assert.equal(migawka.pc[0][3],1100.7);
 assert.equal(migawka.pc[0][7],1400);
 assert.deepEqual(migawka.pc[0].slice(13),[0,0,null,null]);
 assert.equal(migawka.ps[1][7],null,"kolizja item ID nie moze dziedziczyc starej EMA");
 assert.deepEqual(migawka.ps[1].slice(13),[0,0,null,null]);
 assert.equal(statystyki.ps,2);assert.equal(statystyki.pc,1);
 assert.ok(statystyki.bajty<65536);
});
check("deterministyczny wynik bez ubocznych skutkow",()=>{
 const v=valid();
 assert.deepEqual(zbudujMigawkeDecyzji(v),zbudujMigawkeDecyzji(v));
});
check("brak danych z przyszlosci odrzucany",()=>{
 const v=valid();v.preFast.ps["A 85"].t=t+30;
 const row=zbudujMigawkeDecyzji(v).migawka.ps[0];
 assert.equal(row[3],null);assert.equal(row[5],null);
});
check("brak identyfikatora wersji nie pozwala dziedziczyc EMA",()=>{
 const v=valid();delete v.preFast.ps["A 85"].id;
 assert.equal(zbudujMigawkeDecyzji(v).migawka.ps[0][3],null);
});
check("brak ID odczytanej karty blokuje migawke",()=>{
 const v=valid();delete v.bands.ps[85][0].id;
 assert.throws(()=>zbudujMigawkeDecyzji(v),/wadliwy/);
});
check("duplikat tej samej karty blokuje migawke",()=>{
 const v=valid();v.bands.ps[85].push({...v.bands.ps[85][0]});
 assert.throws(()=>zbudujMigawkeDecyzji(v),/niejednoznaczny/);
});
check("kolizja nazwy ratingu dwoch roznych ID blokuje migawke",()=>{
 const v=valid();v.bands.ps[85].push({id:"333",name:"A",price:950});
 assert.throws(()=>zbudujMigawkeDecyzji(v),/niejednoznaczny/);
});
check("zla cena odrzucana bez korekt siatki",()=>{
 const v=valid();v.bands.ps[85][0].price=1001;
 assert.throws(()=>zbudujMigawkeDecyzji(v),/wadliwy/);
});
check("nie ma automatycznego ucinania wycinka po przekroczeniu limitu",()=>{
 const v=valid();v.limitBajtow=10;
 assert.throws(()=>zbudujMigawkeDecyzji(v),/przekracza limit/);
});
check("wynik nie pasujacy do item ID nie jest akceptowany",()=>{
 const v=valid();v.inwestycje.ps[0].id="444";
 assert.throws(()=>zbudujMigawkeDecyzji(v),/nieobecna/);
});
check("czas sprzed momentu archiwizacji i puste pasmo blokowane",()=>{
 const v=valid();v.at=-1;
 assert.throws(()=>zbudujMigawkeDecyzji(v),/czas/);
 const p=valid();p.bands.pc={};
 assert.throws(()=>zbudujMigawkeDecyzji(p),/brak poprawnych/);
});

// Jednorazowy benchmark rozmiaru, tylko dane odczytane i SYMULOWANE stany
// poziomow po to, by zobaczyc koszt. NIE jest to replay produkcyjnych decyzji.
let sizeInfo=null;
try {
 const h=JSON.parse(readFileSync(new URL("../historia-kart.json", import.meta.url),"utf8"));
 const at=h.at, bands={ps:{},pc:{}},preFast={ps:{},pc:{}},preSlow={ps:{},pc:{}},trwaloscPo={ps:{},pc:{}};
 for(const side of ["ps","pc"]){
   for(const card of Object.values(h[side]||{})){
     const last=card.punkty?.at(-1);
     if(!last || last[0]!==at)continue;
     const row={id:card.id,name:card.nazwa,price:last[1]};
     (bands[side][card.rating] ||= []).push(row);
     const key=row.name+" "+card.rating;
     // GORNOSZACUNKOWY koszt z dwiema EMA na kazda widoczna karte.
     preFast[side][key]={id:row.id,p:row.price*1.01,n:38,od:at-8000,t:at-300,v:3};
     preSlow[side][key]={id:row.id,p:row.price*1.07,n:84,od:at-29000,t:at-600,v:3};
     trwaloscPo[side][key]={id:row.id,n:2,od:at-1000,t:at};
   }
 }
 const model=zbudujMigawkeDecyzji({at,bands,preFast,preSlow,trwaloscPo,
   okazje:{ps:{karty:[]},pc:{karty:[]}},inwestycje:{ps:[],pc:[]}});
 sizeInfo={próbka:"SYNTETYCZNE stany EMA na rzeczywistej liczbie kart, tylko szacunek bajtow",
   karty:model.statystyki.ps+model.statystyki.pc,bajty:model.statystyki.bajty,
   przy6NaGodz48h:Math.round(model.statystyki.bajty*288/1024/1024*100)/100,
   przy1NaGodz48h:Math.round(model.statystyki.bajty*48/1024/1024*100)/100};
 console.log("SZACUNEK_ROZMIARU "+JSON.stringify(sizeInfo));
} catch(e){
 console.log("SZACUNEK_ROZMIARU_POMINIETY "+String(e.message||e));
 // Brak pasujacej migawki nie przesądza o wynikach testów jednostkowych.
}

console.log("PASS: "+count+" testow; zadnych dodatkowych zapytan FUT.GG");
