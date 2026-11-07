import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import type { Frage } from '../lib/fragetypen.ts'
import { alsAdresse } from '../lib/duell.ts'
import { abfrage, eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const mc = (text: string): Frage => ({ typ: 'auswahl', text, zeitlimit: 20, punkte: 1, inhalt: { antworten: ['Lyon', 'Paris'], richtig: [1] } })
const QUIZZE: Record<string, { titel: string; fragen: (Frage & { position: number })[] }> = {
  [ID1]: { titel: 'Erdkunde', fragen: [mc('Hauptstadt von Frankreich?'), mc('Zweite Frage?'), mc('Dritte?')].map((f, i) => ({ ...f, position: i })) },
  [ID2]: { titel: 'Biologie', fragen: [mc('Herzkammern?'), mc('Zelle?'), mc('Blut?')].map((f, i) => ({ ...f, position: i })) },
}

/** Nachbau des Echtzeit-Kanals: Nachrichten gehen an alle anderen Teilnehmer desselben Kanals */
type Hoerer = { event: string; cb: (m: { payload: unknown }) => void }
const kanaele = new Map<string, Set<{ hoerer: Hoerer[] }>>()
function fakeKanal() {
  kanaele.clear()
  const f = fakeSupabase as unknown as Record<string, unknown>
  f.channel = (name: string) => {
    const k = {
      hoerer: [] as Hoerer[],
      on(_typ: string, filter: { event: string }, cb: Hoerer['cb']) {
        k.hoerer.push({ event: filter.event, cb })
        return k
      },
      subscribe() {
        if (!kanaele.has(name)) kanaele.set(name, new Set())
        kanaele.get(name)!.add(k)
        return k
      },
      send(m: { event: string; payload: unknown }) {
        for (const andere of kanaele.get(name) ?? []) {
          if (andere === k) continue
          andere.hoerer.filter((h) => h.event === m.event).forEach((h) => queueMicrotask(() => h.cb({ payload: m.payload })))
        }
        return Promise.resolve('ok')
      },
    }
    return k
  }
  f.removeChannel = (k: unknown) => kanaele.forEach((s) => s.delete(k as { hoerer: Hoerer[] }))
}

function fakeQuizze() {
  fakeSupabase.from.mockImplementation(() => {
    let id: string | null = null
    const kette = abfrage(null)
    kette.eq = vi.fn((_s: string, w: string) => ((id = w), kette))
    kette.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) => Promise.resolve({ data: id ? QUIZZE[id] : [], error: null }).then(ok, nok)
    return kette
  })
}

const app = (pfad: string) => (
  <MemoryRouter initialEntries={[pfad]}>
    <App />
  </MemoryRouter>
)

describe('Klassen-Duell mit Buzzer-Handys', () => {
  beforeEach(() => {
    setzeFakeZurueck(eingeloggteSession())
    localStorage.clear()
    sessionStorage.clear()
    fakeQuizze()
    fakeKanal()
  })

  it('ohne Buzzer: keine PIN am Beamer', async () => {
    render(app(alsAdresse({ quizIds: [ID1, ID2], teams: 2, zeilen: 3, zufall: false, abzug: false, buzzer: false })))
    await screen.findByRole('heading', { name: 'Erdkunde' })
    expect(screen.queryByRole('region', { name: 'Buzzer verbinden' })).not.toBeInTheDocument()
  })

  it('Team-Handy verbindet sich, buzzert zuerst und ist dran; nach „falsch“ dürfen andere', async () => {
    const lehrkraft = render(app(alsAdresse({ quizIds: [ID1, ID2], teams: 2, zeilen: 3, zufall: false, abzug: true, buzzer: true })))
    const hinweis = await screen.findByRole('region', { name: 'Buzzer verbinden' })
    const pin = within(hinweis).getByText(/^\d{6}$/).textContent!
    const beamer = within(lehrkraft.container)

    // Handy von Team Rot (eigene App-Instanz, kein Konto)
    const handyContainer = document.createElement('div')
    document.body.append(handyContainer)
    const handy = render(app(`/buzzer?pin=${pin}`), { container: handyContainer })
    const h = within(handy.container)
    expect(h.getByText('Verbinde mit dem Duell …')).toBeInTheDocument()

    // Lehrkraft öffnet ein Feld → Zustand geht an die Handys
    await userEvent.click(beamer.getByRole('button', { name: 'Erdkunde für 100' }))
    await userEvent.click(await h.findByRole('button', { name: '▲ Team Rot' }))
    expect(h.getByText('Wisst ihr es? Schnell drücken!')).toBeInTheDocument()
    expect(beamer.getByRole('status')).toHaveTextContent('Buzzer sind offen')

    await userEvent.click(h.getByRole('button', { name: 'Buzzer' }))
    await waitFor(() => expect(beamer.getByRole('status')).toHaveTextContent('Team Rot ist dran!'))
    expect(await h.findByText('Ihr seid dran! Antwortet laut.')).toBeInTheDocument()
    expect(h.getByRole('button', { name: 'Buzzer' })).toBeDisabled()

    // Falsch: Team Rot gesperrt, Buzzer wieder offen für die anderen
    await userEvent.click(beamer.getByRole('button', { name: 'Team Rot falsch, minus 100' }))
    await waitFor(() => expect(beamer.getByRole('status')).toHaveTextContent('Buzzer sind offen'))
    expect(await h.findByText('Bei dieser Frage seid ihr schon dran gewesen.')).toBeInTheDocument()
    expect(h.getByText('-100 Punkte')).toBeInTheDocument()

    // Feld schließen → Handys warten
    await userEvent.click(beamer.getByRole('button', { name: 'Niemand' }))
    expect(await h.findByText('Warten auf die nächste Frage …')).toBeInTheDocument()
    handyContainer.remove()
  })

  it('PIN-Eingabe auf dem Handy', async () => {
    render(app('/buzzer'))
    await userEvent.type(screen.getByLabelText(/Buzzer-PIN/), '12345')
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.getByRole('alert')).toHaveTextContent('6 Ziffern')
    await userEvent.type(screen.getByLabelText(/Buzzer-PIN/), '6')
    await userEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(await screen.findByText('Verbinde mit dem Duell …')).toBeInTheDocument()
  })
})
