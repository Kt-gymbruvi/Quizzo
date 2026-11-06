import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import { exportiereQuiz, importiereQuiz, neueFrage, pruefeFrage, wechsleTyp, youtubeId, type Frage } from '../lib/fragetypen.ts'
import { leseZeit, pruefeDatei, raeumeMedienAuf, zeitText } from '../lib/medien.ts'
import { loescheQuiz } from '../lib/quizze.ts'
import type { LehrkraftZustand } from '../lib/spiel.ts'
import { SPEICHER_URL, abfrage, eingeloggteSession, fakeSpeicher, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

function renderApp(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )
}

const datei = (name: string, typ: string, groesse = 1000) => {
  const f = new File(['x'], name, { type: typ })
  Object.defineProperty(f, 'size', { value: groesse })
  return f
}
const BILD_URL = SPEICHER_URL + 'u1/bild.webp'
const mc = (medium?: Frage['medium']): Frage => ({ ...neueFrage('auswahl'), text: 'Wo liegt Paris?', inhalt: { antworten: ['A', 'B'], richtig: [0] }, ...(medium ? { medium } : {}) }) as Frage

describe('Medien: Hilfsfunktionen', () => {
  it('erkennt YouTube-Links in allen üblichen Formen', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=42',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ])
      expect(youtubeId(link), link).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://vimeo.com/123')).toBeNull()
  })

  it('liest Zeiten als Minuten:Sekunden', () => {
    expect(leseZeit('1:30')).toBe(90)
    expect(leseZeit('45')).toBe(45)
    expect(leseZeit('1:02:03')).toBe(3723)
    expect(leseZeit('')).toBeUndefined()
    expect(leseZeit('abc')).toBeNaN()
    expect(zeitText(90)).toBe('1:30')
  })

  it('prüft Dateiformat und Größe vor dem Hochladen', () => {
    expect(pruefeDatei(datei('a.png', 'image/png'), 'bild')).toBeNull()
    expect(pruefeDatei(datei('a.pdf', 'application/pdf'), 'bild')).toMatch(/Dateiformat geht leider nicht/)
    expect(pruefeDatei(datei('a.svg', 'image/svg+xml'), 'bild')).toMatch(/Dateiformat/)
    expect(pruefeDatei(datei('a.mp3', 'audio/mpeg', 16 * 1024 * 1024), 'audio')).toMatch(/höchstens 15 MB/)
    expect(pruefeDatei(datei('a.mp4', 'video/mp4', 40 * 1024 * 1024), 'video')).toBeNull()
  })

  it('prüft Medien wie die Datenbank', () => {
    expect(pruefeFrage(mc({ art: 'bild', url: BILD_URL }))).toEqual([])
    expect(pruefeFrage(mc({ art: 'bild', url: 'http://unsicher.example/a.png' }))).toContain('Die Adresse des Mediums ist ungültig (sie muss mit https:// beginnen).')
    expect(pruefeFrage(mc({ art: 'youtube', id: 'kurz' }))).toContain('Der YouTube-Link ist ungültig.')
    expect(pruefeFrage(mc({ art: 'youtube', id: 'dQw4w9WgXcQ', start: 30, ende: 10 }))).toContain('Die Endzeit muss nach der Startzeit liegen.')
  })

  it('Typwechsel behält das Medium', () => {
    const f = mc({ art: 'bild', url: BILD_URL })
    expect(wechsleTyp(f, 'umfrage').medium).toEqual({ art: 'bild', url: BILD_URL })
  })

  it('Export und Import übernehmen Medien; YouTube-Links werden erkannt', () => {
    const fragen = [mc({ art: 'bild', url: BILD_URL, pfad: 'u1/bild.webp', beschreibung: 'Karte' }), mc({ art: 'youtube', id: 'dQw4w9WgXcQ', start: 10 })]
    expect(importiereQuiz(JSON.stringify(exportiereQuiz('M', fragen))).fragen).toEqual(fragen)

    const hand = importiereQuiz(
      JSON.stringify({ titel: 'Hand', fragen: [{ ...exportiereQuiz('x', [mc()]).fragen[0], medium: { art: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', start: '5', ende: 20 } }] }),
    )
    expect(hand.fehler).toEqual([])
    expect(hand.fragen[0].medium).toEqual({ art: 'youtube', id: 'dQw4w9WgXcQ', start: 5, ende: 20 })
  })
})

describe('Medien aufräumen', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))
  const vor = (stunden: number) => new Date(Date.now() - stunden * 3600_000).toISOString()

  it('löscht nur unbenutzte Dateien: Kandidaten sofort, andere erst nach 24 Stunden', async () => {
    fakeSpeicher.list.mockResolvedValue({
      data: [
        { name: 'benutzt.webp', created_at: vor(48) },
        { name: 'ersetzt.webp', created_at: vor(1) },
        { name: 'offen-im-editor.webp', created_at: vor(1) },
        { name: 'vergessen.webp', created_at: vor(30) },
      ],
      error: null,
    })
    fakeSupabase.from.mockImplementation(() => abfrage({ data: [{ medium: { art: 'bild', url: 'x', pfad: 'u1/benutzt.webp' } }], error: null }))
    const geloescht = await raeumeMedienAuf(['u1/ersetzt.webp', 'u1/benutzt.webp'])
    expect(fakeSpeicher.list).toHaveBeenCalledWith('u1', { limit: 1000 })
    expect(geloescht).toEqual(['u1/ersetzt.webp', 'u1/vergessen.webp'])
    expect(fakeSpeicher.remove).toHaveBeenCalledWith(['u1/ersetzt.webp', 'u1/vergessen.webp'])
  })

  it('löscht nichts, wenn die Liste der verwendeten Medien nicht geladen werden kann', async () => {
    fakeSpeicher.list.mockResolvedValue({ data: [{ name: 'a.webp', created_at: vor(48) }], error: null })
    fakeSupabase.from.mockImplementation(() => abfrage({ data: null, error: { message: 'kaputt' } }))
    expect(await raeumeMedienAuf(['u1/a.webp'])).toEqual([])
    expect(fakeSpeicher.remove).not.toHaveBeenCalled()
  })

  it('beim Löschen eines Quiz verschwinden auch seine Dateien', async () => {
    let abrufe = 0
    fakeSupabase.from.mockImplementation((tabelle: string) => {
      if (tabelle !== 'fragen') return abfrage({ data: null, error: null })
      abrufe++
      // 1. Abruf: Medien des Quiz, 2. Abruf (nach dem Löschen): noch verwendete Medien
      return abfrage({ data: abrufe === 1 ? [{ medium: { art: 'bild', url: 'x', pfad: 'u1/quiz.webp' } }, { medium: null }] : [], error: null })
    })
    fakeSpeicher.list.mockResolvedValue({ data: [{ name: 'quiz.webp', created_at: vor(0) }], error: null })
    await loescheQuiz('q1')
    expect(fakeSpeicher.remove).toHaveBeenCalledWith(['u1/quiz.webp'])
  })
})

describe('Medien im Quiz-Editor', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  async function neuesQuiz() {
    renderApp('/leiten/quiz/neu')
    await userEvent.type(await screen.findByLabelText('Titel des Quiz'), 'Medien')
    await userEvent.type(screen.getByLabelText('Fragetext 1'), 'Was zeigt das?')
    await userEvent.type(screen.getByLabelText('Frage 1 Antwort A'), 'Paris')
    await userEvent.type(screen.getByLabelText('Frage 1 Antwort B'), 'Rom')
  }
  const gespeicherteFrage = () => (fakeSupabase.rpc.mock.calls.find((c) => c[0] === 'quiz_speichern')![1] as { p_fragen: Frage[] }).p_fragen[0]

  it('lädt ein Bild hoch und speichert es mit der Frage', async () => {
    await neuesQuiz()
    await userEvent.click(screen.getByRole('button', { name: '+ 🖼 Bild' }))
    fireEvent.change(screen.getByTestId('datei-1'), { target: { files: [datei('karte.png', 'image/png')] } })
    expect(await screen.findByRole('button', { name: 'Medium entfernen' })).toBeInTheDocument()
    const [pfad, , optionen] = fakeSpeicher.upload.mock.calls[0]
    expect(pfad).toMatch(/^u1\/[0-9a-f-]{36}\.png$/)
    expect(optionen).toMatchObject({ contentType: 'image/png', upsert: false })

    await userEvent.type(screen.getByPlaceholderText(/Landkarte/), 'Karte von Europa')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(gespeicherteFrage().medium).toEqual({ art: 'bild', url: SPEICHER_URL + pfad, pfad, beschreibung: 'Karte von Europa' })
  })

  it('lehnt falsche Dateiformate mit verständlicher Meldung ab', async () => {
    await neuesQuiz()
    await userEvent.click(screen.getByRole('button', { name: '+ 🖼 Bild' }))
    fireEvent.change(screen.getByTestId('datei-1'), { target: { files: [datei('brief.pdf', 'application/pdf')] } })
    expect(await screen.findByText(/Dieses Dateiformat geht leider nicht/)).toBeInTheDocument()
    expect(fakeSpeicher.upload).not.toHaveBeenCalled()
  })

  it('übernimmt einen YouTube-Link mit Ausschnitt', async () => {
    await neuesQuiz()
    await userEvent.click(screen.getByRole('button', { name: '+ ▶ YouTube-Link' }))
    await userEvent.type(screen.getByLabelText('YouTube-Link Frage 1'), 'https://youtu.be/dQw4w9WgXcQ')
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await userEvent.type(screen.getByLabelText('Startzeit Frage 1'), '0:15')
    await userEvent.type(screen.getByLabelText('Endzeit Frage 1'), '1:00')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(gespeicherteFrage().medium).toEqual({ art: 'youtube', id: 'dQw4w9WgXcQ', start: 15, ende: 60 })
  })

  it('nach dem Speichern werden ersetzte Dateien aufgeräumt', async () => {
    await neuesQuiz()
    await userEvent.click(screen.getByRole('button', { name: '+ 🖼 Bild' }))
    fireEvent.change(screen.getByTestId('datei-1'), { target: { files: [datei('alt.png', 'image/png')] } })
    await userEvent.click(await screen.findByRole('button', { name: 'Medium entfernen' }))
    const [altPfad] = fakeSpeicher.upload.mock.calls[0]
    fakeSpeicher.list.mockResolvedValue({ data: [{ name: altPfad.split('/')[1], created_at: new Date().toISOString() }], error: null })
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await vi.waitFor(() => expect(fakeSpeicher.remove).toHaveBeenCalledWith([altPfad]))
  })
})

