import { readFileSync } from "node:fs";
import { onGrid, net } from "./lib/grid.mjs";

/* Bramka przed publikacją. Zły plik jest gorszy niż stary plik,
   więc przy błędzie nic nie wychodzi na produkcję. */

const BUDGETS = [30000, 100000, 300000, 1500000];
const REQUIRED = ["at","index","momentum","verdict","movers","snipe","tier","pos"];

export function validate(d){
  const err = [], warn = [];

  for (const k of REQUIRED) if (!(k in d)) err.push(`brak klucza: ${k}`);
  if (err.length) return { err, warn };

  for (const p of ["ps","pc"]){
    if (!d.index?.[p]?.value)  err.push(`index.${p}.value brak — kontrakt jest per platforma`);
    if (!d.momentum?.[p])      err.push(`momentum.${p} brak — kontrakt jest per platforma`);
  }

  if (!Number.isInteger(d.at)) err.push("at musi być liczbą całkowitą (epoch w sekundach)");
  if (d.at > 1e12) err.push("at wygląda na milisekundy — ma być w sekundach");
  const ageH = (Date.now()/1000 - d.at) / 3600;
  if (ageH > 6) warn.push(`dane mają ${ageH.toFixed(1)} h`);

  for (const p of ["ps","pc"]){
    const rows = d.snipe?.[p]?.rows;
    if (!Array.isArray(rows) || !rows.length){ err.push(`snipe.${p}.rows puste`); continue; }
    rows.forEach(([name, market, buy, list], i) => {
      for (const [label, v] of [["rynek",market],["snajpuj do",buy],["wystaw",list]])
        if (!onGrid(v)) err.push(`snipe.${p}[${i}] ${name}: ${label} ${v} nie leży na siatce`);
      if (net(buy, list) <= 0) err.push(`snipe.${p}[${i}] ${name}: netto ${net(buy,list)} — pozycja do niczego`);
      if (list >= market) warn.push(`snipe.${p}[${i}] ${name}: wystawienie ${list} nie jest pod rynkiem ${market}`);
    });
  }

  for (const p of ["ps","pc"]){
    const rows=d.top?.[p]?.rows;
    if (rows===undefined) continue; // starszy plik przed pierwszym dwumarketowym cyklem TOP
    const sprawdzTop=(picks,label,max,requireSpread)=>{
      if (!Array.isArray(picks) || picks.length>max){err.push(`top.${p}.${label} musi mieć maksymalnie ${max} pozycji`);return;}
      picks.forEach((row,i)=>{
        for (const [field,value] of [["BIN",row.bin],["sufit",row.sufit],["wyjście",row.listAt]])
          if (!Number.isInteger(value) || !onGrid(value)) err.push(`top.${p}.${label}[${i}] ${row.name}: ${field} poza siatką`);
        if (row.bin>200000 || row.sufit>200000) err.push(`top.${p}.${label}[${i}] ${row.name}: przekracza limit 200 000`);
        if (net(row.sufit,row.listAt)<=0) err.push(`top.${p}.${label}[${i}] ${row.name}: brak zysku po podatku`);
        if (row.plynnosc<3 || row.zysk<=0) err.push(`top.${p}.${label}[${i}] ${row.name}: nie przeszedł filtrów taśmy`);
        if (requireSpread && (!Number.isFinite(row.rozrzut) || row.rozrzut<12 || row.bin<=20000)) err.push(`top.${p}.${label}[${i}] ${row.name}: za mały rozrzut lub cena poza zakresem droższej karty`);
      });
    };
    sprawdzTop(rows,"rows",5,false);
    if (d.top[p].high!==undefined) sprawdzTop(d.top[p].high,"high",3,true);
  }

  for (const side of ["short","long"]){
    const list = d.pos?.[side];
    if (!Array.isArray(list) || !list.length){ err.push(`pos.${side} puste`); continue; }
    list.forEach((o, i) => {
      if (!Number.isFinite(o.entry)) err.push(`pos.${side}[${i}] ${o.name}: entry nie jest liczbą`);
      else if (!onGrid(o.entry))     err.push(`pos.${side}[${i}] ${o.name}: entry ${o.entry} nie leży na siatce`);
      for (const f of ["name","price","when","sell","why","exit"])
        if (!o[f]) err.push(`pos.${side}[${i}]: brak pola ${f}`);
    });
    for (const b of BUDGETS)
      if (!list.some(o => o.entry * 10 <= b))
        err.push(`pos.${side}: przy budżecie ${b} nie ma ani jednej dostępnej pozycji — dziura w drabinie`);
  }

  if (!Array.isArray(d.movers) || d.movers.length < 5) warn.push("movers ma mniej niż 5 wierszy");

  return { err, warn };
}

if (process.argv[1]?.endsWith("validate.mjs")){
  const file = process.argv[2] || "data.json";
  const { err, warn } = validate(JSON.parse(readFileSync(file, "utf8")));
  warn.forEach(w => console.log("  uwaga:", w));
  if (err.length){ err.forEach(e => console.log("  BŁĄD :", e)); console.log(`\n${file}: ${err.length} błędów — nie publikować`); process.exit(1); }
  console.log(`\n${file}: OK${warn.length ? ` (${warn.length} uwag)` : ""}`);
}
