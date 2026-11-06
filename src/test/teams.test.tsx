import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import type { LehrkraftZustand, SchuelerZustand } from '../lib/spiel.ts'
import type { TeamWertung } from '../lib/teams.ts'
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

const WERTUNG: TeamWertung = [
  { team: 2, punkte: 1400, mitglieder: 2, platz: 1 },
  { team: 1, punkte: 900, mitglieder: 3, platz: 2 },
  { team: 3, punkte: 0, mitglieder: 1, platz: 3 },
]

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
    anzahl_fragen: 2,
    quiz_titel: 'Erdkunde',
    frage: null,
    restzeit_ms: null,
    spieler: [
      { id: 'p1', spitzname: 'Fuchs', punkte: 1500, team: 2 },
      { id: 'p2', spitzname: 'Eule', punkte: 1300, team: 2 },
      { id: 'p3', spitzname: 'Dachs', punkte: 900, team: 1 },
    ],
    antworten: [],
    beantwortet: 0,
    modus: 'team',
    anzahl_teams: 3,
    teams: WERTUNG,
    ...teil,
  }
}

describe('Spielmodus wählen', () => {
  beforeEach(() => {
    setzeFakeZurueck(eingeloggteSession())
    fakeSupabase.from.mockImplementation(() =>
      abfrage({ data: [{ id: 'q1', titel: 'Erdkunde', geaendert_am: '2026-11-06T10:00:00Z', fragen: [{ count: 3 }] }], error: null }),
    )
    rpcAntworten({ spiel_erstellen: { id: 's1', pin: '482913' }, spiel_zustand_lehrkraft: lehrkraft({ modus: 'klassisch', anzahl_teams: null, teams: null, spieler: [] }) })
  })

  it('startet ein klassisches Spiel', async () => {
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: 'Erdkunde spielen' }))
    const dialog = screen.getByRole('dialog', { name: 'Wie wollt ihr spielen?' })
    await userEvent.click(within(dialog).getByRole('button', { name: '▶ Spiel erstellen' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_erstellen', { p_quiz_id: 'q1', p_modus: 'klassisch', p_teams: null })
  })

  it('startet ein Teamspiel mit der gewählten Anzahl Teams', async () => {
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: 'Erdkunde spielen' }))
    await userEvent.click(screen.getByRole('radio', { name: /Team/ }))
    await userEvent.click(screen.getByRole('radio', { name: '4' }))
    expect(screen.getByText('◆ Lila')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '▶ Spiel erstellen' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_erstellen', { p_quiz_id: 'q1', p_modus: 'team', p_teams: 4 })
  })

  it('Abbrechen schließt den Dialog ohne Spiel', async () => {
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: 'Erdkunde spielen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fakeSupabase.rpc).not.toHaveBeenCalledWith('spiel_erstellen', expect.anything())
  })
})

describe('Teamspiel am Beamer', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('Lobby zeigt die Teams; ⇄ setzt ins nächste Team', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({}) })
    renderApp('/leiten/spiel/s1')
    const rot = await screen.findByRole('region', { name: 'Team Rot' })
    expect(within(rot).getByRole('button', { name: 'Fuchs' })).toBeInTheDocument()
    expect(within(rot).getByText('(2)')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Team Grün' })).getByText('(0)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fuchs ins nächste Team' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('spieler_team_wechseln', { p_spieler: 'p1' })
  })

  it('nach einer Frage erscheint die Teamwertung statt der Bestenliste', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({ status: 'auswertung', frage_nr: 0, frage: MC }) })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByRole('heading', { name: 'Teamwertung' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bestenliste' })).not.toBeInTheDocument()
    expect(screen.getByText('1400')).toBeInTheDocument()
  })

  it('Endstand: Siegerteam und die besten Einzelnen', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({ status: 'ende', frage_nr: 1 }) })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByRole('heading', { name: 'Team Rot gewinnt!' })).toBeInTheDocument()
    expect(screen.getByText("1400 Punkte im Schnitt")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Beste Einzelne' })).toBeInTheDocument()
  })

  it('bei Gleichstand an der Spitze kein „gewinnt“', async () => {
    const gleich: TeamWertung = [
      { team: 1, punkte: 800, mitglieder: 2, platz: 1 },
      { team: 2, punkte: 800, mitglieder: 2, platz: 1 },
    ]
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraft({ status: 'ende', anzahl_teams: 2, teams: gleich }) })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByRole('heading', { name: 'Endstand' })).toBeInTheDocument()
  })
})

describe('Teamspiel auf dem Handy', () => {
  const schueler = (teil: Partial<SchuelerZustand>): SchuelerZustand => ({
    status: 'lobby',
    frage_nr: -1,
    anzahl_fragen: 2,
    spitzname: 'Fuchs',
    punkte: 1500,
    platz: 1,
    anzahl_spieler: 6,
    frage: null,
    restzeit_ms: null,
    meine_antwort: null,
    loesung: null,
    modus: 'team',
    team: 2,
    teams: WERTUNG,
    ...teil,
  })
  beforeEach(() =>
    localStorage.setItem('quizzo-teilnahme', JSON.stringify({ spiel_id: 's1', spieler_id: 'p1', token: 't1', spitzname: 'Fuchs', pin: '482913', gemerkt: Date.now() })),
  )

  it('zeigt in der Lobby das eigene Team', async () => {
    rpcAntworten({ spiel_zustand_schueler: schueler({}) })
    renderApp('/mitspielen')
    expect(await screen.findByText('Du spielst im')).toBeInTheDocument()
    expect(screen.getByText(/▲ Team Rot/)).toBeInTheDocument()
  })

  it('nach der Frage: Teamplatz und eigene Punkte', async () => {
    rpcAntworten({
      spiel_zustand_schueler: schueler({ status: 'auswertung', frage_nr: 0, frage: MC, meine_antwort: { antwort: [1], richtig: true, anteil: 1, punkte: 900 }, loesung: [1] }),
    })
    renderApp('/mitspielen')
    expect(await screen.findByText(/Team Rot: Platz 1 von 3/)).toBeInTheDocument()
    expect(screen.getByText('Du: 1500 Punkte')).toBeInTheDocument()
  })

  it('Endstand mit Teamplatz', async () => {
    rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'ende', frage_nr: 1, platz: 1 }) })
    renderApp('/mitspielen')
    expect(await screen.findByText(/Team Rot: Platz 1/)).toBeInTheDocument()
    expect(screen.getByText(/von 3 Teams · 1400 Punkte im Schnitt/)).toBeInTheDocument()
  })
})
