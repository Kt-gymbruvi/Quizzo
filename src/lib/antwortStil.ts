// Eigene Antwortfarben mit Buchstaben (gut unterscheidbar, auch bei Farbschwäche durch die Buchstaben)
export const ANTWORT_STIL = [
  { buchstabe: 'A', farbe: 'bg-sky-500' },
  { buchstabe: 'B', farbe: 'bg-rose-500' },
  { buchstabe: 'C', farbe: 'bg-emerald-500' },
  { buchstabe: 'D', farbe: 'bg-violet-500' },
  { buchstabe: 'E', farbe: 'bg-orange-500' },
  { buchstabe: 'F', farbe: 'bg-teal-600' },
] as const

// Farben für Richtig/Falsch
export const WAHR_STIL = { farbe: 'bg-emerald-500', text: 'Richtig' }
export const FALSCH_STIL = { farbe: 'bg-rose-500', text: 'Falsch' }
