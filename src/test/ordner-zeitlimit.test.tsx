import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import type { AufgabeInfo, AufgabeZustand } from '../lib/aufgaben.ts'
import type { SchuelerFrage } from '../lib/spiel.ts'
import { abfrage, eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

function renderApp(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )
}
type Antwort = unknown | ((args: Record<string, unknown>) => unknown)
function rpcAntworten(antworten: Record<string, Antwort>) {
  fakeSupabase.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    const a = antworten[name]
    if (a instanceof Error) return { data: null, error: { message: a.message } }
    return { data: typeof a === 'function' ? (a as (x: Record<string, unknown>) => unknown)(args) : (a ?? null), error: null }
  })
}

const quiz = (id: string, titel: string, ordner: string | null, geaendert = '2026-11-06T10:00:00Z', benutzt: string | null = null) => ({
  id,
  titel,
  geaendert_am: geaendert,
  ordner,
  zuletzt_benutzt: benutzt,
  fragen: [{ count: 3 }],
})

describe('Meine Quizze: Ordner, Suche, Sortierung', () => {
  beforeEach(() => {
    setzeFakeZurueck(eingeloggteSession())
    localStorage.clear()
    rpcAntworten({ aufgaben_liste: [] })
  })

  const liste = [
    quiz('q1', 'Bruchrechnung', 'Mathe 7b', '2026-11-01T10:00:00Z', '2026-11-06T09:00:00Z'),
    quiz('q2', 'Prozentrechnung', 'Mathe 7b', '2026-11-05T10:00:00Z'),
    quiz('q3', 'Zellbiologie', 'Bio 9', '2026-11-03T10:00:00Z'),
    quiz('q4', 'Ankommen', null, '2026-11-02T10:00:00Z'),
  ]
  const titel = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

  it('zeigt Ordner mit Anzahl und filtert nach Ordner und Suchbegriff', async () => {
    fakeSupabase.from.mockImplementation(() => abfrage({ data: liste, error: null }))
    renderApp('/leiten')
    const ordner = await screen.findByRole('navigation', { name: 'Ordner' })
    expect(within(ordner).getByRole('button', { name: /Alle Quizze\s*4/ })).toBeInTheDocument()
    expect(within(ordner).getByRole('button', { name: /Bio 9\s*1/ })).toBeInTheDocument()
    expect(within(ordner).getByRole('button', { name: /Ohne Ordner\s*1/ })).toBeInTheDocument()
    // zuletzt bearbeitet zuerst
    expect(titel()).toEqual(['Prozentrechnung', 'Zellbiologie', 'Ankommen', 'Bruchrechnung'])

    await userEvent.click(within(ordner).getByRole('button', { name: /Mathe 7b/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Mathe 7b' })).toBeInTheDocument()
    expect(titel()).toEqual(['Prozentrechnung', 'Bruchrechnung'])

    await userEvent.click(within(ordner).getByRole('button', { name: /Alle Quizze/ }))
    await userEvent.type(screen.getByLabelText('Quiz suchen'), 'zell')
    expect(titel()).toEqual(['Zellbiologie'])
  })

  it('sortiert nach Name oder zuletzt gespielt und merkt sich die Wahl', async () => {
    fakeSupabase.from.mockImplementation(() => abfrage({ data: liste, error: null }))
    const { unmount } = renderApp('/leiten')
    await screen.findByRole('navigation', { name: 'Ordner' })
    await userEvent.selectOptions(screen.getByLabelText('Sortieren'), 'name')
    expect(titel()).toEqual(['Ankommen', 'Bruchrechnung', 'Prozentrechnung', 'Zellbiologie'])
    await userEvent.selectOptions(screen.getByLabelText('Sortieren'), 'benutzt')
    expect(titel()[0]).toBe('Bruchrechnung')
    unmount()
    renderApp('/leiten')
    await screen.findByRole('navigation', { name: 'Ordner' })
    expect(screen.getByLabelText('Sortieren')).toHaveValue('benutzt')
  })

  it('legt ein Quiz über das ⋯-Menü in einen neuen Ordner', async () => {
    const aufrufe: { tabelle: string; kette: ReturnType<typeof abfrage> }[] = []
    fakeSupabase.from.mockImplementation((tabelle: string) => {
      const kette = abfrage({ data: liste, error: null })
      aufrufe.push({ tabelle, kette })
      return kette
    })
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Ankommen' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ankommen in Ordner legen' }))
    const dialog = screen.getByRole('dialog', { name: 'In Ordner legen' })
    await userEvent.type(within(dialog).getByLabelText('Name des neuen Ordners'), '  Klasse   5a ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }))
    const update = aufrufe.find((a) => a.kette.update.mock.calls.length)!
    expect(update.tabelle).toBe('quizze')
    expect(update.kette.update).toHaveBeenCalledWith({ ordner: 'Klasse 5a' })
    expect(update.kette.eq).toHaveBeenCalledWith('id', 'q4')
    expect(await screen.findByText('„Ankommen“ liegt jetzt im Ordner „Klasse 5a“.')).toBeInTheDocument()
  })

  it('verteilte Aufgaben stehen in einem eigenen Reiter', async () => {
    fakeSupabase.from.mockImplementation(() => abfrage({ data: liste, error: null }))
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: '📝 Verteilte Aufgaben' }))
    expect(await screen.findByText('Noch keine verteilten Aufgaben')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Ordner' })).not.toBeInTheDocument()
  })

  it('funktioniert auch, solange die Datenbank noch keine Ordner kennt (Migration 008 fehlt)', async () => {
    let versuch = 0
    fakeSupabase.from.mockImplementation(() =>
      ++versuch === 1
        ? abfrage({ data: null, error: { message: 'column quizze.ordner does not exist' } })
        : abfrage({ data: [{ id: 'q1', titel: 'Bruchrechnung', geaendert_am: '2026-11-06T10:00:00Z', fragen: [{ count: 3 }] }], error: null }),
    )
    renderApp('/leiten')
    expect(await screen.findByRole('heading', { name: 'Bruchrechnung' })).toBeInTheDocument()
  })
})

