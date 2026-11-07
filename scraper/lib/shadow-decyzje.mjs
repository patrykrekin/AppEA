/**
 * BADANIE: pasywny zapis KONTEKSTU decyzji (nie nowy silnik rekomendacji).
 * Bez I/O, fetch(), zapisu produkcyjnego i aktualizacji stanu.
 * Wołający musi przekazać poziomy sprzed aktualizacji p(t), faktyczne wyniki
 * policzOkazje/policzInwestycje oraz trwalosc juz odswiezona w tym przebiegu.
 *
 * Klucz wycinka: platforma + rating + ID profilu FUT.GG + nazwa.\n * To NIE dowodzi jednoznacznej wersji promocyjnej (ten sam ID bywa przy dwoch OVR).
 * Wiersz jest opisem odczytanego wycinka FUT.GG, nie transakcja.
 * Brak karty w kolejnym odczycie nie rozstrzyga ceny ani sprzedazy.
 */
import { kluczKarty } from "./klucz-karty.mjs";
import { onGrid } from "./grid.mjs";

export const SHADOW_SCHEMA = 1;
export const LIMIT_BAJTOW_MIGAWKI = 65536;
export const KOLUMNY = Object.freeze([
  "rating", "idProfiluFutGG", "cena", "emaSzybkaPrzed", "nSzybkaPrzed",
  "wiekPomiaruSzybkaSek", "wiekModeluSzybkaSek", "emaDobowaPrzed",
  "nDobowaPrzed", "wiekPomiaruDobowaSek", "wiekModeluDobowaSek",
  "trwaloscPoBiezacymN", "trwaloscPoBiezacymSek",
  "okazjaSzybkaWynik", "inwestycjaWTop12", "celTop12", "kupnoDoTop12", "nazwaZListy"
]);

const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const goodId = x => /^\d+$/.test(String(x || ""));
const goodTime = x => Number.isInteger(x) && x > 0;
const age = (at, t) => goodTime(t) && t <= at ? at - t : null;

function poziomPrzed(w, id, at) {
  if (!isObj(w) || w.v !== 3 || !Number.isFinite(w.p) || !(w.p > 0)
    || !goodTime(w.t) || w.t > at) return null;
  // Brak ID tez nie uprawnia do przypisania starego poziomu NOWEJ wersji karty.
  if (!goodId(w.id) || String(w.id) !== id) return null;
  return w;
}

function poprawnaTrwalosc(tr, id, at) {
  if (!isObj(tr) || !goodId(tr.id) || String(tr.id) !== id) return null;
  if (!Number.isInteger(tr.n) || tr.n < 0 || age(at, tr.od) === null) return null;
  if (!goodTime(tr.t) || tr.t > at) return null;
  return tr;
}

/**
 * @param {object} input - wyłącznie obiekty z juz zrobionego odczytu.
 * preFast/preSlow musza byc po filtrujPoziomy, ale PRZED aktualizujPoziomy*.
 * trwaloscPo jest juz po aktualizujTrwalosc (to jej wynik trafia do inwestycji).
 * Wszystkie wiersze obserwowane, rowniez bez rekomendacji, tworza kontrole.
 */
