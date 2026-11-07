import { readFileSync,writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const [snapshotPath, dataPath, summaryPath] = process.argv.slice(2);
if (!snapshotPath || !dataPath || !summaryPath) throw new Error("uzycie: node sprawdz-etap8.mjs shadow.json data.json summary.json");
const s=JSON.parse(readFileSync(snapshotPath,"utf8")), d=JSON.parse(readFileSync(dataPath,"utf8"));
assert.equal(d.awaria,null,"produkcja izolowana musi byc bez bledu");
assert.equal(d.atFast,s.migawka.czasOdczytuStart,"synchronizacja t");
assert.equal(d.at,s.migawka.czasOdczytuStart,"ten sam przebieg fast");
assert.equal(s.migawka.schemat,1);
assert.ok(s.migawka.definicje.szybka);
assert.ok(s.migawka.definicje.inwestycja);
assert.match(s.migawka.definicje.commit,/^[a-f0-9]{40}$/);
assert.ok(s.czasMs>=0 && s.czasMs<1000,"CPU overhead >=1 sekundy — wymagany audyt");
assert.ok(s.statystyki.bajty<=65536);
const output={wynik:"zgodne",t:s.migawka.czasOdczytuStart,iso:new Date(s.migawka.czasOdczytuStart*1000).toISOString(),czasMs:s.czasMs,bajty:s.statystyki.bajty,commit:s.migawka.definicje.commit,platformy:{}};
for(const side of ["ps","pc"]){
  const rows=s.migawka[side],meta=s.metryki[side];
  const decisions=d.inwestycje?.[side]||[],now=d.okazje?.teraz?.[side]||[];
  assert.ok(Array.isArray(rows)&&rows.length>0,"brak wycinka "+side);
  assert.equal(rows.length,meta.obserwowane);
  assert.equal(rows.filter(r=>r[13]===1).length,meta.szybkieWAlgorytmie,"licznik sygnalow "+side);
  assert.equal(rows.filter(r=>r[14]===1).length,meta.topInwestycjeWAlgorytmie,"licznik inwestycji "+side);
  assert.equal(rows.filter(r=>r[14]===1).length,decisions.length,"wynik inwestycji niezgodny z data.json "+side);
  assert.equal(rows.filter(r=>r[3]!==null).length,meta.zEMAprzedSzybka);
  assert.equal(rows.filter(r=>r[7]!==null).length,meta.zEMAprzedDobowa);
  assert.equal(rows.filter(r=>r[11]!==null).length,meta.zTrwalosciaPo);
  const ids=new Set(),names=new Set(),keys=new Set();
  for(const row of rows){
    assert.equal(row.length,18);
    const [rating,profileId,price,emaF,nF,ageF,oldF,emaD,nD,ageD,oldD,trN,trAge,opp,inv,target,limit,name]=row;
    assert.ok(Number.isInteger(rating)&&Number.isInteger(price)&&price>0);
    assert.match(String(profileId),/^\d+$/);
    assert.equal(typeof name,"string");
    const key=side+"|"+rating+"|"+profileId+"|"+name;
    assert.ok(!ids.has(key),"duplikat karty w shadow");ids.add(key);
    const label=name+" "+rating;keys.add(label);
    assert.ok(!names.has(label),"kolizja nazw przy tej samej ocenie"); names.add(label);
    if(emaF!==null){assert.ok(emaF>0&&nF>=1&&ageF>=0&&oldF>=0);}
    if(emaD!==null){assert.ok(emaD>0&&nD>=1&&ageD>=0&&oldD>=0);}
    if(trN!==null)assert.ok(trN>=0&&trAge>=0);
    assert.ok(opp===0||opp===1);assert.ok(inv===0||inv===1);
    if(inv===0){assert.equal(target,null);assert.equal(limit,null);}
    else{assert.ok(Number.isFinite(target)&&Number.isFinite(limit));}
  }
  for(const item of decisions){
    const found=rows.filter(row=>row[14]===1&&row[1]===String(item.id)&&
      row[17]+" "+row[0]===item.klucz);
    assert.equal(found.length,1,"wybrana karta nie ma rownego wiersza "+side+"/"+item.klucz);
    assert.equal(found[0][2],item.cena);
    assert.equal(found[0][7],item.poziom,"EMA dobowa z innego momentu "+side+"/"+item.klucz);
    assert.equal(found[0][15],item.cel);
    assert.equal(found[0][16],item.kupnoDo);
  }
  for(const row of now){
    if(row.klucz){assert.ok(keys.has(row.klucz),"opublikowana okazja bez karty shadow "+side);}
  }
  const sygnalKeys=new Set(rows.filter(r=>r[13]===1).map(r=>r[17]+" "+r[0]));
  for(const key of meta.szybkieKlucze)assert.ok(sygnalKeys.has(key));
  output.platformy[side]={
    karty:rows.length,wKoszyku:meta.decyzjaRozpatrywana,pozaKoszykiem:meta.pozaKoszykiem,
    EMAFastPrzed:meta.zEMAprzedSzybka, EMADobowaPrzed:meta.zEMAprzedDobowa,trwaloscPo:meta.zTrwalosciaPo,
    okazje:meta.szybkieWAlgorytmie,wybraneInwestycje:meta.topInwestycjeWAlgorytmie,
    zgodneZPublikacjaInwestycje:decisions.length,
    deltaWartosciPreVsPo:rows.filter(r=>{
      if(r[7]===null)return false;
      const current=d.okazje?.poziomyD?.[side]?.[r[17]+" "+r[0]];
      return current && Number.isFinite(current.p) && current.p!==r[7];
    }).length
  };
}
writeFileSync(summaryPath,JSON.stringify(output,null,2)+"\n");
console.log("ETAP8_WYNIK "+JSON.stringify(output));
