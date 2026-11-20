import type { Stueck } from './motor.ts'
import { akkord, linie, m, muster, wiederhole } from './noten.ts'

// Quizzo-Klang im Stil bekannter Quiz-Shows (Kahoot): hüpfender Synth-Beat, schnell und aufgedreht.
// Alles selbst komponiert – keine Melodie aus einem bestehenden Spiel.

// ── Lobby: 8 Takte, Am – F – C – G, zweimal; in der zweiten Hälfte kommt der Hook dazu ──
const WURZELN = [m('A2'), m('F2'), m('C3'), m('G2')]
const ARPEGGIO = [
  ['A4', 'C5', 'E5'],
  ['F4', 'A4', 'C5'],
  ['C5', 'E5', 'G5'],
  ['G4', 'B4', 'D5'],
]
const lobbyTakt = (i: number, b: number) => [
  // hüpfender Bass in Achteln
  ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].flatMap((t, k) => ({ t: b + t, stimme: 'bass' as const, ton: WURZELN[i] + ([0, 0, 12, 0, 0, 12, 0, 12][k] ?? 0), dauer: 0.4, laut: 1 })),
  // Zupf-Arpeggio
  ...[0, 1, 2, 1, 0, 1, 2, 1].map((x, k) => ({ t: b + k * 0.5, stimme: 'pluck' as const, ton: m(ARPEGGIO[i][x]), dauer: 0.3, laut: 0.55 })),
]
const lobbyBeat = [
  ...muster('kick', 'x'.repeat(32), 1, 0.9),
  ...muster('klatsch', '.x'.repeat(16), 1, 0.7),
  ...muster('hat', '.x'.repeat(32), 0.5, 0.8, 0),
]
const hook = linie(
  'lead',
  [
    [16, 'E5', 1.5], [17.5, 'G5'], [18, 'A5', 1], [19, 'G5', 1],
    [20, 'F5', 1.5], [21.5, 'A5'], [22, 'C6', 1], [23, 'A5', 1],
    [24, 'G5', 1.5], [25.5, 'E5'], [26, 'G5', 1], [27, 'C6', 1],
    [28, 'B5', 1.5], [29.5, 'A5'], [30, 'G5', 1], [31, 'D5', 1],
  ],
  0.8,
)
export const LOBBY: Stueck = {
  bpm: 126,
  beats: 32,
  laut: 0.5,
  noten: [...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((takt) => lobbyTakt(takt % 4, takt * 4)), ...lobbyBeat, ...hook],
}

// ── Frage: treibender, angespannter Puls (Am – Am – F – E), 4 Takte ──
const FRAGE_WURZEL = [m('A2'), m('A2'), m('F2'), m('E2')]
const FRAGE_TOENE = [
  ['A4', 'C5', 'E5', 'A5'],
  ['A4', 'C5', 'E5', 'A5'],
  ['F4', 'A4', 'C5', 'F5'],
  ['E4', 'G#4', 'B4', 'E5'],
]
const frageTakt = (i: number, b: number) => [
  ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t, k) => ({ t: b + t, stimme: 'bass' as const, ton: FRAGE_WURZEL[i] + (k % 2 ? 12 : 0), dauer: 0.35, laut: 0.95 })),
  ...Array.from({ length: 16 }, (_, k) => ({ t: b + k * 0.25, stimme: 'pluck' as const, ton: m(FRAGE_TOENE[i][k % 4]), dauer: 0.2, laut: 0.28 + (k % 4 === 0 ? 0.12 : 0) })),
]
export const FRAGE: Stueck = {
  bpm: 148,
  beats: 16,
  laut: 0.46,
  noten: [
    ...[0, 1, 2, 3].flatMap((t) => frageTakt(t, t * 4)),
    ...muster('kick', 'x'.repeat(16), 1, 0.85),
    ...muster('snare', '.x.x'.repeat(4), 1, 0.7),
    ...muster('hat', 'x'.repeat(32), 0.5, 0.55),
  ],
}
/** Die letzten Sekunden: derselbe Puls, noch schneller */
export const FRAGE_DRINGEND: Stueck = { ...FRAGE, bpm: 178, laut: 0.5 }

// ── Effekte ──
export const START: Stueck = {
  bpm: 130,
  laut: 0.7,
  noten: [...linie('pluck', [[0, 'A4', 0.25], [0.25, 'E5', 0.25], [0.5, 'A5', 0.5], [1, 'E6', 1]], 1.3), ...muster('kick', 'x', 1, 1)],
}

/** Auflösung: Trommelwirbel, dann Schlag und heller Akkord */
export const AUFLOESEN: Stueck = {
  bpm: 120,
  laut: 0.85,
  noten: [
    ...Array.from({ length: 16 }, (_, k) => ({ t: k * 0.125, stimme: 'snare' as const, laut: 0.3 + (k / 16) * 0.8, dauer: 0.1 })),
    ...muster('kick', 'x', 1, 1.1, 2),
    ...muster('becken', 'x', 1, 0.9, 2),
    ...akkord('blech', 2, ['C4', 'E4', 'G4', 'C5'], 1.2, 0.9),
  ],
}

/** Endstand: kleine Fanfare */
export const SIEG: Stueck = {
  bpm: 124,
  laut: 0.85,
  noten: [
    ...linie('blech', [[0, 'C4', 0.5], [0.5, 'E4', 0.5], [1, 'G4', 0.5], [1.5, 'C5', 1.5]], 1),
    ...akkord('blech', 3, ['C4', 'E4', 'G4', 'C5'], 2, 1),
    ...linie('glocke', [[0, 'C6'], [0.5, 'E6'], [1, 'G6'], [1.5, 'C7', 1], [3, 'E6'], [3.5, 'G6'], [4, 'C7', 1]], 0.9),
    ...muster('kick', 'x.x.x', 1, 1, 0),
    ...wiederhole(muster('klatsch', 'x', 1, 0.8, 3), 2, 1),
    ...muster('becken', 'x', 1, 1, 3),
  ],
}
