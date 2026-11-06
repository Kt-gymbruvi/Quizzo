import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import { antwortAlsText, ergebnisCsv, gemerkteAufgabe, type AufgabeErgebnis, type AufgabeInfo, type AufgabeZustand } from '../lib/aufgaben.ts'
import type { SchuelerFrage } from '../lib/spiel.ts'
import { ladeUebungen } from '../lib/wiederholung.ts'
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

const MC: SchuelerFrage = { typ: 'auswahl', text: 'Hauptstadt von Frankreich?', zeitlimit: 0, punkte: 1, ansicht: { antworten: ['Lyon', 'Paris', 'Nizza'], mehrfach: false } }
const WF: SchuelerFrage = { typ: 'wahrfalsch', text: 'Wale sind Fische.', zeitlimit: 0, punkte: 1, ansicht: {} }
const FOLIE: SchuelerFrage = { typ: 'folie', text: 'Kurze Info', zeitlimit: 0, punkte: 0, ansicht: { text: 'Gleich geht es los.' } }

const info = (teil: Partial<AufgabeInfo>): AufgabeInfo => ({
  code: 'ABC234',
  modus: 'selbstlernen',
  titel: 'Erdkunde',
  frist: null,
  offen: true,
  anzahl_fragen: 2,
  fragen: null,
  ...teil,
})
const zustand = (teil: Partial<AufgabeZustand>): AufgabeZustand => ({
  code: 'ABC234',
  modus: 'hausaufgabe',
  titel: 'Erdkunde',
  frist: '2026-11-13T22:59:00Z',
  offen: true,
  name: 'Fuchs',
  abgegeben: false,
  punkte: 0,
  fragen: [MC, WF],
  antworten: [],
  ...teil,
})

