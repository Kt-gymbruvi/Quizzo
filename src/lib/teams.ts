// Teams im Teamspiel: Name, Zeichen (auch bei Farbschwäche unterscheidbar) und Farbe.
// Team-Nummern in der Datenbank: 1 bis 6.
export const TEAMS = [
  { name: 'Blau', zeichen: '●', farbe: 'bg-sky-600', rand: 'ring-sky-400' },
  { name: 'Rot', zeichen: '▲', farbe: 'bg-rose-600', rand: 'ring-rose-400' },
  { name: 'Grün', zeichen: '■', farbe: 'bg-emerald-600', rand: 'ring-emerald-400' },
  { name: 'Lila', zeichen: '◆', farbe: 'bg-violet-600', rand: 'ring-violet-400' },
  { name: 'Orange', zeichen: '★', farbe: 'bg-orange-600', rand: 'ring-orange-400' },
  { name: 'Türkis', zeichen: '⬢', farbe: 'bg-teal-600', rand: 'ring-teal-400' },
] as const

export const team = (nr: number | null | undefined) => (nr ? TEAMS[nr - 1] : undefined)
export const teamName = (nr: number | null | undefined) => (nr ? `Team ${TEAMS[nr - 1].name}` : '')

export type TeamWertung = { team: number; punkte: number; mitglieder: number; platz: number }[]
