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
    writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
    renameSync(tmp, path);          // atomowa podmiana — czytelnik nigdy nie zobaczy połówki pliku
    return next;
  } finally { try { unlinkSync(lf); } catch {} }
}
