import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TonSchalter } from '../klang/hooks.tsx'
import { setzeTon, spieleEffekt, starteSchleife, tonAn, type Stueck } from '../klang/motor.ts'
import { m } from '../klang/noten.ts'
import * as duell from '../klang/duell.ts'
import * as quizzo from '../klang/quizzo.ts'
import { BREITE, HOEHE, legeWolkeAus } from '../wortwolke.tsx'

const MELODISCH = new Set(['pluck', 'lead', 'bass', 'rhodes', 'glocke', 'streicher', 'blech', 'buzz', 'alarm'])
const alle = (modul: Record<string, unknown>) => Object.entries(modul).filter((e): e is [string, Stueck] => typeof e[1] === 'object' && e[1] !== null && 'noten' in e[1])

describe('Klänge', () => {
  it('Notennamen werden richtig übersetzt', () => {
    expect(m('A4')).toBe(69)
    expect(m('C4')).toBe(60)
    expect(m('F#3')).toBe(54)
    expect(m('Eb3')).toBe(51)
  })

  for (const [name, modul] of [['Quizzo', quizzo], ['Duell', duell]] as const) {
    describe(name, () => {
      for (const [id, s] of alle(modul)) {
        it(`${id}: Noten liegen im Stück und haben Tonhöhen`, () => {
          expect(s.noten.length).toBeGreaterThan(0)
          for (const n of s.noten) {
            expect(n.t).toBeGreaterThanOrEqual(0)
            if (s.beats) expect(n.t).toBeLessThan(s.beats)
            if (MELODISCH.has(n.stimme)) expect(Number.isFinite(n.ton)).toBe(true)
          }
        })
      }
    })
  }

  it('Musik hat eine Schleifenlänge, Effekte nicht', () => {
    for (const s of [quizzo.LOBBY, quizzo.FRAGE, quizzo.FRAGE_DRINGEND, duell.DENKPAUSE]) expect(s.beats).toBeGreaterThan(0)
    for (const s of [quizzo.START, quizzo.AUFLOESEN, quizzo.SIEG, duell.RICHTIG, duell.FALSCH, duell.BUZZER]) expect(s.beats).toBeUndefined()
  })

  it('ohne Web Audio passiert einfach nichts (Tests, alte Browser)', () => {
    expect(() => spieleEffekt(quizzo.START)).not.toThrow()
    expect(() => starteSchleife(quizzo.LOBBY)()).not.toThrow()
  })

  it('Ton-Schalter schaltet um und merkt sich die Wahl', async () => {
    localStorage.removeItem('ton-an')
    setzeTon(true)
    render(<TonSchalter />)
    await userEvent.click(screen.getByRole('button', { name: 'Ton ausschalten' }))
    expect(tonAn()).toBe(false)
    expect(localStorage.getItem('ton-an')).toBe('0')
    await userEvent.click(screen.getByRole('button', { name: 'Ton einschalten' }))
    expect(tonAn()).toBe(true)
  })
})

describe('Wortwolke: Anordnung', () => {
  const woerter = ['Mathe', 'Kunst', 'Sport', 'Biologie', 'Geschichte', 'Musik', 'Physik', 'Chemie', 'Deutsch', 'Englisch', 'Latein', 'Informatik'].map((text, i) => ({ schluessel: text, text, anzahl: 12 - i }))

  it('alle Wörter haben Platz im Bild, nichts überlappt, die Frage bleibt frei', () => {
    const frage = 'Was fällt euch zum Thema Schule ein?'
    const l = legeWolkeAus(frage, woerter)
    expect(l.woerter).toHaveLength(woerter.length)
    const kasten = l.woerter.map((w) => ({ x: w.x, y: w.y, b: w.text.length * w.schrift * 0.58 + 1.2, h: w.schrift * 1.2 + 0.6 }))
    for (const k of kasten) {
      expect(k.x - k.b / 2).toBeGreaterThanOrEqual(1)
      expect(k.x + k.b / 2).toBeLessThanOrEqual(BREITE - 1)
      expect(k.y - k.h / 2).toBeGreaterThanOrEqual(1)
      expect(k.y + k.h / 2).toBeLessThanOrEqual(HOEHE - 1)
    }
    const ueber = (a: (typeof kasten)[number], b: (typeof kasten)[number]) => Math.abs(a.x - b.x) < (a.b + b.b) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
    kasten.forEach((a, i) => kasten.slice(i + 1).forEach((b) => expect(ueber(a, b)).toBe(false)))
    const mitte = { x: BREITE / 2, y: HOEHE / 2, b: l.frage.breite, h: 3 * l.frage.schrift }
    kasten.forEach((k) => expect(ueber(k, { ...mitte, h: l.frage.schrift * 1.25 + 3.5 })).toBe(false))
  })

  it('häufige Wörter werden größer dargestellt und liegen näher an der Frage', () => {
    const l = legeWolkeAus('Frage?', woerter)
    const [erstes, letztes] = [l.woerter[0], l.woerter[l.woerter.length - 1]]
    expect(erstes.schrift).toBeGreaterThan(letztes.schrift)
    const abstand = (w: { x: number; y: number }) => Math.hypot((w.x - BREITE / 2) / 1.9, w.y - HOEHE / 2)
    expect(abstand(erstes)).toBeLessThan(abstand(letztes))
  })

  it('gleiche Eingabe ergibt dieselbe Wolke (keine Zufallsanordnung)', () => {
    expect(legeWolkeAus('Frage?', woerter)).toEqual(legeWolkeAus('Frage?', woerter))
  })
})
