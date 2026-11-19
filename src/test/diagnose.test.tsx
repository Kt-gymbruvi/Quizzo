import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import { schwacheFragen, werteAus, type DiagnoseAntwort } from '../lib/diagnose.ts'
import { neueFrage, type Frage } from '../lib/fragetypen.ts'
import { abfrage, eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

const MC = { ...neueFrage('auswahl'), text: 'Hauptstadt von Frankreich?', inhalt: { antworten: ['Lyon', 'Paris', 'Nizza'], richtig: [1] } } as Frage
const WF = { ...neueFrage('wahrfalsch'), text: 'Wale sind Fische.', inhalt: { richtig: false } } as Frage
const UMFRAGE = { ...neueFrage('umfrage'), text: 'Wie war es?', inhalt: { antworten: ['gut', 'schlecht'] } } as Frage
const FRAGEN = [MC, WF, UMFRAGE]
const SPIELER = [
  { id: 's1', spitzname: 'Fuchs' },
  { id: 's2', spitzname: 'Igel' },
  { id: 's3', spitzname: 'Dachs' },
]
const ANTWORTEN: DiagnoseAntwort[] = [
  { spieler_id: 's1', frage_nr: 0, antwort: [1], anteil: 1 },
  { spieler_id: 's2', frage_nr: 0, antwort: [0], anteil: 0 },
  { spieler_id: 's3', frage_nr: 0, antwort: [0], anteil: 0 },
  { spieler_id: 's1', frage_nr: 1, antwort: false, anteil: 1 },
  { spieler_id: 's2', frage_nr: 1, antwort: false, anteil: 1 },
  { spieler_id: 's1', frage_nr: 2, antwort: [0], anteil: 0 },
]

describe('Diagnose: Auswertung', () => {
  it('Quote pro Frage (keine Antwort zählt als falsch) und häufigste falsche Antwort', () => {
    const a = werteAus({ fragen: FRAGEN, spieler: SPIELER, antworten: ANTWORTEN })
    expect(a.fragen[0]).toMatchObject({ quote: 1 / 3, beantwortet: 3, fehler: { text: 'Lyon', anzahl: 2 } })
    expect(a.fragen[1]).toMatchObject({ quote: 2 / 3, fehler: null })
    expect(a.fragen[2]).toMatchObject({ quote: null, beantwortet: 1 }) // Umfrage ohne Wertung
    expect(schwacheFragen(a.fragen)).toEqual([MC])
  })
  it('Mitspielende: schwächste zuerst, Umfragen zählen nicht', () => {
    const a = werteAus({ fragen: FRAGEN, spieler: SPIELER, antworten: ANTWORTEN })
    expect(a.spieler.map((s) => [s.spieler.spitzname, s.gesamt])).toEqual([
      ['Dachs', 0],
      ['Igel', 0.5],
      ['Fuchs', 1],
    ])
    expect(a.spieler[0].anteile).toEqual([0, null, null])
  })
})

describe('Diagnose: Seite für die Lehrkraft', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  function datenbank() {
    fakeSupabase.from.mockImplementation((tabelle: string) => {
      if (tabelle === 'spiele') return abfrage({ data: { quiz_id: 'q1', runde: 1 }, error: null })
      if (tabelle === 'quizze') return abfrage({ data: { titel: 'Erdkunde', fragen: FRAGEN.map((f, position) => ({ ...f, position })) }, error: null })
      if (tabelle === 'spieler') return abfrage({ data: SPIELER, error: null })
      if (tabelle === 'antworten') return abfrage({ data: ANTWORTEN, error: null })
      return abfrage({ data: [], error: null })
    })
    fakeSupabase.rpc.mockImplementation(async (name: string) => (name === 'quiz_speichern' ? { data: 'q-neu', error: null } : { data: null, error: null }))
  }

  it('zeigt schwere Fragen, Hilfebedarf und legt ein Wiederholungs-Quiz an', async () => {
    datenbank()
    render(
      <MemoryRouter initialEntries={['/leiten/spiel/sp1/diagnose']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/nicht am Beamer zeigen/)).toBeInTheDocument()
    expect(await screen.findByText('33 %')).toBeInTheDocument()
    expect(screen.getByText('„Lyon“')).toBeInTheDocument()
    const zeilen = within(screen.getByRole('table')).getAllByRole('row')
    expect(zeilen[1]).toHaveTextContent('Dachs')
    expect(zeilen[3]).toHaveTextContent('Fuchs')
    expect(fakeSupabase.from).toHaveBeenCalledWith('antworten')

    await userEvent.click(screen.getByRole('button', { name: 'Quiz „Erdkunde – Wiederholung“ anlegen' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('quiz_speichern', expect.objectContaining({ p_id: null, p_titel: 'Erdkunde – Wiederholung', p_fragen: [expect.objectContaining({ text: 'Hauptstadt von Frankreich?' })] }))
    expect(await screen.findByRole('link', { name: 'Jetzt bearbeiten' })).toHaveAttribute('href', '/leiten/quiz/q-neu')
  })
})