export function zbudujMigawkeDecyzji({
  at, bands, preFast, preSlow, trwaloscPo, okazje, inwestycje,
  definicje, limitBajtow = LIMIT_BAJTOW_MIGAWKI
}) {
  if (!goodTime(at)) throw new Error("shadow: nieprawidlowy czas odczytu");
  if (!isObj(definicje) || typeof definicje.szybka !== "string" || !definicje.szybka
    || typeof definicje.inwestycja !== "string" || !definicje.inwestycja
    || typeof definicje.commit !== "string" || !/^[a-f0-9]{7,40}$/.test(definicje.commit))
    throw new Error("shadow: brak podpisu definicji i commitu algorytmu");
  if (!Number.isInteger(limitBajtow) || limitBajtow <= 0)
    throw new Error("shadow: zly limit bajtow");
  const result = {
    schemat: SHADOW_SCHEMA,
    czasOdczytuStart: at,
    co: "wycinek-rankingowy/nie-transakcje",
    faza: "EMA przed p(t); trwalosc po uwzglednieniu p(t)",
    definicje: { szybka: definicje.szybka, inwestycja: definicje.inwestycja,
      commit: definicje.commit },
    ps: [], pc: []
  };
  for (const side of ["ps", "pc"]) {
    const ryn = bands?.[side];
    if (!isObj(ryn) || !Object.keys(ryn).length)
      throw new Error("shadow: brak poprawnych pasm " + side);
    const seenWariant = new Set(), seenCard = new Set(), seenName = new Set();
    const fast = preFast?.[side] || {}, slow = preSlow?.[side] || {};
    const tr = trwaloscPo?.[side] || {};
    const fastList = okazje?.[side]?.karty || [];
    const investList = inwestycje?.[side] || [];
    if (!Array.isArray(fastList) || !Array.isArray(investList))
      throw new Error("shadow: nieprawidlowa lista wynikow " + side);
    const fastNames = new Set(fastList.map(x => x.klucz));
    const investByCard = new Map();
    for (const x of investList) {
      if (!goodId(x.id) || !x.klucz || investByCard.has(x.klucz + "|" + String(x.id)))
        throw new Error("shadow: nierozstrzygalna tozsamosc inwestycji " + side);
      investByCard.set(x.klucz + "|" + String(x.id), x);
    }
    for (const rawR of Object.keys(ryn).sort((a,b) => Number(a) - Number(b))) {
      const rating = Number(rawR), cards = ryn[rawR];
      if (!Number.isInteger(rating) || rating < 1 || rating > 99 || !Array.isArray(cards) || !cards.length)
        throw new Error("shadow: wadliwe pasmo " + side + "/" + rawR);
      for (const c of cards) {
        const id = String(c?.id || ""), key = kluczKarty(c?.name, rating);
        const wariant = rating + "/" + id;
        if (!goodId(id) || typeof c.name !== "string" || !c.name.trim()
          || !onGrid(c.price) || seenWariant.has(wariant) || seenName.has(key))
          throw new Error("shadow: wadliwy/niejednoznaczny rekord " + side + "/" + rawR);
        seenWariant.add(wariant); seenCard.add(key + "|" + id); seenName.add(key);
        const f = poziomPrzed(fast[key], id, at);
        const s = poziomPrzed(slow[key], id, at);
        const t = poprawnaTrwalosc(tr[key], id, at);
        const inv = investByCard.get(key + "|" + id);
        if (inv && inv.klucz !== key)
          throw new Error("shadow: inwestycja ma inna wersje karty " + side + "/" + id);
        result[side].push([
          rating, id, c.price,
          f ? f.p : null, f ? f.n : null, f ? age(at, f.t) : null, f ? age(at, f.od) : null,
          s ? s.p : null, s ? s.n : null, s ? age(at, s.t) : null, s ? age(at, s.od) : null,
          t ? t.n : null, t ? age(at, t.od) : null,
          fastNames.has(key) ? 1 : 0,
          inv ? 1 : 0,
          inv ? inv.cel : null,
          inv ? inv.kupnoDo : null,
          c.name
        ]);
      }
    }
    // Wynik rekomendacji niewidziany w przekazanym wycinku to NIE fałszywy brak sukcesu.
    for (const pair of investByCard.keys()) if (!seenCard.has(pair))
      throw new Error("shadow: rekomendacja nieobecna w poprawnym wycinku " + side + "/" + pair);
    for (const key of fastNames) if (!seenName.has(key))
      throw new Error("shadow: szybki sygnal nieobecny w wycinku " + side + "/" + key);
  }
  const bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
  if (bytes > limitBajtow)
    throw new Error("shadow: migawka przekracza limit " + bytes + "/" + limitBajtow);
  return { migawka: result, statystyki: {
    bajty: bytes, ps: result.ps.length, pc: result.pc.length,
    okazje: {ps: result.ps.filter(x => x[13] === 1).length,pc: result.pc.filter(x => x[13] === 1).length},
    wybraneInwestycje: {ps: result.ps.filter(x => x[14] === 1).length,pc: result.pc.filter(x => x[14] === 1).length}
  }};
}
