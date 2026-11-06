import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import type { LehrkraftFrage, LehrkraftZustand, SchuelerFrage, SchuelerZustand } from '../lib/spiel.ts'
import { eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

function renderApp(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )
}

const TEILNAHME = { spiel_id: 's1', spieler_id: 'p1', token: 't1', spitzname: 'Fuchs' }
/** So, wie die App eine Teilnahme auf dem Gerät merkt */
const merkeTestTeilnahme = (extra: Record<string, unknown> = {}) =>
  localStorage.setItem('quizzo-teilnahme', JSON.stringify({ ...TEILNAHME, pin: '123456', gemerkt: Date.now(), ...extra }))

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
    loesung: null,
    ...teil,
  }
}

const MC: SchuelerFrage = { typ: 'auswahl', text: 'Hauptstadt von Frankreich?', zeitlimit: 20, punkte: 1, ansicht: { antworten: ['Lyon', 'Paris', 'Nizza'], mehrfach: false } }

/** rpc-Attrappe: liefert je nach Funktionsname ein Ergebnis. */
function rpcAntworten(antworten: Record<string, unknown>) {
  fakeSupabase.rpc.mockImplementation(async (name: string) => {
    const a = antworten[name]
    if (a instanceof Error) return { data: null, error: { message: a.message } }
    return { data: a ?? null, error: null }
  })
}

/** Rendert die Schüleransicht während einer laufenden Frage. */
function frageAufHandy(frage: SchuelerFrage) {
  merkeTestTeilnahme()
  rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'frage', frage_nr: 0, frage, restzeit_ms: 15000 }), antwort_abgeben: { ok: true } })
  renderApp('/mitspielen')
}
const gesendet = (antwort: unknown) =>
  expect(fakeSupabase.rpc).toHaveBeenCalledWith('antwort_abgeben', { p_spieler: 'p1', p_token: 't1', p_frage_nr: 0, p_antwort: antwort })

