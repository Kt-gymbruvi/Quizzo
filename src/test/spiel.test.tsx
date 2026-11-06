import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import type { LehrkraftZustand, SchuelerZustand } from '../lib/spiel.ts'
import { eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

function renderApp(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )
}

const TEILNAHME = { spiel_id: 's1', spieler_id: 'p1', token: 't1', spitzname: 'Fuchs' }

function schueler(teil: Partial<SchuelerZustand>): SchuelerZustand {
  return {
    status: 'lobby',
    frage_nr: -1,
    anzahl_fragen: 3,
    spitzname: 'Fuchs',
    punkte: 0,
    platz: 1,
    anzahl_spieler: 2,
    frage: null,
    restzeit_ms: null,
    meine_antwort: null,
    richtige_antwort: null,
    ...teil,
  }
}

const FRAGE = { text: 'Hauptstadt von Frankreich?', antworten: ['Lyon', 'Paris', 'Nizza'], zeitlimit: 20 }

/** rpc-Attrappe: liefert je nach Funktionsname ein Ergebnis. */
function rpcAntworten(antworten: Record<string, unknown>) {
  fakeSupabase.rpc.mockImplementation(async (name: string) => {
    const a = antworten[name]
    if (a instanceof Error) return { data: null, error: { message: a.message } }
    return { data: a ?? null, error: null }
  })
}

describe('Mitspielen (Schüler)', () => {
  beforeEach(() => sessionStorage.clear())

  it('übernimmt die PIN aus dem QR-Code-Link', async () => {
    renderApp('/mitspielen?pin=123456')
    expect(screen.getByPlaceholderText('123456')).toHaveValue('123456')
  })

  it('prüft die PIN, bevor sie gesendet wird', async () => {
    renderApp('/mitspielen')
    await userEvent.type(screen.getByPlaceholderText('123456'), '12ab3')
    expect(screen.getByPlaceholderText('123456')).toHaveValue('123')
    await userEvent.type(screen.getByPlaceholderText('z. B. Schlauer Fuchs'), 'Fuchs')
    await userEvent.click(screen.getByRole('button', { name: 'Los geht’s!' }))
    expect(screen.getByRole('alert')).toHaveTextContent('6 Ziffern')
    expect(fakeSupabase.rpc).not.toHaveBeenCalled()
  })

  it('zeigt Fehler des Servers auf Deutsch (z. B. vergebener Spitzname)', async () => {
    rpcAntworten({ spiel_beitreten: new Error('QUIZZO: Dieser Spitzname ist schon vergeben.') })
    renderApp('/mitspielen?pin=123456')
    await userEvent.type(screen.getByPlaceholderText('z. B. Schlauer Fuchs'), 'Fuchs')
    await userEvent.click(screen.getByRole('button', { name: 'Los geht’s!' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dieser Spitzname ist schon vergeben.')
  })

  it('tritt bei und wartet in der Lobby', async () => {
    rpcAntworten({ spiel_beitreten: TEILNAHME, spiel_zustand_schueler: schueler({}) })
    renderApp('/mitspielen?pin=123456')
    await userEvent.type(screen.getByPlaceholderText('z. B. Schlauer Fuchs'), 'Fuchs')
    await userEvent.click(screen.getByRole('button', { name: 'Los geht’s!' }))
    expect(await screen.findByText('Du bist dabei!')).toBeInTheDocument()
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_beitreten', { p_pin: '123456', p_spitzname: 'Fuchs' })
  })

  it('zeigt Antwortknöpfe und sendet die gewählte Antwort', async () => {
    sessionStorage.setItem('quizzo-teilnahme', JSON.stringify(TEILNAHME))
    rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'frage', frage_nr: 0, frage: FRAGE, restzeit_ms: 15000 }), antwort_abgeben: { ok: true } })
    renderApp('/mitspielen')
    await userEvent.click(await screen.findByRole('button', { name: /Paris/ }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('antwort_abgeben', { p_spieler: 'p1', p_token: 't1', p_frage_nr: 0, p_antwort: 1 })
    expect(await screen.findByText('Antwort gesendet!')).toBeInTheDocument()
  })

  it('zeigt nach der Auflösung richtig/falsch und den Platz', async () => {
    sessionStorage.setItem('quizzo-teilnahme', JSON.stringify(TEILNAHME))
    rpcAntworten({
      spiel_zustand_schueler: schueler({ status: 'auswertung', frage_nr: 0, frage: FRAGE, meine_antwort: { antwort: 0, richtig: false, punkte: 0 }, richtige_antwort: 1, punkte: 850, platz: 2 }),
    })
    renderApp('/mitspielen')
    expect(await screen.findByText('Leider falsch')).toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getByText(/850 Punkte · Platz 2 von 2/)).toBeInTheDocument()
  })

  it('zeigt den Endstand auch dann noch, wenn die Lehrkraft das Spiel gelöscht hat', async () => {
    sessionStorage.setItem('quizzo-teilnahme', JSON.stringify(TEILNAHME))
    rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'ende', platz: 1, punkte: 2400 }) })
    const { unmount } = renderApp('/mitspielen')
    expect(await screen.findByText('Platz 1')).toBeInTheDocument()
    unmount()
    rpcAntworten({ spiel_zustand_schueler: null })
    renderApp('/mitspielen')
    expect(await screen.findByText(/beendet oder du wurdest entfernt/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Neues Spiel beitreten' }))
    expect(sessionStorage.getItem('quizzo-teilnahme')).toBeNull()
  })
})

