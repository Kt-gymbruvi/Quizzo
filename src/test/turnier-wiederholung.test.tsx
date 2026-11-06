import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import type { LehrkraftZustand, SchuelerFrage, SchuelerZustand } from '../lib/spiel.ts'
import { MAX_UEBUNGEN, bewerte, ladeUebungen, merkeErgebnis, merkeFehler, type Uebung } from '../lib/wiederholung.ts'
import { abfrage, eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

function renderApp(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )
}
function rpcAntworten(antworten: Record<string, unknown>) {
  fakeSupabase.rpc.mockImplementation(async (name: string) => ({ data: antworten[name] ?? null, error: null }))
}

const MC: SchuelerFrage = { typ: 'auswahl', text: 'Hauptstadt von Frankreich?', zeitlimit: 20, punkte: 1, ansicht: { antworten: ['Lyon', 'Paris', 'Nizza'], mehrfach: false } }
const WF: SchuelerFrage = { typ: 'wahrfalsch', text: 'Wale sind Fische.', zeitlimit: 10, punkte: 1, ansicht: {} }

function lehrkraft(teil: Partial<LehrkraftZustand>): LehrkraftZustand {
  return {
    id: 's1',
    pin: '482913',
    status: 'ende',
    frage_nr: 2,
    anzahl_fragen: 3,
    quiz_titel: 'Erdkunde',
    frage: null,
    restzeit_ms: null,
    spieler: [{ id: 'p1', spitzname: 'Fuchs', punkte: 2400, team: null }],
    antworten: [],
    beantwortet: 0,
    modus: 'klassisch',
    anzahl_teams: null,
    teams: null,
    runde: 1,
    ...teil,
  }
}

function schueler(teil: Partial<SchuelerZustand>): SchuelerZustand {
  return {
    status: 'lobby',
    frage_nr: -1,
    anzahl_fragen: 3,
    spitzname: 'Fuchs',
    punkte: 0,
    platz: 1,
    anzahl_spieler: 4,
    frage: null,
    restzeit_ms: null,
    meine_antwort: null,
    loesung: null,
    modus: 'klassisch',
    team: null,
    teams: null,
    runde: 1,
    ...teil,
  }
}
const imSpiel = () =>
  localStorage.setItem('quizzo-teilnahme', JSON.stringify({ spiel_id: 's1', spieler_id: 'p1', token: 't1', spitzname: 'Fuchs', pin: '482913', gemerkt: Date.now() }))

describe('Turnier', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('nach dem Endstand geht es mit einem anderen eigenen Quiz weiter', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({}) })
    fakeSupabase.from.mockImplementation(() =>
      abfrage({
        data: [
          { id: 'q2', titel: 'Hauptstädte', geaendert_am: '2026-11-06T10:00:00Z', fragen: [{ count: 5 }] },
          { id: 'q3', titel: 'Leeres Quiz', geaendert_am: '2026-11-06T10:00:00Z', fragen: [{ count: 0 }] },
        ],
        error: null,
      }),
    )
    renderApp('/leiten/spiel/s1')
    await userEvent.click(await screen.findByRole('button', { name: '🏆 Turnier: Runde 2 mit anderem Quiz' }))
    expect(await screen.findByText('Mit welchem Quiz geht es weiter?')).toBeInTheDocument()
    expect(screen.queryByText('Leeres Quiz')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Hauptstädte/ }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_naechste_runde', { p_spiel: 's1', p_quiz_id: 'q2' })
  })

  it('zeigt die Runde am Beamer und die Gesamtpunkte im Endstand', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({ runde: 3 }) })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByText('Gesamtpunkte aus 3 Runden')).toBeInTheDocument()
    expect(screen.getByText('Runde 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🏆 Turnier: Runde 4 mit anderem Quiz' })).toBeInTheDocument()
  })

  it('auf dem Handy: neue Runde mit bisherigem Stand', async () => {
    imSpiel()
    rpcAntworten({ spiel_zustand_schueler: schueler({ runde: 2, punkte: 1800, platz: 2 }) })
    renderApp('/mitspielen')
    expect(await screen.findByText('Runde 2')).toBeInTheDocument()
    expect(screen.getByText('Bisher: 1800 Punkte · Platz 2 von 4')).toBeInTheDocument()
  })
})

