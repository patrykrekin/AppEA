import { validate } from "../validate.mjs";

/* Nie dopuszczamy błędnej wyceny do publikacji. Jeżeli jedynym błędem są
   statystyki transakcji, zamrażamy tylko tę niezależną sekcję: świeże ceny,
   indeks i szeregi czasowe nie mogą stać przez jeden wadliwy wynik rejestru. */
export function przygotujPublikacje(poprz = {}, fields = {}){
  const wynik = validate({ ...poprz, ...fields });
  if (!wynik.err.length) {
    return { fields: fields.rejestr ? { ...fields, statusRejestru: null } : fields,
      warn: wynik.warn, odlozonyRejestr: false };
  }

  const bladRejestru = tekst => /^(rejestr\.|skutecznosc\.)/.test(tekst);
  if (fields.rejestr && wynik.err.every(bladRejestru)) {
    const powod = wynik.err.slice(0, 3);
    const ostrozne = {
      ...fields,
      rejestr: poprz.rejestr,       // bez nowego, potencjalnie fałszywego trafienia
      skutecznosc: poprz.skutecznosc,
      statusRejestru: { at: fields.at, powod }
    };
    const kontrola = validate({ ...poprz, ...ostrozne });
    if (!kontrola.err.length) {
      return { fields: ostrozne,
        warn: [...wynik.warn, ...kontrola.warn, `WSTRZYMANY REJESTR: ${powod.join(" | ")}`],
        odlozonyRejestr: true };
    }
  }

  const wyjatek = new Error(`${wynik.err.length} błędów walidacji — nic nie zapisuję`);
  wyjatek.szczegoly = wynik.err.slice(0, 8);
  throw wyjatek;
}
