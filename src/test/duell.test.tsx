import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import App from '../App.tsx'
import { bereinigeFrage, exportiereQuiz, importiereQuiz, type Frage } from '../lib/fragetypen.ts'
import { alsAdresse, alsBeamerFrage, ausAdresse, loesungZeilen, neuerStand, punkte, rangliste, schliesseFeld, waehleFragen } from '../lib/duell.ts'
import { abfrage, eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

const mc = (text: string, richtig = 1): Frage => ({ typ: 'auswahl', text, zeitlimit: 20, punkte: 1, inhalt: { antworten: ['Lyon', 'Paris', 'Nizza'], richtig: [richtig] } })
const wf = (text: string): Frage => ({ typ: 'wahrfalsch', text, zeitlimit: 10, punkte: 1, inhalt: { richtig: false } })
const umfrage: Frage = { typ: 'umfrage', text: 'Wie fandest du das?', zeitlimit: 20, punkte: 0, inhalt: { antworten: ['gut', 'schlecht'] } }
const folie: Frage = { typ: 'folie', text: 'Pause', zeitlimit: 20, punkte: 0, inhalt: { text: '' } }

describe('Klassen-Duell: Logik', () => {
  it('nimmt nur Fragen mit Lösung, der Reihe nach oder zufällig', () => {
    const fragen = [folie, mc('A'), umfrage, wf('B'), mc('C'), mc('D'), mc('E'), mc('F')]
    expect(waehleFragen(fragen, 3, false)).toEqual([1, 3, 4])
    const zufall = waehleFragen(fragen, 5, true, () => 0)
    expect(zufall).toHaveLength(5)
    expect(zufall.every((i) => ![0, 2].includes(i))).toBe(true)
    expect(waehleFragen([folie, umfrage], 5, false)).toEqual([])
  })

  it('ordnet nach Schwierigkeit: leicht auf 100, schwer auf 500, ohne Angabe = mittel', () => {
    const s = (f: Frage, schwierigkeit: 1 | 2 | 3) => ({ ...f, schwierigkeit })
    const fragen = [s(mc('schwer'), 3), mc('ohne'), s(mc('leicht'), 1), s(wf('mittel'), 2), s(mc('leicht 2'), 1)]
    expect(waehleFragen(fragen, 5, false).map((i) => fragen[i].text)).toEqual(['leicht', 'leicht 2', 'ohne', 'mittel', 'schwer'])
    // erst auswählen (die ersten 3), dann sortieren
    expect(waehleFragen(fragen, 3, false).map((i) => fragen[i].text)).toEqual(['leicht', 'ohne', 'schwer'])
  })

  it('Schwierigkeit übersteht Export und Import, ungültige Angaben fallen weg', () => {
    const mitS: Frage = { ...mc('x'), schwierigkeit: 3 }
    const datei = exportiereQuiz('T', [mitS, mc('y')])
    expect(datei.fragen[0]).toMatchObject({ schwierigkeit: 'schwer' })
    expect(datei.fragen[1]).not.toHaveProperty('schwierigkeit')
    const zurueck = importiereQuiz(JSON.stringify({ ...datei, fragen: [...datei.fragen, { ...datei.fragen[1], schwierigkeit: 'sehr schwer' }, { ...datei.fragen[1], schwierigkeit: 1 }] }))
    expect(zurueck.fragen.map((f) => f.schwierigkeit ?? null)).toEqual([3, null, null, 1])
    expect(bereinigeFrage({ ...umfrage, schwierigkeit: 3 })).not.toHaveProperty('schwierigkeit') // Umfrage hat keine Lösung
  })

  it('Adresse hin und zurück, ungültige Angaben werden abgefangen', () => {
    const e = { quizIds: [ID1, ID2], teams: 3, zeilen: 4, zufall: true, abzug: false }
    expect(ausAdresse(new URLSearchParams(alsAdresse(e).split('?')[1]))).toEqual(e)
    expect(ausAdresse(new URLSearchParams(`q=${ID1}`))).toBeNull() // nur eine Kategorie
    expect(ausAdresse(new URLSearchParams(`q=${ID1},${ID2}&t=9&z=1`))).toMatchObject({ teams: 2, zeilen: 5 })
  })

  it('Punkte, Felder und Rangliste mit Gleichstand', () => {
    let s = neuerStand('x', [[0, 1]], ['Team Blau', 'Team Rot', 'Team Grün'])
    s = schliesseFeld(punkte(s, 1, 200), '0-1', 1)
    s = punkte(s, 0, -100)
    s = punkte(s, 2, 200)
    expect(s.teams.map((t) => t.punkte)).toEqual([-100, 200, 200])
    expect(s.felder).toEqual({ '0-1': 1 })
    expect(rangliste(s).map((t) => [t.name, t.platz])).toEqual([
      ['Team Rot', 1],
      ['Team Grün', 1],
      ['Team Blau', 3],
    ])
  })

  it('Lösungstexte und Beamer-Ansicht', () => {
    expect(loesungZeilen(mc('x', 2))).toEqual(['Nizza'])
    expect(loesungZeilen(wf('x'))).toEqual(['Falsch'])
    expect(loesungZeilen({ typ: 'schieberegler', text: 'Mauerfall?', zeitlimit: 20, punkte: 1, inhalt: { min: 1900, max: 2025, schritt: 1, richtig: 1989, toleranz: 2 } })).toEqual([
      '1989 (± 2 zählt noch)',
    ])
    const z = alsBeamerFrage({ typ: 'zuordnung', text: 'x', zeitlimit: 20, punkte: 1, inhalt: { paare: [{ links: 'A', rechts: '1' }, { links: 'B', rechts: '2' }] } }, () => 0)
    expect(z.ansicht.links).toEqual(['A', 'B'])
    expect([...(z.ansicht.rechts ?? [])].sort()).toEqual(['1', '2'])
  })
})

// ---------- Oberfläche ----------
const QUIZZE: Record<string, { titel: string; fragen: (Frage & { position: number })[] }> = {
  [ID1]: { titel: 'Erdkunde', fragen: [mc('Hauptstadt von Frankreich?'), wf('Der Rhein fließt durch Paris.'), mc('Größte Stadt?', 0)].map((f, i) => ({ ...f, position: i })) },
  [ID2]: { titel: 'Biologie', fragen: [folie, mc('Wie viele Herzkammern?'), wf('Wale sind Fische.')].map((f, i) => ({ ...f, position: i })) },
}

/** from('quizze'): Liste (ohne eq) oder ein Quiz (eq('id', …).single()) */
function fakeQuizze() {
  fakeSupabase.from.mockImplementation(() => {
    let id: string | null = null
    const kette = abfrage(null)
    kette.eq = vi.fn((_spalte: string, wert: string) => ((id = wert), kette))
    kette.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) =>
      Promise.resolve(
        id
          ? { data: QUIZZE[id], error: null }
          : {
              data: Object.entries(QUIZZE).map(([qid, q], i) => ({ id: qid, titel: q.titel, geaendert_am: `2026-11-0${5 - i}T10:00:00Z`, ordner: null, zuletzt_benutzt: null, fragen: [{ count: q.fragen.length }] })),
              error: null,
            },
      ).then(ok, nok)
    return kette
  })
}