function lehrkraftZustand(teil: Partial<LehrkraftZustand>): LehrkraftZustand {
  return {
    id: 's1',
    pin: '482913',
    status: 'lobby',
    frage_nr: -1,
    anzahl_fragen: 2,
    quiz_titel: 'Erdkunde',
    frage: null,
    restzeit_ms: null,
    spieler: [],
    verteilung: [],
    beantwortet: 0,
    ...teil,
  }
}

describe('Spiel leiten (Lehrkraft)', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('zeigt in der Lobby PIN und Mitspielende; Start erst mit Spielern', async () => {
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraftZustand({}) })
    const { unmount } = renderApp('/leiten/spiel/s1')
    expect(await screen.findByLabelText('Spiel-PIN')).toHaveTextContent('482913')
    expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeDisabled()
    unmount()

    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraftZustand({ spieler: [{ id: 'p1', spitzname: 'Fuchs', punkte: 0 }] }), spiel_steuern: null })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByRole('button', { name: 'Fuchs' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Spiel starten' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_steuern', { p_spiel: 's1', p_aktion: 'weiter' })
  })

  it('löst automatisch auf, wenn alle geantwortet haben', async () => {
    rpcAntworten({
      spiel_zustand_lehrkraft: lehrkraftZustand({
        status: 'frage',
        frage_nr: 0,
        frage: { ...FRAGE, richtig: 1 },
        restzeit_ms: 15000,
        spieler: [{ id: 'p1', spitzname: 'Fuchs', punkte: 900 }],
        beantwortet: 1,
        verteilung: [0, 1, 0],
      }),
      spiel_steuern: null,
    })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByText('Hauptstadt von Frankreich?')).toBeInTheDocument()
    await vi.waitFor(() => expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_steuern', { p_spiel: 's1', p_aktion: 'aufloesen' }))
  })

  it('zeigt bei der Auswertung die richtige Antwort und die Bestenliste', async () => {
    rpcAntworten({
      spiel_zustand_lehrkraft: lehrkraftZustand({
        status: 'auswertung',
        frage_nr: 1,
        frage: { ...FRAGE, richtig: 1 },
        spieler: [
          { id: 'p1', spitzname: 'Fuchs', punkte: 1800 },
          { id: 'p2', spitzname: 'Eule', punkte: 900 },
        ],
        verteilung: [1, 1, 0],
      }),
    })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByLabelText('richtige Antwort')).toBeInTheDocument()
    expect(screen.getByText('Bestenliste')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Endergebnis zeigen' })).toBeInTheDocument()
  })

  it('Spiel beenden löscht das Spiel nach Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    rpcAntworten({ spiel_zustand_lehrkraft: lehrkraftZustand({ status: 'ende', spieler: [{ id: 'p1', spitzname: 'Fuchs', punkte: 1800 }] }) })
    renderApp('/leiten/spiel/s1')
    await userEvent.click(await screen.findByRole('button', { name: 'Spiel beenden und Daten löschen' }))
    expect(fakeSupabase.from).toHaveBeenCalledWith('spiele')
    expect(await screen.findByText('Spiel beendet. Alle Spieldaten wurden gelöscht.')).toBeInTheDocument()
  })
})