describe('Mitspielen (Schüler)', () => {
  beforeEach(() => localStorage.clear())

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

  it('Multiple Choice (eine richtig): Antippen sendet sofort', async () => {
    frageAufHandy(MC)
    await userEvent.click(await screen.findByRole('button', { name: /Paris/ }))
    gesendet([1])
    expect(await screen.findByText('Antwort gesendet!')).toBeInTheDocument()
  })

  it('Multiple Choice (mehrere richtig): auswählen, dann senden', async () => {
    frageAufHandy({ ...MC, ansicht: { antworten: ['a', 'b', 'c'], mehrfach: true } })
    expect(await screen.findByText('Wähle alle richtigen Antworten!')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /c$/ }))
    await userEvent.click(screen.getByRole('button', { name: /a$/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    gesendet([0, 2])
  })

  it('Richtig/Falsch sendet true oder false', async () => {
    frageAufHandy({ ...MC, typ: 'wahrfalsch', ansicht: {} })
    await userEvent.click(await screen.findByRole('button', { name: 'Falsch' }))
    gesendet(false)
  })

  it('Freitext sendet den eingetippten Text', async () => {
    frageAufHandy({ ...MC, typ: 'freitext', ansicht: { max_zeichen: 40 } })
    await userEvent.type(await screen.findByLabelText('Antwort'), '  Paris ')
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    gesendet('Paris')
  })

  it('Sortieren: Reihenfolge mit Pfeilen ändern und senden', async () => {
    frageAufHandy({ ...MC, typ: 'reihenfolge', ansicht: { elemente: ['zwei', 'eins', 'drei'] } })
    await userEvent.click(await screen.findByRole('button', { name: 'eins nach oben' }))
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    gesendet(['eins', 'zwei', 'drei'])
  })

  it('Zuordnung: erst senden, wenn alles eindeutig zugeordnet ist', async () => {
    frageAufHandy({ ...MC, typ: 'zuordnung', ansicht: { links: ['Hund', 'Katze'], rechts: ['miaut', 'bellt'] } })
    const senden = await screen.findByRole('button', { name: 'Antwort senden' })
    expect(senden).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Gegenstück zu Hund'), 'bellt')
    await userEvent.selectOptions(screen.getByLabelText('Gegenstück zu Katze'), 'bellt')
    expect(screen.getByText('Jedes Gegenstück passt nur einmal.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Gegenstück zu Katze'), 'miaut')
    await userEvent.click(senden)
    gesendet(['bellt', 'miaut'])
  })

  it('Schieberegler: Zahl einstellen und senden', async () => {
    frageAufHandy({ ...MC, typ: 'schieberegler', ansicht: { min: 0, max: 10, schritt: 1, einheit: 'kg' } })
    await userEvent.click(await screen.findByRole('button', { name: 'größer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    gesendet(6)
  })

  it('Präsentationsfolie: nichts zu beantworten', async () => {
    merkeTestTeilnahme()
    rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'frage', frage_nr: 0, frage: { ...MC, typ: 'folie', ansicht: { text: 'Info' } } }) })
    renderApp('/mitspielen')
    expect(await screen.findByText('Schau nach vorne!')).toBeInTheDocument()
  })

  it('zeigt nach der Auflösung richtig/falsch, die Lösung und den Platz', async () => {
    merkeTestTeilnahme()
    rpcAntworten({
      spiel_zustand_schueler: schueler({ status: 'auswertung', frage_nr: 0, frage: MC, meine_antwort: { antwort: [0], richtig: false, anteil: 0, punkte: 0 }, loesung: [1], punkte: 850, platz: 2 }),
    })
    renderApp('/mitspielen')
    expect(await screen.findByText('Leider falsch')).toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getByText(/850 Punkte · Platz 2 von 2/)).toBeInTheDocument()
  })

  it('Zuordnung mit Teilpunkten: „Teilweise richtig“', async () => {
    merkeTestTeilnahme()
    const frage: SchuelerFrage = { ...MC, typ: 'zuordnung', ansicht: { links: ['a', 'b', 'c', 'd'], rechts: [] } }
    rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'auswertung', frage, meine_antwort: { antwort: [], richtig: false, anteil: 0.5, punkte: 420 }, loesung: [] }) })
    renderApp('/mitspielen')
    expect(await screen.findByText('Teilweise richtig')).toBeInTheDocument()
    expect(screen.getByText('+420')).toBeInTheDocument()
    expect(screen.getByText('2 von 4 Paaren richtig')).toBeInTheDocument()
  })

  it('Umfrage: kein richtig/falsch, keine Punkte', async () => {
    merkeTestTeilnahme()
    rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'auswertung', frage: { ...MC, typ: 'umfrage' }, meine_antwort: { antwort: [0], richtig: false, anteil: 0, punkte: 0 } }) })
    renderApp('/mitspielen')
    expect(await screen.findByText('Danke für deine Antwort!')).toBeInTheDocument()
    expect(screen.queryByText(/Platz/)).not.toBeInTheDocument()
  })

  it('zeigt den Endstand auch dann noch, wenn die Lehrkraft das Spiel gelöscht hat', async () => {
    merkeTestTeilnahme()
    rpcAntworten({ spiel_zustand_schueler: schueler({ status: 'ende', platz: 1, punkte: 2400 }) })
    const { unmount } = renderApp('/mitspielen')
    expect(await screen.findByText('Platz 1')).toBeInTheDocument()
    unmount()
    // Beim nächsten Öffnen gibt es das Spiel nicht mehr: still zurück zum Beitreten
    rpcAntworten({ spiel_zustand_schueler: null })
    renderApp('/mitspielen')
    expect(await screen.findByRole('button', { name: 'Los geht’s!' })).toBeInTheDocument()
    expect(localStorage.getItem('quizzo-teilnahme')).toBeNull()
  })

  it('wer während des Spiels entfernt wird, sieht einen Hinweis', async () => {
    merkeTestTeilnahme()
    let zustand: SchuelerZustand | null = schueler({})
    fakeSupabase.rpc.mockImplementation(async () => ({ data: zustand, error: null }))
    renderApp('/mitspielen')
    expect(await screen.findByText('Du bist dabei!')).toBeInTheDocument()
    zustand = null
    expect(await screen.findByText(/beendet oder du wurdest entfernt/, {}, { timeout: 3000 })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Neues Spiel beitreten' }))
    expect(localStorage.getItem('quizzo-teilnahme')).toBeNull()
  })
})

describe('Wieder einsteigen', () => {
  beforeEach(() => localStorage.clear())

  it('merkt die Teilnahme auf dem Gerät (auch nach Schließen des Tabs)', async () => {
    rpcAntworten({ spiel_beitreten: TEILNAHME, spiel_zustand_schueler: schueler({}) })
    renderApp('/mitspielen?pin=123456')
    await userEvent.type(screen.getByPlaceholderText(/Schlauer Fuchs/), 'Fuchs')
    await userEvent.click(screen.getByRole('button', { name: 'Los geht’s!' }))
    expect(await screen.findByText('Du bist dabei!')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('quizzo-teilnahme')!)).toMatchObject({ spieler_id: 'p1', token: 't1', pin: '123456' })
  })

  it('der QR-Link desselben Spiels führt direkt zurück ins Spiel', async () => {
    merkeTestTeilnahme()
    rpcAntworten({ spiel_zustand_schueler: schueler({}) })
    renderApp('/mitspielen?pin=123456')
    expect(await screen.findByText('Du bist dabei!')).toBeInTheDocument()
  })

  it('der Link eines anderen Spiels zeigt das Beitreten-Formular', () => {
    merkeTestTeilnahme()
    renderApp('/mitspielen?pin=654321')
    expect(screen.getByPlaceholderText('123456')).toHaveValue('654321')
    expect(localStorage.getItem('quizzo-teilnahme')).toBeNull()
  })

  it('alte Teilnahmen (über 6 Stunden) werden verworfen', () => {
    merkeTestTeilnahme({ gemerkt: Date.now() - 7 * 60 * 60 * 1000 })
    renderApp('/mitspielen')
    expect(screen.getByRole('button', { name: 'Los geht’s!' })).toBeInTheDocument()
  })

  it('die Startseite bietet „Zurück ins Spiel“ an', async () => {
    merkeTestTeilnahme()
    rpcAntworten({ spiel_zustand_schueler: schueler({}) })
    renderApp('/')
    await userEvent.click(screen.getByRole('link', { name: /Zurück ins Spiel/ }))
    expect(await screen.findByText('Du bist dabei!')).toBeInTheDocument()
  })
})

