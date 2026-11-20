import type { Note, Stimme } from './motor.ts'

// Kleine Schreibhilfen zum Komponieren (Notennamen, Schlagzeugmuster, Wiederholungen)

const STUFE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** 'A4' → 69, 'F#3' → 54, 'Bb2' → 46 */
export function m(name: string): number {
  const t = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!t) throw new Error(`Unbekannter Ton: ${name}`)
  return 12 * (Number(t[3]) + 1) + STUFE[t[1]] + (t[2] === '#' ? 1 : t[2] === 'b' ? -1 : 0)
}

/** Schlagzeugmuster: 'x' = Schlag, 'X' = betonter Schlag, '.' = Pause; jedes Zeichen dauert `schritt` Schläge */
export function muster(stimme: Stimme, zeichen: string, schritt: number, laut = 1, start = 0): Note[] {
  const out: Note[] = []
  ;[...zeichen].forEach((z, i) => {
    if (z === 'x' || z === 'X') out.push({ t: start + i * schritt, stimme, laut: z === 'X' ? laut * 1.3 : laut, dauer: schritt })
  })
  return out
}

/** Melodie als Liste [Zeitpunkt, Ton, Länge] */
export function linie(stimme: Stimme, tuple: [number, string | number, number?][], laut = 1): Note[] {
  return tuple.map(([t, ton, dauer]) => ({ t, stimme, ton: typeof ton === 'string' ? m(ton) : ton, dauer: dauer ?? 0.5, laut }))
}

/** Gleichzeitig erklingender Akkord */
export function akkord(stimme: Stimme, t: number, toene: (string | number)[], dauer: number, laut = 1): Note[] {
  return toene.map((ton) => ({ t, stimme, ton: typeof ton === 'string' ? m(ton) : ton, dauer, laut }))
}

/** Wiederholt ein Muster `n`-mal im Abstand von `laenge` Schlägen */
export function wiederhole(noten: Note[], n: number, laenge: number): Note[] {
  return Array.from({ length: n }, (_, k) => noten.map((x) => ({ ...x, t: x.t + k * laenge }))).flat()
}

/** Verschiebt alle Noten um `t` Schläge */
export const ab = (noten: Note[], t: number): Note[] => noten.map((x) => ({ ...x, t: x.t + t }))
