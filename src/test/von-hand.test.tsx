import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import { ergebnisCsv, hoechstpunkte, type AufgabeErgebnis, type AufgabeZustand } from '../lib/aufgaben.ts'
import { bereinigeFrage, importiereQuiz, mitPunkten, neueFrage, offenMaxZeichen, type Frage } from '../lib/fragetypen.ts'
import type { SchuelerFrage } from '../lib/spiel.ts'
import { eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

// Etappe 18: offene Antworten (und Freitext) in Hausaufgabe/Prüfung von Hand bewerten

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
    return { data: typeof a === 'function' ? (a as (x: Record<string, unknown>) => unknown)(args) : (a ?? null), error: null }
  })
}

describe('Offene Frage: Format', () => {
  it('„von Hand“ bringt Punkte (mindestens normal), sonst bleibt sie ohne Punkte', () => {
    const offen = { ...neueFrage('offen'), text: 'Warum?' } as Frage
    expect(bereinigeFrage(offen)).toMatchObject({ punkte: 0, inhalt: {} })
    const mit = bereinigeFrage({ ...offen, inhalt: { von_hand: true, lang: true } } as Frage)
    expect(mit).toMatchObject({ punkte: 1, inhalt: { von_hand: true, lang: true } })
    expect(bereinigeFrage({ ...offen, punkte: 2, inhalt: { von_hand: true, lang: false } } as Frage)).toMatchObject({ punkte: 2, inhalt: { von_hand: true } })
    expect(mitPunkten(mit)).toBe(true)
    expect(mitPunkten(offen)).toBe(false)
    expect(offenMaxZeichen({ lang: true })).toBe(1000)
    expect(offenMaxZeichen({})).toBe(250)
    expect(hoechstpunkte({ typ: 'offen', text: '', inhalt: { von_hand: true }, punkte: 2 })).toBe(2000)
    expect(hoechstpunkte({ typ: 'offen', text: '', inhalt: {}, punkte: 0 })).toBe(0)
  })

  it('Import übernimmt „lang“ und „von_hand“', () => {
    const { fragen } = importiereQuiz(
      JSON.stringify({ titel: 'X', fragen: [{ typ: 'offen', text: 'Erkläre!', punkte: 2, von_hand: true, lang: true }, { typ: 'offen', text: 'Meinung?', punkte: 2 }] }),
    )
    expect(fragen[0]).toMatchObject({ punkte: 2, inhalt: { von_hand: true, lang: true } })
    expect(fragen[1]).toMatchObject({ punkte: 0, inhalt: {} })
  })
})

describe('Offene Frage im Editor', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('„von Hand bewerten“ zeigt die Punkte-Auswahl und wird gespeichert', async () => {
    renderApp('/leiten/quiz/neu')
    await userEvent.type(await screen.findByLabelText('Titel des Quiz'), 'Bio')
    await userEvent.selectOptions(screen.getByLabelText('Fragetyp 1'), 'offen')
    await userEvent.type(screen.getByLabelText('Fragetext 1'), 'Erkläre die Fotosynthese.')
    expect(screen.queryByLabelText('Punkte Frage 1')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Von Hand bewerten Frage 1'))
    await userEvent.click(screen.getByLabelText('Lange Antworten Frage 1'))
    expect(screen.getByText(/bis 1000 Zeichen\)\. Im Live-Spiel/)).toBeInTheDocument()
    const punkte = screen.getByLabelText('Punkte Frage 1')
    expect(within(punkte).queryByRole('option', { name: 'keine' })).not.toBeInTheDocument()
    await userEvent.selectOptions(punkte, 'doppelt')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith(
      'quiz_speichern',
      expect.objectContaining({ p_fragen: [expect.objectContaining({ typ: 'offen', punkte: 2, inhalt: { lang: true, von_hand: true } })] }),
    )
  })
})

const ergebnis = (teil: Partial<AufgabeErgebnis> = {}): AufgabeErgebnis => ({
  id: 'a1',
  code: 'ABC234',
  modus: 'pruefung',
  titel: 'Bio',
  erstellt_am: '2026-11-06T10:00:00Z',
  frist: '2026-11-13T22:59:00Z',
  loeschen_am: '2026-12-06T10:00:00Z',
  offen: true,
  geschlossen: false,
  fragen: [
    { typ: 'offen', text: 'Erkläre die Fotosynthese.', inhalt: { von_hand: true }, punkte: 2 },
    { typ: 'freitext', text: 'Hauptstadt von Italien?', inhalt: { loesungen: ['Rom'] }, punkte: 1 },
    { typ: 'offen', text: 'Wie fandest du das?', inhalt: {}, punkte: 0 },
  ],
  statistik: [],
  teilnehmer: [
    {
      id: 't1', spitzname: null, code: 'K7F-2QM', punkte: 0, aktiv: true, begonnen_am: '2026-11-06T11:00:00Z', abgegeben_am: '2026-11-06T11:05:00Z',
      antworten: [
        { frage_nr: 0, antwort: 'Licht wird zu Zucker', anteil: 0, punkte: 0, von_hand: false },
        { frage_nr: 1, antwort: 'Roma', anteil: 0, punkte: 0 },
        { frage_nr: 2, antwort: 'Gut', anteil: 0, punkte: 0 },
      ],
    },
  ],
  ...teil,
})

