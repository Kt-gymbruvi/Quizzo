import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import { abfrage, eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

function renderApp(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Anmeldung', () => {
  it('zeigt nicht angemeldeten Besuchern das Anmeldeformular', async () => {
    renderApp('/leiten')
    expect(await screen.findByRole('heading', { name: 'Anmelden für Lehrkräfte' })).toBeInTheDocument()
    expect(screen.queryByText(/registrieren/i)).not.toBeInTheDocument()
  })

  it('schützt auch den Quiz-Editor', async () => {
    renderApp('/leiten/quiz/neu')
    expect(await screen.findByRole('heading', { name: 'Anmelden für Lehrkräfte' })).toBeInTheDocument()
  })

  it('meldet mit E-Mail und Passwort an', async () => {
    renderApp('/leiten')
    await userEvent.type(await screen.findByLabelText('E-Mail-Adresse'), ' lehrer@schule.test ')
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim123')
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(fakeSupabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'lehrer@schule.test', password: 'geheim123' })
  })

  it('zeigt bei falschem Passwort eine deutsche Fehlermeldung', async () => {
    fakeSupabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    renderApp('/leiten')
    await userEvent.type(await screen.findByLabelText('E-Mail-Adresse'), 'a@b.de')
    await userEvent.type(screen.getByLabelText('Passwort'), 'falsch')
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-Mail-Adresse oder Passwort ist falsch.')
  })
})

describe('Passwort festlegen', () => {
  it('löst einen Einladungslink ein', async () => {
    renderApp('/passwort?token_hash=abc&type=invite')
    await screen.findByText('Einen Moment …')
    expect(fakeSupabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'invite' })
  })

  it('prüft Länge und Wiederholung des neuen Passworts', async () => {
    setzeFakeZurueck(eingeloggteSession())
    renderApp('/passwort')
    await userEvent.type(await screen.findByLabelText('Neues Passwort'), 'kurz')
    await userEvent.type(screen.getByLabelText('Passwort wiederholen'), 'kurz')
    await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('mindestens 8 Zeichen')
    expect(fakeSupabase.auth.updateUser).not.toHaveBeenCalled()
  })
})

describe('Quizze verwalten (angemeldet)', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('zeigt die eigenen Quizze mit Anzahl der Fragen', async () => {
    fakeSupabase.from.mockImplementation(() =>
      abfrage({ data: [{ id: 'q1', titel: 'Bruchrechnung', geaendert_am: '2026-11-06T10:00:00Z', fragen: [{ count: 3 }] }], error: null }),
    )
    renderApp('/leiten')
    expect(await screen.findByRole('heading', { name: 'Bruchrechnung' })).toBeInTheDocument()
    expect(screen.getByText(/3 Fragen/)).toBeInTheDocument()
  })

  it('zeigt einen Hinweis, wenn es noch keine Quizze gibt', async () => {
    renderApp('/leiten')
    expect(await screen.findByText('Noch keine Quizze')).toBeInTheDocument()
  })

  it('speichert kein unvollständiges Quiz', async () => {
    renderApp('/leiten/quiz/neu')
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte gib dem Quiz einen Titel.')
    expect(fakeSupabase.rpc).not.toHaveBeenCalled()
  })

  it('speichert ein neues Quiz mit bereinigten Antworten', async () => {
    renderApp('/leiten/quiz/neu')
    await userEvent.type(await screen.findByLabelText('Titel des Quiz'), 'Hauptstädte')
    await userEvent.type(screen.getByLabelText('Fragetext 1'), 'Hauptstadt von Frankreich?')
    await userEvent.type(screen.getByLabelText('Frage 1 Antwort A'), 'Lyon')
    await userEvent.type(screen.getByLabelText('Frage 1 Antwort C'), 'Paris')
    await userEvent.click(screen.getByRole('button', { name: 'Frage 1: Antwort C ist richtig' }))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('quiz_speichern', {
      p_id: null,
      p_titel: 'Hauptstädte',
      p_fragen: [{ text: 'Hauptstadt von Frankreich?', antworten: ['Lyon', 'Paris'], richtig: 1, zeitlimit: 20 }],
    })
  })
})
