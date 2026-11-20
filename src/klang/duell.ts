import type { Stueck } from './motor.ts'
import { akkord, linie, m, muster, wiederhole } from './noten.ts'

// Klassen-Duell: Klang im Stil großer Rate-Shows (Jeopardy). Die „Denkpause“ ist eine eigene Komposition mit dem
// typischen Charakter solcher Musik (treibender Puls, kurze Akkordschläge, schlichte Glockenmelodie in Schritten); die bekannte Originalmelodie ist urheberrechtlich geschützt und wird nicht nachgebaut.
// Dazu Buzzer, Ding und Fehlersummer.

// ── Denkpause: 16 Takte bei 128 Schlägen/Minute = genau 30 Sekunden, zwei Durchläufe füllen die 60 Sekunden ──
//    Akkorde: C C F G | Am Em F G | C Am F G | C F G G (endet offen und führt in die Wiederholung)
//    Antreibender Puls: Bass auf jedem Achtel, Akkordschläge auf den Zwischenzählzeiten, Hi-Hat, Kick und Klatschen.
const FOLGE = ['C', 'C', 'F', 'G', 'Am', 'Em', 'F', 'G', 'C', 'Am', 'F', 'G', 'C', 'F', 'G', 'G']
const WURZEL: Record<string, string> = { C: 'C3', F: 'F2', G: 'G2', Am: 'A2', Em: 'E2' }
const DREIKLANG: Record<string, string[]> = {
  C: ['E4', 'G4', 'C5'],
  F: ['F4', 'A4', 'C5'],
  G: ['D4', 'G4', 'B4'],
  Am: ['E4', 'A4', 'C5'],
  Em: ['E4', 'G4', 'B4'],
}
const melodie = linie(
  'glocke',
  [
    [0, 'E5', 1], [1, 'G5', 0.5], [1.5, 'E5', 0.5], [2, 'D5', 1], [3, 'C5', 0.5], [3.5, 'D5', 0.5],
    [4, 'E5', 1.5], [5.5, 'G5', 0.5], [6, 'C6', 2],
    [8, 'A5', 1], [9, 'F5', 0.5], [9.5, 'A5', 0.5], [10, 'G5', 1], [11, 'F5', 0.5], [11.5, 'E5', 0.5],
    [12, 'D5', 1], [13, 'G5', 1], [14, 'B5', 1], [15, 'D6', 1],
    [16, 'C6', 1], [17, 'A5', 0.5], [17.5, 'E5', 0.5], [18, 'A5', 1], [19, 'C6', 1],
    [20, 'B5', 1], [21, 'G5', 0.5], [21.5, 'E5', 0.5], [22, 'G5', 1], [23, 'B5', 1],
    [24, 'A5', 1], [25, 'C6', 0.5], [25.5, 'A5', 0.5], [26, 'F5', 1], [27, 'A5', 0.5], [27.5, 'C6', 0.5],
    [28, 'D6', 1], [29, 'B5', 1], [30, 'G5', 1], [31, 'D5', 1],
    [32, 'G5', 1], [33, 'E6', 0.5], [33.5, 'C6', 0.5], [34, 'G5', 1], [35, 'E5', 0.5], [35.5, 'G5', 0.5],
    [36, 'A5', 1.5], [37.5, 'C6', 0.5], [38, 'E6', 2],
    [40, 'F6', 1], [41, 'C6', 0.5], [41.5, 'A5', 0.5], [42, 'F5', 1], [43, 'A5', 1],
    [44, 'G5', 1], [45, 'B5', 0.5], [45.5, 'D6', 0.5], [46, 'G6', 2],
    [48, 'E6', 1], [49, 'D6', 0.5], [49.5, 'C6', 0.5], [50, 'G5', 1], [51, 'E5', 1],
    [52, 'F5', 1], [53, 'A5', 0.5], [53.5, 'C6', 0.5], [54, 'F6', 2],
    [56, 'D6', 1], [57, 'B5', 0.5], [57.5, 'G5', 0.5], [58, 'D5', 1], [59, 'G5', 1],
    [60, 'B5', 0.5], [60.5, 'D6', 0.5], [61, 'G6', 1], [62, 'F6', 0.5], [62.5, 'D6', 0.5], [63, 'B5', 1],
  ],
  1,
)
export const DENKPAUSE: Stueck = {
  bpm: 128,
  beats: 64,
  laut: 0.55,
  noten: [
    ...FOLGE.flatMap((c, i) => {
      const w = m(WURZEL[c])
      const takt = i * 4
      return [
        // Bass: Grundton auf dem Schlag, Oktave dazwischen
        ...[0, 1, 2, 3].flatMap((k) => [
          { t: takt + k, stimme: 'bass' as const, ton: w, dauer: 0.45, laut: 0.9 },
          { t: takt + k + 0.5, stimme: 'bass' as const, ton: w + 12, dauer: 0.3, laut: 0.55 },
        ]),
        // Akkordschläge auf den Zwischenzählzeiten
        ...[0, 1, 2, 3].flatMap((k) => akkord('pluck', takt + k + 0.5, DREIKLANG[c], 0.25, 0.5)),
        // leiser Teppich
        ...akkord('streicher', takt, DREIKLANG[c], 3.8, 0.22),
        // Schlagzeug: Kick auf 1 und 3, Klatschen auf 2 und 4, Hi-Hat auf jedem Achtel
        { t: takt, stimme: 'kick' as const, laut: 0.8 },
        { t: takt + 2, stimme: 'kick' as const, laut: 0.7 },
        { t: takt + 1, stimme: 'klatsch' as const, laut: 0.55 },
        { t: takt + 3, stimme: 'klatsch' as const, laut: 0.55 },
        ...Array.from({ length: 8 }, (_, k) => ({ t: takt + k / 2, stimme: 'hat' as const, laut: k % 2 === 0 ? 0.4 : 0.28 })),
      ]
    }),
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
