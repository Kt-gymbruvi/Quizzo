import {
  FRAGETYPEN,
  TYP_REIHENFOLGE,
  bereinigeFrage,
  exportiereQuiz,
  importiereQuiz,
  neueFrage,
  pruefeFrage,
  pruefeQuiz,
  wechsleTyp,
  type Frage,
} from '../lib/fragetypen.ts'
import beispiel from '../../beispiele/alle-fragetypen.quizzo.json?raw'

const mc = (antworten: string[], richtig: number[]): Frage => ({ ...neueFrage('auswahl'), text: 'Frage?', inhalt: { antworten, richtig } }) as Frage

describe('Quiz-Prüfung', () => {
  it('akzeptiert ein vollständiges Quiz', () => {
    expect(pruefeQuiz('Mathe', [mc(['3', '4'], [1])])).toEqual([])
  })
  it('verlangt Titel und mindestens eine Frage', () => {
    expect(pruefeQuiz('  ', [])).toEqual(['Bitte gib dem Quiz einen Titel.', 'Das Quiz braucht mindestens eine Frage.'])
  })
  it('nennt die Nummer der fehlerhaften Frage', () => {
    expect(pruefeQuiz('Mathe', [mc(['a', 'b'], [0]), { ...mc(['a', ''], [0]), text: '' }])).toEqual([
      'Frage 2: Der Fragetext fehlt.',
      'Frage 2: Bitte mindestens zwei Antworten ausfüllen.',
    ])
  })
  it('neue Fragen jedes Typs sind erst nach dem Ausfüllen gültig', () => {
    for (const typ of TYP_REIHENFOLGE) {
      const f = neueFrage(typ)
      const fehler = pruefeFrage(f)
      expect(fehler.length, typ).toBeGreaterThan(0) // mindestens der Fragetext fehlt
    }
  })
})

describe('Prüfung je Fragetyp', () => {
  it('Multiple Choice: richtige Antwort muss ausgefüllt sein', () => {
    expect(pruefeFrage(mc(['a', 'b', ''], [2]))).toContain('Bitte mindestens eine ausgefüllte Antwort als richtig markieren.')
  })
  it('Freitext braucht mindestens eine Lösung', () => {
    expect(pruefeFrage({ ...neueFrage('freitext'), text: 'x' })).toContain('Bitte mindestens eine richtige Lösung eintragen.')
  })
  it('Sortieren: mindestens drei verschiedene Elemente', () => {
    const f = { ...neueFrage('reihenfolge'), text: 'x', inhalt: { elemente: ['a', 'b', 'A'] } } as Frage
    expect(pruefeFrage(f)).toContain('Jedes Element darf nur einmal vorkommen.')
  })
  it('Zuordnung: Paare müssen beidseitig ausgefüllt sein', () => {
    const f = { ...neueFrage('zuordnung'), text: 'x', inhalt: { paare: [{ links: 'a', rechts: '' }, { links: 'b', rechts: '2' }] } } as Frage
    expect(pruefeFrage(f)).toContain('Bitte jedes Paar auf beiden Seiten ausfüllen.')
  })
  it('Schieberegler: richtige Zahl muss im Bereich liegen', () => {
    const f = { ...neueFrage('schieberegler'), text: 'x', inhalt: { min: 0, max: 10, schritt: 1, richtig: 11, toleranz: 0 } } as Frage
    expect(pruefeFrage(f)).toContain('Die richtige Zahl muss zwischen Minimum und Maximum liegen.')
  })
  it('Umfrage, Wortwolke, offene Frage und Folie brauchen nur einen Text', () => {
    expect(pruefeFrage({ ...neueFrage('wortwolke'), text: 'Lieblingsfach?' })).toEqual([])
    expect(pruefeFrage({ ...neueFrage('offen'), text: 'Warum?' })).toEqual([])
    expect(pruefeFrage({ ...neueFrage('folie'), text: 'Pause' })).toEqual([])
  })
})

describe('Bereinigen vor dem Speichern', () => {
  it('Multiple Choice: entfernt leere Antworten und verschiebt die richtigen Indizes', () => {
    const f = bereinigeFrage(mc(['', ' Bonn ', '', 'Berlin'], [1, 3]))
    expect(f.inhalt).toEqual({ antworten: ['Bonn', 'Berlin'], richtig: [0, 1] })
  })
  it('Fragen ohne Wertung bekommen nie Punkte', () => {
    expect(bereinigeFrage({ ...neueFrage('umfrage'), punkte: 2 }).punkte).toBe(0)
  })
  it('leere Einheit beim Schieberegler wird weggelassen', () => {
    const f = bereinigeFrage({ ...neueFrage('schieberegler'), text: 'x' })
    expect(f.inhalt).not.toHaveProperty('einheit')
  })
})