function Adresse() {
  const l = useLocation()
  return <p data-testid="adresse">{l.pathname + l.search}</p>
}
function renderApp(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
      <Routes>
        <Route path="*" element={<Adresse />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Klassen-Duell: Oberfläche', () => {
  beforeEach(() => {
    setzeFakeZurueck(eingeloggteSession())
    localStorage.clear()
    fakeSupabase.rpc.mockResolvedValue({ data: [], error: null })
    fakeQuizze()
  })

  it('Quizze abhaken, einrichten und starten', async () => {
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: '🏆 Klassen-Duell' }))
    const weiter = screen.getByRole('button', { name: 'Weiter' })
    expect(weiter).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Biologie fürs Klassen-Duell wählen' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Erdkunde fürs Klassen-Duell wählen' }))
    expect(screen.getByRole('checkbox', { name: 'Biologie fürs Klassen-Duell wählen' })).toHaveTextContent('1')
    expect(screen.getByText('🏆 2 Quizze gewählt')).toBeInTheDocument()
    await userEvent.click(weiter)
    const dialog = screen.getByRole('dialog', { name: '🏆 Klassen-Duell einrichten' })
    expect(within(dialog).getByRole('list', { name: 'Kategorien' })).toHaveTextContent('1. Biologie2. Erdkunde')
    await userEvent.click(within(dialog).getByRole('button', { name: '3 Teams' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '3 Fragen pro Kategorie' }))
    await userEvent.click(within(dialog).getByLabelText(/Falsche Antworten kosten Punkte/))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duell starten' }))
    expect(screen.getByTestId('adresse')).toHaveTextContent(`/leiten/duell?q=${ID2}%2C${ID1}&t=3&z=3&r=0&a=1`)
  })

  it('Brett: Feld öffnen, Lösung zeigen, Punkte vergeben – Stand bleibt nach dem Neuladen', async () => {
    const adresse = alsAdresse({ quizIds: [ID1, ID2], teams: 2, zeilen: 3, zufall: false, abzug: true })
    const { unmount } = renderApp(adresse)
    expect(await screen.findByRole('heading', { name: 'Erdkunde' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Biologie' })).toBeInTheDocument()
    // Biologie hat nur 2 passende Fragen (Folie zählt nicht)
    expect(screen.getAllByRole('button', { name: /^Biologie für/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^Erdkunde für/ })).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: 'Erdkunde für 200' }))
    expect(screen.getByRole('heading', { name: 'Der Rhein fließt durch Paris.' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Lösung zeigen' }))
    expect(screen.getByRole('status')).toHaveTextContent('Falsch')
    // Team Blau liegt falsch (−200), Team Rot richtig (+200)
    await userEvent.click(screen.getByRole('button', { name: 'Team Blau falsch, minus 200' }))
    expect(screen.getByRole('button', { name: '✓ Team Blau +200' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '✓ Team Rot +200' }))

    const stand = screen.getByRole('list', { name: 'Punktestand' })
    expect(stand).toHaveTextContent('Team Blau-200')
    expect(stand).toHaveTextContent('Team Rot200')
    expect(screen.getByLabelText('Erdkunde, 200: Team Rot')).toBeInTheDocument()

    // Neu laden: Spielstand kommt vom Gerät
    unmount()
    renderApp(adresse)
    expect(await screen.findByLabelText('Erdkunde, 200: Team Rot')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Punktestand' })).toHaveTextContent('Team Rot200')

    // Rückgängig gibt es nach dem Neuladen nicht mehr; „Niemand“ schließt ein Feld ohne Punkte
    await userEvent.click(screen.getByRole('button', { name: 'Biologie für 100' }))
    await userEvent.click(screen.getByRole('button', { name: 'Niemand' }))
    expect(screen.getByLabelText('Biologie, 100: niemand')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '↶ Rückgängig' }))
    expect(screen.getByRole('button', { name: 'Biologie für 100' })).toBeInTheDocument()
  })

  it('Endstand nach dem letzten Feld', async () => {
    renderApp(alsAdresse({ quizIds: [ID1, ID2], teams: 2, zeilen: 3, zufall: false, abzug: false }))
    await screen.findByRole('heading', { name: 'Erdkunde' })
    for (const name of ['Erdkunde für 100', 'Erdkunde für 200', 'Erdkunde für 300', 'Biologie für 100', 'Biologie für 200']) {
      await userEvent.click(screen.getByRole('button', { name }))
      await userEvent.click(screen.getByRole('button', { name: name.endsWith('300') ? '✓ Team Blau +300' : 'Niemand' }))
    }
    expect(screen.getByRole('heading', { name: 'Team Blau gewinnt!' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neues Duell, gleiche Kategorien' })).toBeInTheDocument()
  })

  it('unvollständige Adresse', async () => {
    renderApp(`/leiten/duell?q=${ID1}`)
    expect(await screen.findByText(/Dieses Duell ist unvollständig/)).toBeInTheDocument()
  })
})
