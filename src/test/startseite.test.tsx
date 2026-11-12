import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'

function renderApp(pfad = '/') {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Startseite', () => {
  it('zeigt Titel und beide Knöpfe', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: 'Quizzo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quiz leiten' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mitspielen' })).toBeInTheDocument()
  })

  it('führt von der Startseite und von der Anmeldung zurück zur Plattform-Startseite „Lehrraum“', async () => {
    const { unmount } = renderApp()
    expect(screen.getByRole('link', { name: 'Zur Startseite Lehrraum' })).toHaveAttribute('href', 'https://kt-gymbruvi.github.io/')
    unmount()
    renderApp('/leiten')
    expect(await screen.findByRole('link', { name: 'Zur Startseite Lehrraum' })).toHaveAttribute('href', 'https://kt-gymbruvi.github.io/')
  })

  it('zeigt einen Verbindungsstatus an', async () => {
    renderApp()
    expect(
      await screen.findByText(/Server noch nicht eingerichtet|Verbunden|Keine Verbindung/),
    ).toBeInTheDocument()
  })

  it('Knopf Quiz leiten führt zur Anmeldung für Lehrkräfte', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('link', { name: 'Quiz leiten' }))
    expect(await screen.findByRole('heading', { name: 'Anmelden für Lehrkräfte' })).toBeInTheDocument()
  })

  it('Knopf Mitspielen führt zur Schüler-Seite', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('link', { name: 'Mitspielen' }))
    expect(screen.getByRole('heading', { name: 'Mitspielen' })).toBeInTheDocument()
  })
})