describe('Typ wechseln', () => {
  it('übernimmt Antworten zwischen Multiple Choice, Umfrage und Sortieren', () => {
    const f = mc(['a', 'b', 'c'], [1])
    const u = wechsleTyp(f, 'umfrage')
    expect(u.inhalt).toEqual({ antworten: ['a', 'b', 'c'] })
    expect(wechsleTyp(u, 'reihenfolge').inhalt).toEqual({ elemente: ['a', 'b', 'c'] })
    expect(wechsleTyp(f, 'wahrfalsch').text).toBe('Frage?')
  })
  it('setzt Standard-Zeit und -Punkte des neuen Typs', () => {
    const f = wechsleTyp(mc(['a', 'b'], [0]), 'offen')
    expect(f.zeitlimit).toBe(FRAGETYPEN.offen.zeitlimit)
    expect(f.punkte).toBe(0)
  })
})

describe('Import und Export', () => {
  const quiz: Frage[] = [
    mc(['Lyon', 'Paris'], [1]),
    { typ: 'wahrfalsch', text: 'Die Erde ist rund.', zeitlimit: 10, punkte: 2, inhalt: { richtig: true } },
    { typ: 'folie', text: 'Pause', zeitlimit: 20, punkte: 0, inhalt: { text: 'Gleich geht es weiter.' } },
    { typ: 'zuordnung', text: 'Tiere', zeitlimit: 60, punkte: 1, inhalt: { paare: [{ links: 'Hund', rechts: 'bellt' }, { links: 'Katze', rechts: 'miaut' }] } },
  ]

  it('Export und Import ergeben wieder dasselbe Quiz', () => {
    const datei = JSON.stringify(exportiereQuiz('Mix', quiz))
    const ergebnis = importiereQuiz(datei)
    expect(ergebnis.fehler).toEqual([])
    expect(ergebnis.titel).toBe('Mix')
    expect(ergebnis.fragen).toEqual(quiz)
  })

  it('Folientext und Überschrift bleiben getrennt', () => {
    const datei = exportiereQuiz('Mix', quiz)
    expect(datei.fragen[2]).toMatchObject({ typ: 'folie', text: 'Pause', folientext: 'Gleich geht es weiter.' })
  })

  it('ist großzügig bei handgeschriebenen Dateien', () => {
    const datei = JSON.stringify({
      titel: 'Hand',
      fragen: [
        { text: 'Ohne Typ = Multiple Choice', antworten: ['a', 'b'], richtig: 1 },
        { typ: 'wahrfalsch', text: 'Wahr?', richtig: 'wahr' },
        { typ: 'schieberegler', text: 'Zahl', min: '0', max: 10, richtig: 5 },
      ],
    })
    const e = importiereQuiz(datei)
    expect(e.fehler).toEqual([])
    expect(e.fragen[0].inhalt).toEqual({ antworten: ['a', 'b'], richtig: [1] })
    expect(e.fragen[1].inhalt).toEqual({ richtig: true })
    expect(e.fragen[2].inhalt).toMatchObject({ min: 0, max: 10, richtig: 5, schritt: 1 })
  })

  it('meldet unvollständige Fragen mit Nummer', () => {
    const e = importiereQuiz(JSON.stringify({ titel: 'X', fragen: [{ typ: 'freitext', text: 'Hauptstadt?' }] }))
    expect(e.fehler).toEqual(['Frage 1: Bitte mindestens eine richtige Lösung eintragen.'])
  })

  it('die Beispieldatei mit allen Fragetypen ist fehlerfrei', () => {
    const e = importiereQuiz(beispiel)
    expect(e.fehler).toEqual([])
    expect(new Set(e.fragen.map((f) => f.typ))).toEqual(new Set(TYP_REIHENFOLGE))
  })

  it('lehnt Dateien ab, die kein Quiz sind', () => {
    expect(() => importiereQuiz('kein json')).toThrow('kein JSON')
    expect(() => importiereQuiz('{"titel":"x"}')).toThrow('fragen')
  })
})
