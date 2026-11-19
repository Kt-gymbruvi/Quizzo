import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import type { LehrkraftZustand, SchuelerZustand } from '../lib/spiel.ts'
import { medailleFuer, naechsteMedaille } from '../spiel/KlassenBalken.tsx'
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

const MC = {
  typ: 'auswahl' as const,
  text: 'Hauptstadt von Frankreich?',
  zeitlimit: 20,
  punkte: 1 as const,
  inhalt: { antworten: ['Lyon', 'Paris'], richtig: [1] },
  ansicht: { antworten: ['Lyon', 'Paris'], mehrfach: false },
}

function lehrkraft(teil: Partial<LehrkraftZustand>): LehrkraftZustand {
  return {
    id: 's1',
    pin: '482913',
    status: 'lobby',
    frage_nr: -1,
    anzahl_fragen: 3,
    quiz_titel: 'Erdkunde',
    frage: null,
    restzeit_ms: null,
    spieler: [
      { id: 'p1', spitzname: 'Fuchs', punkte: 1500 },
      { id: 'p2', spitzname: 'Eule', punkte: 700 },
    ],
    antworten: [],
    beantwortet: 0,
    modus: 'challenge',
    anzahl_teams: null,
    teams: null,
    klasse: { prozent: 0, fragen: 0, letzte: null },
    ...teil,
  }
}

const schueler = (teil: Partial<SchuelerZustand>): SchuelerZustand => ({
  status: 'lobby',
  frage_nr: -1,
  anzahl_fragen: 3,
  spitzname: 'Fuchs',
  punkte: 1500,
  platz: null,
  anzahl_spieler: 2,
  frage: null,
  restzeit_ms: null,
  meine_antwort: null,
  loesung: null,
  modus: 'challenge',
  team: null,
  teams: null,
  klasse: { prozent: 0, fragen: 0, letzte: null },
  ...teil,
})

describe('Medaillen-Stufen', () => {
  it('Bronze ab 50, Silber ab 70, Gold ab 90 %', () => {
    expect(medailleFuer(49)).toBeNull()
    expect(medailleFuer(50)?.name).toBe('Bronze')
    expect(medailleFuer(70)?.name).toBe('Silber')
    expect(medailleFuer(89)?.name).toBe('Silber')
    expect(medailleFuer(90)?.name).toBe('Gold')
    expect(naechsteMedaille(10)?.name).toBe('Bronze')
    expect(naechsteMedaille(75)?.name).toBe('Gold')
    expect(naechsteMedaille(95)).toBeNull()
  })
})

describe('Klassen-Challenge starten', () => {
  beforeEach(() => {
    setzeFakeZurueck(eingeloggteSession())
    fakeSupabase.from.mockImplementation(() =>
      abfrage({ data: [{ id: 'q1', titel: 'Erdkunde', geaendert_am: '2026-11-06T10:00:00Z', fragen: [{ count: 3 }] }], error: null }),
    )
    rpcAntworten({ spiel_erstellen: { id: 's1', pin: '482913' }, spiel_zustand_lehrkraft: lehrkraft({ spieler: [] }) })
  })

  it('erstellt ein Spiel im Modus „challenge“ ohne Teams', async () => {
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: 'Erdkunde spielen' }))
    const dialog = screen.getByRole('dialog', { name: 'Wie wollt ihr spielen?' })
    await userEvent.click(within(dialog).getByRole('radio', { name: /Klassen-Challenge/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: '▶ Spiel erstellen' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_erstellen', { p_quiz_id: 'q1', p_modus: 'challenge', p_teams: null })
  })
})

describe('Klassen-Challenge am Beamer', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('Lobby erklärt die Medaillen', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({}) })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByText(/Bronze ab 50 %, Silber ab 70 %, Gold ab 90 %/)).toBeInTheDocument()
  })

  it('nach einer Frage: Klassenbalken statt Bestenliste', async () => {
    rpcAntworten({
      spiel_zustand_lehrkraft: lehrkraft({ status: 'auswertung', frage_nr: 0, frage: MC, klasse: { prozent: 62, fragen: 1, letzte: 62 } }),
    })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByRole('heading', { name: '🎯 Klassen-Challenge' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bestenliste' })).not.toBeInTheDocument()
    expect(screen.queryByText('Fuchs')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Fortschritt der Klasse' })).toHaveAttribute('aria-valuenow', '62')
    expect(screen.getByText('Diese Frage: 62 % richtig')).toBeInTheDocument()
    expect(screen.getByText('Noch 8 % bis 🥈 Silber')).toBeInTheDocument()
  })

  it('Endstand: Medaille der Klasse, kein Siegertreppchen', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({ status: 'ende', frage_nr: 2, klasse: { prozent: 74, fragen: 3, letzte: 80 } }) })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByRole('heading', { name: 'Silber für die Klasse!' })).toBeInTheDocument()
    expect(screen.getByText(/2 Mitspielende · 3 Fragen mit Wertung/)).toBeInTheDocument()
    expect(screen.queryByText('Fuchs')).not.toBeInTheDocument()
  })

  it('Endstand unter 50 %: ermutigender Hinweis', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({ status: 'ende', frage_nr: 2, klasse: { prozent: 31, fragen: 3, letzte: 20 } }) })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByRole('heading', { name: 'Geschafft!' })).toBeInTheDocument()
    expect(screen.getByText(/Beim nächsten Mal knackt ihr Bronze/)).toBeInTheDocument()
  })
})

describe('Klassen-Challenge auf dem Handy', () => {
  beforeEach(() => {
    setzeFakeZurueck()
    localStorage.setItem('quizzo-teilnahme', JSON.stringify({ spiel_id: 's1', spieler_id: 'p1', token: 't1', spitzname: 'Fuchs', pin: '482913', gemerkt: Date.now() }))
  })

  it('Lobby erklärt den gemeinsamen Modus', async () => {
    rpcAntworten({ spiel_zustand_schueler: schueler({}) })
    renderApp('/mitspielen')
    expect(await screen.findByText(/Ihr spielt alle zusammen/)).toBeInTheDocument()
  })

  it('nach der Frage: Klassenstand statt Platz', async () => {
    rpcAntworten({
      spiel_zustand_schueler: schueler({
        status: 'auswertung',
        frage_nr: 0,
        frage: MC,
        meine_antwort: { antwort: [1], richtig: true, anteil: 1, punkte: 900 },
        loesung: [1],
        klasse: { prozent: 55, fragen: 1, letzte: 55 },
      }),
    })
    renderApp('/mitspielen')
    expect(await screen.findByRole('progressbar', { name: 'Fortschritt der Klasse' })).toHaveAttribute('aria-valuenow', '55')
    expect(screen.queryByText(/Platz/)).not.toBeInTheDocument()
  })

  it('Endstand: Medaille der Klasse und eigener Beitrag', async () => {
    rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'ende', frage_nr: 2, klasse: { prozent: 93, fragen: 3, letzte: 100 } }) })
    renderApp('/mitspielen')
    expect(await screen.findByText('Gold für eure Klasse!')).toBeInTheDocument()
    expect(screen.getByText(/Du hast 1500 Punkte beigetragen/)).toBeInTheDocument()
    expect(screen.queryByText(/Platz/)).not.toBeInTheDocument()
  })
})
