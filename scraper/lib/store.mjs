import { readFileSync, writeFileSync, renameSync, existsSync, openSync, closeSync, unlinkSync } from "node:fs";

/* Dwa crony piszą do jednego pliku, więc każdy zapis idzie przez lock i jest atomowy.
   Bez tego szybki cykl potrafi nadpisać to, co wolny właśnie zapisał. */

const LOCK_STALE_MS = 120000;

function lock(path){
  const lf = path + ".lock";
  for (let i = 0; i < 100; i++){
    try { closeSync(openSync(lf, "wx")); return lf; }
    catch {
      try {
        const age = Date.now() - Number(readFileSync(lf, "utf8") || 0);
        if (age > LOCK_STALE_MS) unlinkSync(lf);
      } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  throw new Error("nie udało się przejąć locka na " + path);
}

export function read(path){
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

/** Podmienia TYLKO podane klucze najwyższego poziomu. Reszta pliku zostaje. */
export function patch(path, fields){
  const lf = lock(path);
  try {
    const cur = read(path);
    const next = { ...cur, ...fields, at: fields.at ?? cur.at };
    const tmp = path + ".tmp";
    /* 30.09.2026: zapis BEZ wcięć. Plik urósł do 555 kB, a strona pobiera go co
       minutę — przy 100 GB miesięcznego limitu GitHub Pages to jakieś cztery osoby
       z otwartą kartą przez dobę. Z tych 555 kB aż 335 to były same spacje i znaki
       nowej linii, bo zapisywaliśmy z wcięciem dwóch spacji. Sam plik czyta wyłącznie
       maszyna i przeglądarka; do zaglądania gołym okiem jest widok na GitHubie,
       który i tak formatuje JSON sam. Treść bez zmian, ruch o 60% mniejszy. */
    writeFileSync(tmp, JSON.stringify(next) + "\n");
    renameSync(tmp, path);          // atomowa podmiana — czytelnik nigdy nie zobaczy połówki pliku
    return next;
  } finally { try { unlinkSync(lf); } catch {} }
}
