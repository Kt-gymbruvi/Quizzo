import type { Stueck } from './motor.ts'
import { akkord, linie, m, muster, wiederhole } from './noten.ts'

// Klassen-Duell: Klang im Stil großer Rate-Shows (Jeopardy) – würdevolle „Denkpause“ mit tickendem Puls,
// Glockenmelodie und Streicherteppich, dazu Buzzer, Ding und Fehlersummer. Eigene Komposition.

// ── Denkpause: 8 Takte (C – G – Am – F – C – G – F – G), ruhiges Tempo, Holzblock-Tick auf jedem Schlag ──
const WURZEL = ['C3', 'G2', 'A2', 'F2', 'C3', 'G2', 'F2', 'G2'].map(m)
const TEPPICH = [
  ['G3', 'C4', 'E4'],
  ['B3', 'D4', 'G4'],
  ['A3', 'C4', 'E4'],
  ['A3', 'C4', 'F4'],
  ['G3', 'C4', 'E4'],
  ['B3', 'D4', 'G4'],
  ['A3', 'C4', 'F4'],
  ['B3', 'D4', 'G4'],
]
const melodie = linie(
  'glocke',
  [
    [0, 'E5', 1], [1, 'G5', 1], [2, 'E5'], [2.5, 'D5'], [3, 'C5', 1],
    [4, 'D5', 1], [5, 'G5', 1], [6, 'B4', 2],
    [8, 'C5', 1], [9, 'E5', 1], [10, 'A5', 1.5], [11.5, 'G5'],
    [12, 'F5', 1], [13, 'A5', 1], [14, 'C6', 1], [15, 'A5', 1],
    [16, 'G5', 1], [17, 'E5', 1], [18, 'G5'], [18.5, 'A5'], [19, 'G5', 1],
    [20, 'D5', 1], [21, 'B5', 1], [22, 'A5', 1], [23, 'G5', 1],
    [24, 'A5', 1], [25, 'F5', 1], [26, 'C5', 2],
    [28, 'D5', 1], [29, 'G5', 1], [30, 'B5', 1], [31, 'D6', 1],
  ],
  0.85,
)
export const DENKPAUSE: Stueck = {
  bpm: 84,
  beats: 32,
  laut: 0.5,
  noten: [
    ...WURZEL.flatMap((w, i) => [0, 1, 2, 3].map((k) => ({ t: i * 4 + k, stimme: 'bass' as const, ton: w + [0, 7, 12, 7][k], dauer: 0.8, laut: 0.8 }))),
    ...TEPPICH.flatMap((a, i) => akkord('streicher', i * 4, a, 3.6, 0.9)),
    ...Array.from({ length: 32 }, (_, k) => ({ t: k, stimme: 'holz' as const, ton: k % 4 === 0 ? 91 : 84, dauer: 0.1, laut: k % 4 === 0 ? 0.55 : 0.4 })),
    ...melodie,
  ],
}

// ── Effekte ──
/** Das Brett füllt sich: schnelle aufsteigende Glitzertöne */
export const BRETT: Stueck = {
  bpm: 160,
  laut: 0.7,
  noten: [
    ...linie('glocke', ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].map((n, i) => [i * 0.25, n, 1] as [number, string, number]), 0.8),
    ...akkord('blech', 2, ['C4', 'G4', 'C5'], 1, 0.8),
  ],
}

/** Ein Feld wird geöffnet */
export const FELD: Stueck = {
  bpm: 140,
  laut: 0.7,
  noten: [...linie('glocke', [[0, 'G5'], [0.25, 'C6'], [0.5, 'E6', 1]], 0.9), ...muster('kick', 'x', 1, 0.6)],
}

/** Ein Team hat gebuzzert */
export const BUZZER: Stueck = {
  bpm: 120,
  laut: 1.2,
  noten: [
    // zwei harte Schläge „BZZT-BZZZT“, der zweite höher und länger, dazu Knall von Bassdrum und Snare
    { t: 0, stimme: 'alarm', ton: m('A4'), dauer: 0.3, laut: 1.2 },
    { t: 0.4, stimme: 'alarm', ton: m('E5'), dauer: 0.7, laut: 1.3 },
    { t: 0, stimme: 'kick', laut: 1.3 },
    { t: 0.4, stimme: 'snare', laut: 1.3 },
  ],
}

/** Richtig: zweistufiges „Ding“ */
export const RICHTIG: Stueck = {
  bpm: 120,
  laut: 0.8,
  noten: [...linie('glocke', [[0, 'G5', 1], [0.25, 'C6', 1.5], [0.5, 'E6', 2]], 1), ...akkord('blech', 0.5, ['C4', 'E4', 'G4'], 0.9, 0.6)],
}

/** Falsch: tiefer Summer */
export const FALSCH: Stueck = {
  bpm: 100,
  laut: 0.8,
  noten: [
    { t: 0, stimme: 'buzz', ton: m('A2'), dauer: 1.1, laut: 1 },
    { t: 0, stimme: 'buzz', ton: m('Eb3'), dauer: 1.1, laut: 0.8 },
  ],
}

/** Niemand wusste es: zwei weiche, absteigende Töne */
export const NIEMAND: Stueck = {
  bpm: 100,
  laut: 0.6,
  noten: linie('glocke', [[0, 'E5', 1], [0.6, 'C5', 2]], 0.8),
}

/** Zeit abgelaufen: drei dumpfe Töne */
export const ZEIT_AUS: Stueck = {
  bpm: 110,
  laut: 0.8,
  noten: [0, 0.5, 1].map((t, k) => ({ t, stimme: 'buzz' as const, ton: m('A2') - k * 2, dauer: k === 2 ? 0.9 : 0.3, laut: 1 })),
}

/** Endstand: Fanfare mit Becken */
export const SIEG: Stueck = {
  bpm: 112,
  laut: 0.85,
  noten: [
    ...linie('blech', [[0, 'G4', 0.5], [0.5, 'C5', 0.5], [1, 'E5', 0.5], [1.5, 'G5', 1.5]], 1),
    ...akkord('blech', 3, ['C4', 'G4', 'C5', 'E5'], 2.4, 1),
    ...linie('glocke', [[3, 'C6', 2], [3.5, 'E6', 2], [4, 'G6', 2], [4.5, 'C7', 2]], 0.8),
    ...muster('kick', 'x.x.x', 1, 1),
    ...wiederhole(muster('snare', 'x', 1, 0.8, 3), 2, 0.5),
    ...muster('becken', 'x', 1, 1, 3),
  ],
}