describe('Von Hand bewerten (Lehrkraft)', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('zeigt wartende Antworten und bewertet mit ✗ / ½ / ✓', async () => {
    rpcAntworten({ aufgabe_ergebnisse: ergebnis(), aufgabe_bewerten: { anteil: 0.5, punkte: 1000 } })
    renderApp('/leiten/aufgabe/a1')
    expect(await screen.findByText(/1 offene Antwort wartet auf deine Bewertung/)).toBeInTheDocument()
    expect(screen.getAllByText('/ 3000', { exact: false }).length).toBeGreaterThan(0) // 2000 + 1000 Höchstpunkte
    const zeile = screen.getAllByRole('button', { name: 'K7F-2QM' })[0].closest('tr')!
    expect(within(zeile).getByTitle('noch nicht bewertet')).toHaveTextContent('?')

    await userEvent.click(screen.getAllByRole('button', { name: 'K7F-2QM' })[0])
    // offene Frage ohne Bewertung: keine Knöpfe
    expect(screen.queryByRole('group', { name: 'Frage 3 bewerten' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Frage 1: halb richtig' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('aufgabe_bewerten', { p_teilnehmer: 't1', p_frage_nr: 0, p_anteil: 0.5 })
    // Freitext: Tippfehler gelten lassen
    await userEvent.click(screen.getByRole('button', { name: 'Frage 2: richtig' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('aufgabe_bewerten', { p_teilnehmer: 't1', p_frage_nr: 1, p_anteil: 1 })
    // nach jeder Bewertung werden die Ergebnisse neu geladen
    expect(fakeSupabase.rpc.mock.calls.filter(([n]) => n === 'aufgabe_ergebnisse').length).toBeGreaterThanOrEqual(3)
  })

  it('bewertete Antworten: Zeichen, Hervorhebung, kein Hinweis mehr; CSV', async () => {
    const e = ergebnis()
    e.teilnehmer[0].punkte = 1000
    e.teilnehmer[0].antworten[0] = { frage_nr: 0, antwort: 'Licht wird zu Zucker', anteil: 0.5, punkte: 1000, von_hand: true }
    rpcAntworten({ aufgabe_ergebnisse: e })
    renderApp('/leiten/aufgabe/a1')
    await userEvent.click((await screen.findAllByRole('button', { name: 'K7F-2QM' }))[0])
    expect(screen.queryByText(/wartet auf deine Bewertung/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Frage 1: halb richtig' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('(von dir bewertet)')).toBeInTheDocument()

    const csv = ergebnisCsv(e).replace('﻿', '').split('\r\n')
    expect(csv[1]).toBe('K7F-2QM;1000;3000;33;ja;50 % (Licht wird zu Zucker);0 % (Roma);Gut')
    const offen = ergebnisCsv(ergebnis()).replace('﻿', '').split('\r\n')
    expect(offen[1]).toContain(';nicht bewertet (Licht wird zu Zucker);')
  })
})

describe('Von Hand bewerten (Schüler)', () => {
  beforeEach(() => setzeFakeZurueck())

  it('Hausaufgabe: lange Antwort, Hinweis „Deine Lehrkraft bewertet sie“', async () => {
    const OFFEN: SchuelerFrage = { typ: 'offen', text: 'Erkläre die Fotosynthese.', zeitlimit: 0, punkte: 2, ansicht: { max_zeichen: 1000, von_hand: true } }
    const zustand: AufgabeZustand = {
      code: 'ABC234', modus: 'hausaufgabe', titel: 'Bio', frist: '2026-11-13T22:59:00Z', offen: true, name: 'Fuchs', abgegeben: false, punkte: 0,
      fragen: [OFFEN], antworten: [],
    }
    localStorage.setItem('quizzo-aufgaben', JSON.stringify({ ABC234: { teilnehmer_id: 't1', token: 'geheim', name: 'Fuchs', gemerkt: Date.now() } }))
    rpcAntworten({
      aufgabe_oeffnen: { code: 'ABC234', modus: 'hausaufgabe', titel: 'Bio', frist: zustand.frist, offen: true, anzahl_fragen: 1, fragen: null },
      aufgabe_zustand: zustand,
      aufgabe_antworten: { anteil: 0, punkte: 0, abgegeben: true, loesung: null },
    })
    renderApp('/aufgabe/ABC234')
    const feld = await screen.findByLabelText('Antwort')
    expect(feld).toHaveAttribute('maxLength', '1000')
    await userEvent.type(feld, 'Licht wird zu Zucker')
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    expect(await screen.findByText('Deine Antwort ist gespeichert. Deine Lehrkraft bewertet sie.')).toBeInTheDocument()
  })
})