describe('Medien am Beamer', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  const zustand = (medium: Frage['medium']): LehrkraftZustand => ({
    id: 's1',
    pin: '482913',
    status: 'frage',
    frage_nr: 0,
    anzahl_fragen: 2,
    quiz_titel: 'Erdkunde',
    frage: { ...mc(medium), ansicht: { antworten: ['A', 'B'], mehrfach: false } } as LehrkraftZustand['frage'],
    restzeit_ms: 15000,
    spieler: [{ id: 'p1', spitzname: 'Fuchs', punkte: 0 }],
    antworten: [],
    beantwortet: 0,
  })
  const zeige = (medium: Frage['medium']) => {
    fakeSupabase.rpc.mockImplementation(async (name: string) => ({ data: name === 'spiel_zustand_lehrkraft' ? zustand(medium) : null, error: null }))
    renderApp('/leiten/spiel/s1')
  }

  it('zeigt das Bild zur Frage', async () => {
    zeige({ art: 'bild', url: BILD_URL, beschreibung: 'Karte von Frankreich' })
    expect(await screen.findByRole('img', { name: 'Karte von Frankreich' })).toHaveAttribute('src', BILD_URL)
  })

  it('bettet YouTube datensparsam (youtube-nocookie) mit Ausschnitt ein', async () => {
    zeige({ art: 'youtube', id: 'dQw4w9WgXcQ', start: 15, ende: 60 })
    const src = (await screen.findByTitle('Video zur Frage')).getAttribute('src')!
    expect(src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/)
    expect(src).toContain('start=15')
    expect(src).toContain('end=60')
  })

  it('spielt Audio ab der Startzeit', async () => {
    zeige({ art: 'audio', url: SPEICHER_URL + 'u1/ton.mp3', start: 5 })
    expect(await screen.findByLabelText('Audio zur Frage')).toHaveAttribute('src', SPEICHER_URL + 'u1/ton.mp3#t=5')
  })
})