const MC_L: LehrkraftFrage = {
  typ: 'auswahl',
  text: 'Hauptstadt von Frankreich?',
  zeitlimit: 20,
  punkte: 1,
  inhalt: { antworten: ['Lyon', 'Paris', 'Nizza'], richtig: [1] },
  ansicht: { antworten: ['Lyon', 'Paris', 'Nizza'], mehrfach: false },
}

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
    antworten: [],
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
        frage: MC_L,
        restzeit_ms: 15000,
        spieler: [{ id: 'p1', spitzname: 'Fuchs', punkte: 900 }],
        beantwortet: 1,
        antworten: [{ antwort: [1], anteil: 1, punkte: 900 }],
      }),
      spiel_steuern: null,
    })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByText('Hauptstadt von Frankreich?')).toBeInTheDocument()
    await vi.waitFor(() => expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_steuern', { p_spiel: 's1', p_aktion: 'aufloesen' }))
  })

  it('Präsentationsfolie: kein Countdown, „Weiter“ statt „Auflösen“, kein automatisches Auflösen', async () => {
    rpcAntworten({
      spiel_zustand_lehrkraft: lehrkraftZustand({
        status: 'frage',
        frage_nr: 0,
        frage: { typ: 'folie', text: 'Pause', zeitlimit: 20, punkte: 0, inhalt: { text: 'Gleich geht es weiter.' }, ansicht: { text: 'Gleich geht es weiter.' } },
        spieler: [{ id: 'p1', spitzname: 'Fuchs', punkte: 0 }],
      }),
      spiel_steuern: null,
    })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByText('Gleich geht es weiter.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Auflösen' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('spiel_steuern', { p_spiel: 's1', p_aktion: 'weiter' })
    expect(fakeSupabase.rpc).not.toHaveBeenCalledWith('spiel_steuern', { p_spiel: 's1', p_aktion: 'aufloesen' })
  })

  it('zeigt bei der Auswertung die richtige Antwort und die Bestenliste', async () => {
    rpcAntworten({
      spiel_zustand_lehrkraft: lehrkraftZustand({
        status: 'auswertung',
        frage_nr: 1,
        frage: MC_L,
        spieler: [
          { id: 'p1', spitzname: 'Fuchs', punkte: 1800 },
          { id: 'p2', spitzname: 'Eule', punkte: 900 },
        ],
        antworten: [
          { antwort: [1], anteil: 1, punkte: 900 },
          { antwort: [0], anteil: 0, punkte: 0 },
        ],
      }),
    })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByLabelText('richtige Antwort')).toBeInTheDocument()
    expect(screen.getByText('Bestenliste')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Endergebnis zeigen' })).toBeInTheDocument()
  })

  it('Wortwolke: häufige Wörter erscheinen einmal; Antippen blendet aus; keine Bestenliste', async () => {
    rpcAntworten({
      spiel_zustand_lehrkraft: lehrkraftZustand({
        status: 'auswertung',
        frage_nr: 0,
        frage: { typ: 'wortwolke', text: 'Lieblingsfach?', zeitlimit: 30, punkte: 0, inhalt: {}, ansicht: {} },
        antworten: ['Mathe', 'mathe ', 'Kunst', 'Doofwort'].map((antwort) => ({ antwort, anteil: 0, punkte: 0 })),
      }),
    })
    renderApp('/leiten/spiel/s1')
    const wolke = await screen.findByLabelText('Wortwolke')
    expect(wolke.querySelectorAll('li')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Doofwort' }))
    expect(screen.queryByRole('button', { name: 'Doofwort' })).not.toBeInTheDocument()
    expect(screen.queryByText('Bestenliste')).not.toBeInTheDocument()
  })

  it('Freitext-Auswertung zeigt die akzeptierten Lösungen und die Antworten', async () => {
    rpcAntworten({
      spiel_zustand_lehrkraft: lehrkraftZustand({
        status: 'auswertung',
        frage_nr: 0,
        frage: { typ: 'freitext', text: 'Hauptstadt?', zeitlimit: 30, punkte: 1, inhalt: { loesungen: ['Berlin', 'BER'] }, ansicht: { max_zeichen: 40 } },
        antworten: [
          { antwort: 'berlin', anteil: 1, punkte: 900 },
          { antwort: 'Bonn', anteil: 0, punkte: 0 },
        ],
      }),
    })
    renderApp('/leiten/spiel/s1')
    expect(await screen.findByText('Berlin / BER')).toBeInTheDocument()
    expect(screen.getByText(/1 von 2 richtig/)).toBeInTheDocument()
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