describe('Aufgaben: Lehrkraft', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('verteilt ein Quiz als Hausaufgabe mit Frist', async () => {
    rpcAntworten({ aufgaben_liste: [], aufgabe_erstellen: { id: 'a1', code: 'ABC234' }, aufgabe_ergebnisse: null })
    fakeSupabase.from.mockImplementation(() =>
      abfrage({ data: [{ id: 'q1', titel: 'Erdkunde', geaendert_am: '2026-11-06T10:00:00Z', fragen: [{ count: 3 }] }], error: null }),
    )
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: 'Erdkunde als Aufgabe verteilen' }))
    expect(screen.getByText('Als Aufgabe verteilen')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Hausaufgabe' }))
    expect(screen.getByText(/7 Tage nach der Frist automatisch gelöscht/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aufgabe erstellen' }))
    const aufruf = fakeSupabase.rpc.mock.calls.find(([n]) => n === 'aufgabe_erstellen')!
    expect(aufruf[1]).toMatchObject({ p_quiz_id: 'q1', p_modus: 'hausaufgabe', p_codes: null })
    const frist = new Date(aufruf[1].p_frist as string).getTime()
    expect(frist).toBeGreaterThan(Date.now() + 6 * 86400_000)
    expect(frist).toBeLessThan(Date.now() + 8 * 86400_000)
  })

  it('Prüfung: Anzahl der Codes wird mitgeschickt, Selbstlernen ohne Frist', async () => {
    rpcAntworten({ aufgaben_liste: [], aufgabe_erstellen: { id: 'a1', code: 'ABC234' } })
    fakeSupabase.from.mockImplementation(() =>
      abfrage({ data: [{ id: 'q1', titel: 'Erdkunde', geaendert_am: '2026-11-06T10:00:00Z', fragen: [{ count: 3 }] }], error: null }),
    )
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: 'Erdkunde als Aufgabe verteilen' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Prüfung' }))
    expect(screen.getByText(/Datenschutzbeauftragten/)).toBeInTheDocument()
    const anzahl = screen.getByRole('spinbutton', { name: 'Anzahl Prüfungscodes' })
    await userEvent.clear(anzahl)
    await userEvent.type(anzahl, '24')
    await userEvent.click(screen.getByRole('button', { name: 'Aufgabe erstellen' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('aufgabe_erstellen', expect.objectContaining({ p_modus: 'pruefung', p_codes: 24 }))
  })

  const ergebnis: AufgabeErgebnis = {
    id: 'a1',
    code: 'ABC234',
    modus: 'hausaufgabe',
    titel: 'Erdkunde',
    erstellt_am: '2026-11-06T10:00:00Z',
    frist: '2026-11-13T22:59:00Z',
    loeschen_am: '2026-11-20T22:59:00Z',
    offen: true,
    geschlossen: false,
    fragen: [
      { typ: 'auswahl', text: 'Hauptstadt?', inhalt: { antworten: ['Lyon', 'Paris'], richtig: [1] }, punkte: 1 },
      { typ: 'offen', text: 'Was hast du gelernt?', inhalt: {}, punkte: 0 },
    ],
    statistik: [],
    teilnehmer: [
      {
        id: 't1', spitzname: 'Fuchs', code: null, punkte: 1000, aktiv: true, begonnen_am: '2026-11-06T11:00:00Z', abgegeben_am: '2026-11-06T11:05:00Z',
        antworten: [{ frage_nr: 0, antwort: [1], anteil: 1, punkte: 1000 }, { frage_nr: 1, antwort: 'Viel; "wirklich"', anteil: 0, punkte: 0 }],
      },
      { id: 't2', spitzname: 'Igel', code: null, punkte: 0, aktiv: true, begonnen_am: '2026-11-06T11:00:00Z', abgegeben_am: null, antworten: [{ frage_nr: 0, antwort: [0], anteil: 0, punkte: 0 }] },
    ],
  }

  it('zeigt Code, Löschdatum und die Ergebnisse der Hausaufgabe', async () => {
    rpcAntworten({ aufgabe_ergebnisse: ergebnis })
    renderApp('/leiten/aufgabe/a1')
    expect(await screen.findByLabelText('Aufgaben-Code')).toHaveTextContent('ABC234')
    expect(screen.getByText(/am 20. November 2026 automatisch gelöscht/)).toBeInTheDocument()
    expect(screen.getByText('Ergebnisse · 1 von 2 abgegeben')).toBeInTheDocument()
    const zeile = screen.getByRole('button', { name: 'Fuchs' }).closest('tr')!
    expect(within(zeile).getByTitle('richtig')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fuchs' }))
    expect(screen.getByText('Viel; "wirklich"')).toBeInTheDocument()
  })

  it('Prüfung: Codeliste zum Drucken, Code freigeben', async () => {
    const p: AufgabeErgebnis = {
      ...ergebnis,
      modus: 'pruefung',
      teilnehmer: [
        { id: 't1', spitzname: null, code: 'K7F-2QM', punkte: 0, aktiv: true, begonnen_am: '2026-11-06T11:00:00Z', abgegeben_am: null, antworten: [] },
        { id: 't2', spitzname: null, code: 'XY3-ABC', punkte: 0, aktiv: false, begonnen_am: null, abgegeben_am: null, antworten: [] },
      ],
    }
    rpcAntworten({ aufgabe_ergebnisse: p })
    renderApp('/leiten/aufgabe/a1')
    expect(await screen.findByRole('heading', { name: 'Prüfungscodes' })).toBeInTheDocument()
    expect(screen.getAllByText('XY3-ABC').length).toBeGreaterThan(0)
    expect(screen.getByText('nicht benutzt')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Freigeben' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('pruefung_code_freigeben', { p_teilnehmer: 't1' })
  })

  it('CSV-Export mit Punkten und Antworten', () => {
    const csv = ergebnisCsv(ergebnis)
    const zeilen = csv.replace('﻿', '').split('\r\n')
    expect(zeilen[0]).toBe('Spitzname;Punkte;von;Prozent;abgegeben;F1: Hauptstadt?;F2: Was hast du gelernt?')
    expect(zeilen[1]).toBe('Fuchs;1000;1000;100;ja;100 % (Paris);"Viel; ""wirklich"""')
    expect(zeilen[2]).toBe('Igel;0;1000;0;nein;0 % (Lyon);')
    expect(antwortAlsText({ typ: 'wahrfalsch', text: '', inhalt: {}, punkte: 1 }, false)).toBe('Falsch')
  })
})

describe('Aufgaben: Schüler am Handy', () => {
  beforeEach(() => setzeFakeZurueck())

  it('Selbstlernen: anonym, mit Lösung nach jeder Frage', async () => {
    rpcAntworten({
      aufgabe_oeffnen: info({ fragen: [FOLIE, MC, WF] }),
      aufgabe_antworten: (a: Record<string, unknown>) => (a.p_frage_nr === 1 ? { anteil: 0, loesung: [1] } : { anteil: 1, loesung: false }),
    })
    renderApp('/aufgabe/abc234')
    expect(await screen.findByText('Gleich geht es los.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.getByText('Frage 1 von 2 · ohne Zeitdruck')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Lyon/ }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('aufgabe_antworten', { p_code: 'ABC234', p_teilnehmer: null, p_token: null, p_frage_nr: 1, p_antwort: [0] })
    expect(await screen.findByText('Leider falsch')).toBeInTheDocument()
    expect(screen.getByText(/Richtig ist:/)).toHaveTextContent('Paris')
    expect(ladeUebungen()).toHaveLength(1) // für die Wiederholung gemerkt (nur auf dem Gerät)
    await userEvent.click(screen.getByRole('button', { name: 'Nächste Frage' }))
    await userEvent.click(screen.getByRole('button', { name: 'Falsch' }))
    expect(await screen.findByText('Richtig!')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    expect(screen.getByText('1 von 2 richtig')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nochmal üben' })).toBeInTheDocument()
  })

  it('Hausaufgabe: mit Spitznamen, Punkte, danach abgegeben; das Handy merkt sich die Anmeldung', async () => {
    let antworten: AufgabeZustand['antworten'] = []
    rpcAntworten({
      aufgabe_oeffnen: info({ modus: 'hausaufgabe', frist: '2026-11-13T22:59:00Z' }),
      aufgabe_beitreten: { teilnehmer_id: 't1', token: 'geheim', name: 'Fuchs' },
      aufgabe_zustand: () => zustand({ antworten }),
      aufgabe_antworten: (a: Record<string, unknown>) => {
        antworten = [...antworten, { frage_nr: a.p_frage_nr as number }]
        return { anteil: 1, punkte: 1000, loesung: [1], abgegeben: antworten.length === 2 }
      },
    })
    renderApp('/aufgabe/ABC234')
    await userEvent.type(await screen.findByLabelText('Spitzname'), 'Fuchs')
    await userEvent.click(screen.getByRole('button', { name: 'Los geht’s!' }))
    expect(gemerkteAufgabe('ABC234')).toEqual({ teilnehmer_id: 't1', token: 'geheim', name: 'Fuchs' })
    await userEvent.click(await screen.findByRole('button', { name: /Paris/ }))
    expect(await screen.findByText('+1000 Punkte')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nächste Frage' }))
    await userEvent.click(screen.getByRole('button', { name: 'Richtig' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Fertig' }))
    expect(screen.getByText('Abgegeben!')).toBeInTheDocument()
    expect(screen.getByText('2000 Punkte')).toBeInTheDocument()
  })

  it('Hausaufgabe: beim Wiederkommen geht es bei der ersten offenen Frage weiter', async () => {
    localStorage.setItem('quizzo-aufgaben', JSON.stringify({ ABC234: { teilnehmer_id: 't1', token: 'geheim', name: 'Fuchs', gemerkt: Date.now() } }))
    rpcAntworten({
      aufgabe_oeffnen: info({ modus: 'hausaufgabe' }),
      aufgabe_zustand: zustand({ punkte: 1000, antworten: [{ frage_nr: 0, anteil: 1, punkte: 1000, loesung: [1] }] }),
    })
    renderApp('/aufgabe/ABC234')
    expect(await screen.findByText('Frage 2 von 2 · ohne Zeitdruck')).toBeInTheDocument()
    expect(screen.getByText('Wale sind Fische.')).toBeInTheDocument()
    expect(screen.getByText(/1000 Punkte/)).toBeInTheDocument()
  })

  it('Prüfung: mit Code vom Zettel, ohne Lösung und ohne Wiederholung', async () => {
    rpcAntworten({
      aufgabe_oeffnen: info({ modus: 'pruefung', frist: '2026-11-06T12:00:00Z' }),
      aufgabe_beitreten: { teilnehmer_id: 't1', token: 'geheim', name: 'K7F-2QM' },
      aufgabe_zustand: zustand({ modus: 'pruefung', name: 'K7F-2QM', punkte: null }),
      aufgabe_antworten: { ok: true },
    })
    renderApp('/aufgabe/ABC234')
    await userEvent.type(await screen.findByLabelText('Dein Prüfungscode (vom Zettel)'), 'k7f2qm')
    await userEvent.click(screen.getByRole('button', { name: 'Los geht’s!' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('aufgabe_beitreten', { p_code: 'ABC234', p_name: 'K7F2QM' })
    await userEvent.click(await screen.findByRole('button', { name: /Lyon/ }))
    // direkt weiter zur nächsten Frage, keine Rückmeldung
    expect(await screen.findByText('Wale sind Fische.')).toBeInTheDocument()
    expect(screen.queryByText(/Richtig ist/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Falsch' }))
    expect(await screen.findByText('Abgegeben!')).toBeInTheDocument()
    expect(ladeUebungen()).toEqual([])
  })

  it('beendete Aufgabe und unbekannter Code', async () => {
    rpcAntworten({ aufgabe_oeffnen: info({ modus: 'hausaufgabe', offen: false }) })
    const { unmount } = renderApp('/aufgabe/ABC234')
    expect(await screen.findByText('Diese Aufgabe ist beendet.')).toBeInTheDocument()
    unmount()
    rpcAntworten({ aufgabe_oeffnen: new Error('QUIZZO: Diese Aufgabe gibt es nicht (mehr). Bitte prüfe den Code.') })
    renderApp('/aufgabe/ZZZZZZ')
    expect(await screen.findByText(/gibt es nicht/)).toBeInTheDocument()
  })

  it('vom Mitspielen-Bildschirm zur Code-Eingabe', async () => {
    renderApp('/mitspielen')
    await userEvent.click(screen.getByRole('link', { name: /Aufgaben-Code/ }))
    await userEvent.type(screen.getByLabelText('Aufgaben-Code'), 'abc-234')
    expect(screen.getByLabelText('Aufgaben-Code')).toHaveValue('ABC234')
  })
})
