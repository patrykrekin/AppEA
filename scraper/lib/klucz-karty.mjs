/* Kanoniczny klucz karty z pasma.

   Rejestry cenowe i poziomy porównują konkretną kartę, nie całe pasmo:
   ta sama nazwa może wystąpić z różnym ratingiem, więc rating jest częścią
   indeksu. Format musi pozostać zgodny z istniejącymi danymi w data.json. */
export function kluczKarty(nazwa, rating){
  return `${nazwa} ${rating}`;
}