describe('Wiederholung: Bewertung auf dem Gerät (wie der Server)', () => {
  const u = (frage: Partial<SchuelerFrage> & Pick<SchuelerFrage, 'typ'>, loesung: unknown): Uebung => ({ id: 'x', frage: { ...MC, ...frage } as SchuelerFrage, loesung, gemerkt: Date.now() })

  it('alle Fragetypen', () => {
    expect(bewerte(u({ typ: 'auswahl' }, [0, 2]), [2, 0])).toBe(1)
    expect(bewerte(u({ typ: 'auswahl' }, [0, 2]), [0])).toBe(0)
    expect(bewerte(u({ typ: 'wahrfalsch' }, false), false)).toBe(1)
    expect(bewerte(u({ typ: 'freitext' }, ['Berlin']), '  berlin ')).toBe(1)
    expect(bewerte(u({ typ: 'reihenfolge' }, ['a', 'b', 'c']), ['a', 'c', 'b'])).toBe(0)
    expect(bewerte(u({ typ: 'zuordnung' }, [{ links: 'Hund', rechts: 'bellt' }, { links: 'Katze', rechts: 'miaut' }]), ['bellt', 'bellt'])).toBe(0.5)
    const regler = u({ typ: 'schieberegler', ansicht: { min: 0, max: 100 } }, { richtig: 50, toleranz: 5 })
    expect(bewerte(regler, 54)).toBe(1)
    expect(bewerte(regler, 80)).toBeCloseTo(0, 5) // 25 daneben, Spanne 25 → 0
  })
})

describe('Wiederholung: nur auf dem Gerät gespeichert', () => {
  beforeEach(() => setzeFakeZurueck())

  it('merkt falsch beantwortete Fragen nach dem Auflösen – ohne Spitznamen und Punkte', async () => {
    imSpiel()
    rpcAntworten({
      spiel_zustand_schueler: schueler({ status: 'auswertung', frage_nr: 0, frage: MC, meine_antwort: { antwort: [0], richtig: false, anteil: 0, punkte: 0 }, loesung: [1] }),
    })
    renderApp('/mitspielen')
    expect(await screen.findByText('Leider falsch')).toBeInTheDocument()
    const gespeichert = localStorage.getItem('quizzo-wiederholung')!
    expect(ladeUebungen()).toEqual([expect.objectContaining({ frage: MC, loesung: [1] })])
    expect(gespeichert).not.toMatch(/Fuchs|token|spieler|meine_antwort/)
  })

  it('richtig beantwortete Fragen werden nicht gemerkt bzw. gestrichen', () => {
    merkeFehler(MC, [1])
    merkeErgebnis(MC, [1], 1)
    expect(ladeUebungen()).toEqual([])
  })

  it('Umfragen und Folien kommen nicht in die Wiederholung', () => {
    merkeFehler({ ...MC, typ: 'umfrage' }, null)
    merkeFehler({ ...MC, typ: 'folie' }, null)
    expect(ladeUebungen()).toEqual([])
  })

  it('höchstens 50 Fragen, keine doppelten, nach 30 Tagen weg', () => {
    for (let i = 0; i < 60; i++) merkeFehler({ ...MC, text: `Frage ${i}` }, [1])
    merkeFehler({ ...MC, text: 'Frage 59' }, [1])
    expect(ladeUebungen()).toHaveLength(MAX_UEBUNGEN)
    const alt = ladeUebungen().map((x) => ({ ...x, gemerkt: Date.now() - 31 * 24 * 3600_000 }))
    localStorage.setItem('quizzo-wiederholung', JSON.stringify(alt))
    expect(ladeUebungen()).toEqual([])
  })

  it('üben: richtig → verschwindet, falsch → bleibt mit Lösung', async () => {
    merkeFehler(MC, [1])
    merkeFehler(WF, false)
    renderApp('/wiederholen')
    // zuletzt gemerkte Frage zuerst
    expect(await screen.findByText('Wale sind Fische.')).toBeInTheDocument()
    expect(screen.getByText('Noch 2 Fragen · ohne Zeitdruck')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Richtig' })) // falsch
    expect(screen.getByText('Noch nicht')).toBeInTheDocument()
    expect(screen.getByText(/Richtig ist:/)).toHaveTextContent('Falsch')
    await userEvent.click(screen.getByRole('button', { name: 'Nächste Frage' }))

    expect(screen.getByText('Hauptstadt von Frankreich?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Paris/ }))
    expect(screen.getByText('Richtig!')).toBeInTheDocument()
    expect(ladeUebungen().map((x) => x.frage.text)).toEqual(['Wale sind Fische.'])
  })

  it('alles löschen', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    merkeFehler(MC, [1])
    renderApp('/wiederholen')
    await userEvent.click(await screen.findByRole('button', { name: 'Alle löschen' }))
    expect(screen.getByText('Nichts zu wiederholen')).toBeInTheDocument()
    expect(localStorage.getItem('quizzo-wiederholung')).toBeNull()
  })

  it('die Startseite zeigt den Weg zur Wiederholung', () => {
    merkeFehler(MC, [1])
    renderApp('/')
    expect(screen.getByRole('link', { name: /Wiederholen \(1 Frage\)/ })).toHaveAttribute('href', '/wiederholen')
  })
})
