import { fragenReihenfolge, mischeFrage, zufallAus } from '../lib/mischen.ts'
import type { SchuelerFrage } from '../lib/spiel.ts'

const frage = (typ: string): { typ: string } => ({ typ })

describe('Mischen', () => {
  it('gleicher Schlüssel, gleiche Folge – anderer Schlüssel, andere Folge', () => {
    const a = zufallAus('t1')
    const b = zufallAus('t1')
    const folge = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(folge)
    expect(folge.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(zufallAus('t2')()).not.toBe(folge[0])
  })

  it('Fragen-Reihenfolge: jede Frage genau einmal, Folien bleiben an ihrem Platz', () => {
    const fragen = [frage('folie'), ...Array.from({ length: 8 }, () => frage('auswahl')), frage('folie'), frage('wahrfalsch')]
    const verschieden = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const o = fragenReihenfolge(fragen, `person-${i}`)
      expect([...o].sort((x, y) => x - y)).toEqual(fragen.map((_, k) => k))
      expect(o[0]).toBe(0)
      expect(o[9]).toBe(9)
      expect(fragenReihenfolge(fragen, `person-${i}`)).toEqual(o) // Neuladen ändert nichts
      verschieden.add(o.join(','))
    }
    expect(verschieden.size).toBeGreaterThan(10)
  })

  it('Multiple Choice: Anzeige gemischt, Antwort zurück in Original-Nummern', () => {
    const mc: SchuelerFrage = { typ: 'auswahl', text: 'x', zeitlimit: 0, punkte: 1, ansicht: { antworten: ['A', 'B', 'C', 'D', 'E'], mehrfach: true } }
    for (let i = 0; i < 10; i++) {
      const { frage: f, zurueck } = mischeFrage(mc, `s${i}`)
      const angezeigt = f.ansicht.antworten!
      expect([...angezeigt].sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
      // wer „B“ und „D“ antippt, schickt immer [1, 3]
      expect(zurueck([angezeigt.indexOf('D'), angezeigt.indexOf('B')])).toEqual([1, 3])
    }
    expect(mc.ansicht.antworten).toEqual(['A', 'B', 'C', 'D', 'E']) // Original unverändert
  })

  it('Reihenfolge: Elemente als Text, Antwort unverändert', () => {
    const r: SchuelerFrage = { typ: 'reihenfolge', text: 'x', zeitlimit: 0, punkte: 1, ansicht: { elemente: ['a', 'b', 'c', 'd'] } }
    const { frage: f, zurueck } = mischeFrage(r, 'x')
    expect([...f.ansicht.elemente!].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(zurueck(['d', 'c', 'b', 'a'])).toEqual(['d', 'c', 'b', 'a'])
  })
})
