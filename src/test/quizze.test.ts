import { bereinigeFrage, neueFrage, pruefeQuiz, zuEditorFrage, type EditorFrage } from '../lib/quizze.ts'

function frage(teil: Partial<EditorFrage> = {}): EditorFrage {
  return { ...neueFrage(), text: 'Was ist 2 + 2?', antworten: ['3', '4', '', ''], richtig: 1, ...teil }
}

describe('Quiz-Prüfung', () => {
  it('akzeptiert ein vollständiges Quiz', () => {
    expect(pruefeQuiz('Mathe', [frage()])).toEqual([])
  })
  it('verlangt Titel und mindestens eine Frage', () => {
    expect(pruefeQuiz('  ', [])).toEqual(['Bitte gib dem Quiz einen Titel.', 'Das Quiz braucht mindestens eine Frage.'])
  })
  it('meldet fehlenden Fragetext und zu wenige Antworten mit Fragennummer', () => {
    const fehler = pruefeQuiz('Mathe', [frage(), frage({ text: '', antworten: ['nur eine', '', '', ''], richtig: 0 })])
    expect(fehler).toEqual(['Frage 2: Der Fragetext fehlt.', 'Frage 2: Bitte mindestens zwei Antworten ausfüllen.'])
  })
  it('meldet, wenn die richtige Antwort leer ist', () => {
    expect(pruefeQuiz('Mathe', [frage({ richtig: 3 })])).toEqual(['Frage 1: Die als richtig markierte Antwort ist leer.'])
  })
})

describe('Fragen bereinigen', () => {
  it('entfernt leere Antworten und passt den Index der richtigen Antwort an', () => {
    const f = bereinigeFrage(frage({ text: '  Hauptstadt?  ', antworten: ['', ' Bonn ', '', 'Berlin'], richtig: 3 }))
    expect(f).toEqual({ text: 'Hauptstadt?', antworten: ['Bonn', 'Berlin'], richtig: 1, zeitlimit: 20 })
  })
  it('füllt geladene Fragen wieder auf vier Antwortfelder auf', () => {
    expect(zuEditorFrage({ text: 'x', antworten: ['a', 'b'], richtig: 1, zeitlimit: 30 }).antworten).toEqual(['a', 'b', '', ''])
  })
})
