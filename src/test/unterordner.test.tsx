import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import { alleOrdner, elternOrdner, liegtIn, ordnerAnzeige, ordnerPfad, umbenannt, unterordner } from '../lib/ordner.ts'
import { abfrage, eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

describe('Ordnerpfade', () => {
  it('räumt Pfade auf', () => {
    expect(ordnerPfad('  Oberstufe /  Evolution  / ')).toBe('Oberstufe/Evolution')
    expect(ordnerPfad(' /  ')).toBeNull()
    expect(ordnerPfad('Bio   9')).toBe('Bio 9')
  })
  it('kennt Eltern, Unterordner und Inhalt', () => {
    const alle = alleOrdner(['Oberstufe/Evolution/Selektion', 'Oberstufe/Genetik', 'Mathe 7b', null, 'Oberstufe'])
    expect(alle).toEqual(['Mathe 7b', 'Oberstufe', 'Oberstufe/Evolution', 'Oberstufe/Evolution/Selektion', 'Oberstufe/Genetik'])
    expect(unterordner(alle, null)).toEqual(['Mathe 7b', 'Oberstufe'])
    expect(unterordner(alle, 'Oberstufe')).toEqual(['Oberstufe/Evolution', 'Oberstufe/Genetik'])
    expect(elternOrdner('Oberstufe/Evolution')).toBe('Oberstufe')
    expect(elternOrdner('Oberstufe')).toBeNull()
    expect(liegtIn('Oberstufe/Evolution', 'Oberstufe')).toBe(true)
    expect(liegtIn('Oberstufenkurs', 'Oberstufe')).toBe(false) // nicht nur gleicher Anfang
    expect(ordnerAnzeige('Oberstufe/Evolution')).toBe('Oberstufe › Evolution')
  })
  it('Umbenennen/Verschieben nimmt Unterordner mit, Auflösen hebt eine Ebene hoch', () => {
    expect(umbenannt('Oberstufe/Evolution/Selektion', 'Oberstufe/Evolution', 'Oberstufe/Evo')).toBe('Oberstufe/Evo/Selektion')
    expect(umbenannt('Oberstufe/Evolution', 'Oberstufe/Evolution', 'Oberstufe')).toBe('Oberstufe')
    expect(umbenannt('Evolution/Selektion', 'Evolution', null)).toBe('Selektion')
    expect(umbenannt('Evolution', 'Evolution', null)).toBeNull()
    expect(umbenannt('Mathe', 'Evolution', null)).toBeUndefined()
  })
})

function renderApp(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Meine Quizze: Unterordner', () => {
  const liste = [
    { id: 'q1', titel: 'Darwin', geaendert_am: '2026-11-05T10:00:00Z', ordner: 'Oberstufe/Evolution', zuletzt_benutzt: null, fragen: [{ count: 3 }] },
    { id: 'q2', titel: 'Selektion', geaendert_am: '2026-11-04T10:00:00Z', ordner: 'Oberstufe/Evolution/Selektion', zuletzt_benutzt: null, fragen: [{ count: 3 }] },
    { id: 'q3', titel: 'Abiturvorbereitung', geaendert_am: '2026-11-03T10:00:00Z', ordner: 'Oberstufe', zuletzt_benutzt: null, fragen: [{ count: 3 }] },
    { id: 'q4', titel: 'Brüche', geaendert_am: '2026-11-02T10:00:00Z', ordner: 'Mathe 7b', zuletzt_benutzt: null, fragen: [{ count: 3 }] },
  ]
  let ketten: { tabelle: string; kette: ReturnType<typeof abfrage> }[]
  beforeEach(() => {
    setzeFakeZurueck(eingeloggteSession())
    localStorage.clear()
    fakeSupabase.rpc.mockResolvedValue({ data: [], error: null })
    ketten = []
    fakeSupabase.from.mockImplementation((tabelle: string) => {
      const kette = abfrage({ data: liste, error: null })
      ketten.push({ tabelle, kette })
      return kette
    })
  })
  const titel = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  const updates = () => ketten.filter((k) => k.kette.update.mock.calls.length).map((k) => [k.kette.eq.mock.calls.at(-1)?.[1], k.kette.update.mock.calls[0][0].ordner])

  it('zeigt Unterordner als Kacheln, Brotkrumen und den aufgeklappten Baum', async () => {
    renderApp('/leiten')
    const baum = await screen.findByRole('navigation', { name: 'Ordner' })
    // oben nur die oberste Ebene; Anzahl zählt Unterordner mit
    expect(within(baum).getByRole('button', { name: /Oberstufe\s*3/ })).toBeInTheDocument()
    expect(within(baum).queryByRole('button', { name: /Evolution/ })).not.toBeInTheDocument()

    await userEvent.click(within(baum).getByRole('button', { name: /Oberstufe/ }))
    expect(titel()).toEqual(['Abiturvorbereitung']) // nur was direkt darin liegt
    const kacheln = screen.getByRole('list', { name: 'Unterordner' })
    await userEvent.click(within(kacheln).getByRole('button', { name: /Evolution\s*2 Quizze · 1 Unterordner/ }))

    expect(screen.getByRole('heading', { level: 2, name: 'Evolution' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Ordnerpfad' })).getByRole('button', { name: 'Oberstufe' })).toBeInTheDocument()
    expect(titel()).toEqual(['Darwin'])
    expect(within(baum).getByRole('button', { name: /Selektion\s*1/ })).toBeInTheDocument() // aufgeklappt

    // Suche im Ordner findet auch in Unterordnern
    await userEvent.type(screen.getByLabelText('Quiz suchen'), 'sel')
    expect(titel()).toEqual(['Selektion'])
  })

  it('legt ein Quiz in einen neuen Unterordner', async () => {
    renderApp('/leiten')
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Brüche' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Brüche in Ordner legen' }))
    const dialog = screen.getByRole('dialog', { name: 'In Ordner legen' })
    await userEvent.selectOptions(within(dialog).getByLabelText('Neuen Ordner anlegen in'), 'Oberstufe/Evolution')
    await userEvent.type(within(dialog).getByLabelText('Name des neuen Ordners'), 'Stammbäume')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }))
    expect(updates()).toEqual([['q4', 'Oberstufe/Evolution/Stammbäume']])
    expect(await screen.findByText('„Brüche“ liegt jetzt im Ordner „Oberstufe › Evolution › Stammbäume“.')).toBeInTheDocument()
  })

  it('Ordner umbenennen nimmt Unterordner mit', async () => {
    renderApp('/leiten')
    const baum = await screen.findByRole('navigation', { name: 'Ordner' })
    await userEvent.click(within(baum).getByRole('button', { name: /Oberstufe/ }))
    await userEvent.click(within(screen.getByRole('list', { name: 'Unterordner' })).getByRole('button', { name: /Evolution/ }))
    vi.spyOn(window, 'prompt').mockReturnValue('Evolutionsbiologie')
    await userEvent.click(screen.getByRole('button', { name: '✎ Umbenennen' }))
    expect(updates()).toEqual([
      ['q1', 'Oberstufe/Evolutionsbiologie'],
      ['q2', 'Oberstufe/Evolutionsbiologie/Selektion'],
    ])
  })

  it('Auflösen hebt den Inhalt eine Ebene hoch', async () => {
    renderApp('/leiten')
    const baum = await screen.findByRole('navigation', { name: 'Ordner' })
    await userEvent.click(within(baum).getByRole('button', { name: /Oberstufe/ }))
    await userEvent.click(within(screen.getByRole('list', { name: 'Unterordner' })).getByRole('button', { name: /Evolution/ }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Auflösen' }))
    expect(updates()).toEqual([
      ['q1', 'Oberstufe'],
      ['q2', 'Oberstufe/Selektion'],
    ])
  })

  it('Ordner samt Inhalt in einen anderen Ordner verschieben', async () => {
    renderApp('/leiten')
    const baum = await screen.findByRole('navigation', { name: 'Ordner' })
    await userEvent.click(within(baum).getByRole('button', { name: /Mathe 7b/ }))
    await userEvent.click(screen.getByRole('button', { name: '↪ Verschieben' }))
    const dialog = screen.getByRole('dialog', { name: 'Ordner verschieben' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Oberstufe' }))
    expect(updates()).toEqual([['q4', 'Oberstufe/Mathe 7b']])
  })

  it('neuer leerer Unterordner bleibt auf diesem Gerät sichtbar', async () => {
    renderApp('/leiten')
    const baum = await screen.findByRole('navigation', { name: 'Ordner' })
    await userEvent.click(within(baum).getByRole('button', { name: /Oberstufe/ }))
    vi.spyOn(window, 'prompt').mockReturnValue('Ökologie')
    await userEvent.click(screen.getByRole('button', { name: '+ Unterordner' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Ökologie' })).toBeInTheDocument()
    expect(within(baum).getByRole('button', { name: /Ökologie\s*0/ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('quizzo-quizliste')!).leer).toEqual(['Oberstufe/Ökologie'])
  })
})