describe('Aufgaben mit Zeitlimit', () => {
  const MC: SchuelerFrage = { typ: 'auswahl', text: 'Hauptstadt von Frankreich?', zeitlimit: 60, punkte: 1, ansicht: { antworten: ['Lyon', 'Paris', 'Nizza'], mehrfach: false } }
  const VERDECKT = { typ: 'auswahl' as const, text: '', zeitlimit: 60, punkte: 1, ansicht: {}, verdeckt: true }
  const WF_VERDECKT = { typ: 'wahrfalsch' as const, text: '', zeitlimit: 30, punkte: 1, ansicht: {}, verdeckt: true }
  const info: AufgabeInfo = { code: 'ABC234', modus: 'hausaufgabe', titel: 'Erdkunde', frist: '2026-11-13T22:59:00Z', offen: true, anzahl_fragen: 2, fragen: null }
  const zustand = (teil: Partial<AufgabeZustand>): AufgabeZustand => ({
    code: 'ABC234',
    modus: 'hausaufgabe',
    titel: 'Erdkunde',
    frist: '2026-11-13T22:59:00Z',
    offen: true,
    name: 'Fuchs',
    abgegeben: false,
    punkte: 0,
    mit_zeit: true,
    fragen: [VERDECKT, WF_VERDECKT],
    antworten: [],
    geoeffnet: [],
    ...teil,
  })

  describe('Lehrkraft', () => {
    beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

    async function dialogOeffnen() {
      rpcAntworten({ aufgaben_liste: [], aufgabe_erstellen: { id: 'a1', code: 'ABC234' } })
      fakeSupabase.from.mockImplementation(() => abfrage({ data: [quiz('q1', 'Erdkunde', null)], error: null }))
      renderApp('/leiten')
      await userEvent.click(await screen.findByRole('button', { name: 'Erdkunde als Aufgabe verteilen' }))
    }
    const erstellt = () => fakeSupabase.rpc.mock.calls.find(([n]) => n === 'aufgabe_erstellen')![1]

    it('Hausaufgabe: standardmäßig 1 Minute pro Frage', async () => {
      await dialogOeffnen()
      await userEvent.click(screen.getByRole('radio', { name: 'Hausaufgabe' }))
      expect(screen.getByText(/Jede Frage hat 1 Minute/)).toBeInTheDocument()
      await userEvent.selectOptions(screen.getByLabelText('Zeit pro Frage'), '90')
      await userEvent.click(screen.getByRole('button', { name: 'Aufgabe erstellen' }))
      expect(erstellt()).toMatchObject({ p_modus: 'hausaufgabe', p_zeit: 90 })
    })

    it('Zeiten aus dem Quiz (0) oder ohne Zeitlimit (nicht mitgeschickt); Selbstlernen nie', async () => {
      await dialogOeffnen()
      await userEvent.click(screen.getByRole('radio', { name: 'Prüfung' }))
      await userEvent.click(screen.getByRole('radio', { name: 'Zeiten aus dem Quiz' }))
      await userEvent.click(screen.getByRole('button', { name: 'Aufgabe erstellen' }))
      expect(erstellt()).toMatchObject({ p_modus: 'pruefung', p_zeit: 0 })
    })

    it('ohne Zeitlimit', async () => {
      await dialogOeffnen()
      await userEvent.click(screen.getByRole('radio', { name: 'Hausaufgabe' }))
      await userEvent.click(screen.getByRole('radio', { name: 'Ohne Zeitlimit' }))
      await userEvent.click(screen.getByRole('button', { name: 'Aufgabe erstellen' }))
      expect(erstellt()).not.toHaveProperty('p_zeit')
    })

    it('Selbstlernen hat kein Zeitlimit', async () => {
      await dialogOeffnen()
      expect(screen.queryByText('⏱ Zeitlimit pro Frage')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Aufgabe erstellen' }))
      expect(erstellt()).not.toHaveProperty('p_zeit')
    })
  })

  describe('Schüler am Handy', () => {
    beforeEach(() => {
      setzeFakeZurueck()
      localStorage.clear()
      localStorage.setItem('quizzo-aufgaben', JSON.stringify({ ABC234: { teilnehmer_id: 't1', token: 'geheim', name: 'Fuchs', gemerkt: Date.now() } }))
    })

    it('Frage erst nach „Frage öffnen“, mit Countdown', async () => {
      rpcAntworten({
        aufgabe_oeffnen: info,
        aufgabe_zustand: zustand({}),
        aufgabe_frage_oeffnen: { frage: MC, restzeit_ms: 60_000 },
        aufgabe_antworten: { anteil: 1, punkte: 1000, loesung: [1], abgegeben: false, zu_spaet: false },
      })
      renderApp('/aufgabe/ABC234')
      expect(await screen.findByText('1 Minute')).toBeInTheDocument()
      expect(screen.queryByText('Hauptstadt von Frankreich?')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Frage öffnen' }))
      expect(fakeSupabase.rpc).toHaveBeenCalledWith('aufgabe_frage_oeffnen', { p_teilnehmer: 't1', p_token: 'geheim', p_frage_nr: 0 })
      expect(await screen.findByText('Hauptstadt von Frankreich?')).toBeInTheDocument()
      expect(screen.getByLabelText('Restzeit in Sekunden')).toHaveTextContent('60')
      await userEvent.click(screen.getByRole('button', { name: /Paris/ }))
      expect(await screen.findByText('Richtig!')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Nächste Frage' }))
      // nächste Frage wieder erst nach Bestätigung
      expect(screen.getByText('30 Sekunden')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Frage öffnen' })).toBeInTheDocument()
    })

    it('nach dem Neuladen läuft die geöffnete Frage weiter; ist die Zeit um, wird „keine Antwort“ geschickt', async () => {
      rpcAntworten({
        aufgabe_oeffnen: info,
        aufgabe_zustand: zustand({ fragen: [{ ...MC }, WF_VERDECKT], geoeffnet: [{ frage_nr: 0, restzeit_ms: 0 }] }),
        aufgabe_frage_oeffnen: { frage: MC, restzeit_ms: 0 },
        aufgabe_antworten: { anteil: 0, punkte: 0, loesung: [1], abgegeben: false, zu_spaet: true },
      })
      renderApp('/aufgabe/ABC234')
      expect(await screen.findByText(/Richtig ist:/)).toHaveTextContent('Paris')
      expect(screen.getByText('⏱ Zeit abgelaufen')).toBeInTheDocument()
      expect(fakeSupabase.rpc).toHaveBeenCalledWith('aufgabe_antworten', expect.objectContaining({ p_frage_nr: 0, p_antwort: null }))
    })
  })
})
