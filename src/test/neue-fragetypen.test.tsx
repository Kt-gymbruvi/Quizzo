import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { alsBeamerFrage, loesungZeilen } from '../lib/duell.ts'
import { bereinigeFrage, exportiereQuiz, importiereQuiz, lueckenAus, neueFrage, pruefeFrage, type Frage } from '../lib/fragetypen.ts'
import { pfadeIn } from '../lib/medien.ts'
import type { LehrkraftFrage, SchuelerFrage } from '../lib/spiel.ts'
import { bewerte, type Uebung } from '../lib/wiederholung.ts'
import { BeamerAuswertung } from '../spiel/Beamer.tsx'
import { HandyEingabe, loesungText, teilrichtigText } from '../spiel/Handy.tsx'
import { imZiel } from '../spiel/HotspotBild.tsx'

const KAT: Frage = {
  ...neueFrage('kategorien'),
  text: 'Sortiere',
  inhalt: { kategorien: ['Säugetier', 'Vogel'], begriffe: [{ text: 'Wal', kategorie: 0 }, { text: 'Amsel', kategorie: 1 }, { text: 'Igel', kategorie: 0 }] },
} as Frage
const LUE: Frage = { ...neueFrage('lueckentext'), text: 'Ergänze', inhalt: { lueckentext: 'Die [Sonne] geht im [Osten|O] auf.', modus: 'eingabe' } } as Frage
const HOT: Frage = {
  ...neueFrage('hotspot'),
  text: 'Wo?',
  inhalt: { bild: { url: 'https://x.supabase.co/storage/v1/object/public/quizzo-medien/u1/b.webp', pfad: 'u1/b.webp' }, ziel: { x: 50, y: 50, b: 20, h: 10 } },
} as Frage

describe('Neue Fragetypen: Prüfung im Editor', () => {
  it('Lückentext wird wie in der Datenbank zerlegt', () => {
    expect(lueckenAus('Die [Sonne] geht im [ Osten | O ] auf.')).toEqual({ teile: ['Die ', ' geht im ', ' auf.'], luecken: [['Sonne'], ['Osten', 'O']], klammerFehler: false })
    expect(lueckenAus('Die [Sonne geht').klammerFehler).toBe(true)
    expect(lueckenAus('Die [So[n]ne]').klammerFehler).toBe(true)
  })

  it('vollständige Fragen sind fehlerfrei', () => {
    expect(pruefeFrage(KAT)).toEqual([])
    expect(pruefeFrage(LUE)).toEqual([])
    expect(pruefeFrage(HOT)).toEqual([])
  })

  it('meldet verständliche Fehler', () => {
    expect(pruefeFrage({ ...KAT, inhalt: { kategorien: ['A', ''], begriffe: [{ text: 'x', kategorie: 0 }] } } as Frage)).toEqual([
      'Bitte jeder Gruppe einen Namen geben.',
      'Bitte mindestens zwei Begriffe eintragen.',
    ])
    expect(pruefeFrage({ ...LUE, inhalt: { lueckentext: 'Ohne Lücke', modus: 'eingabe' } } as Frage)).toEqual([
      'Bitte mindestens eine Lücke in eckigen Klammern markieren, z. B. „Die [Sonne] geht auf.“',
    ])
    expect(pruefeFrage({ ...LUE, inhalt: { lueckentext: 'Die [] und [Mond', modus: 'eingabe' } } as Frage)).toContain(
      'Eine eckige Klammer ist nicht geschlossen (Lücken so schreiben: [Lösung]).',
    )
    expect(pruefeFrage(neueFrage('hotspot'))).toEqual(['Der Fragetext fehlt.', 'Bitte ein Bild hochladen.'])
  })

  it('bereinigt: leere Begriffe weg, Ablenker nur im Auswahl-Modus, Zielbereich gerundet', () => {
    const k = bereinigeFrage({ ...KAT, inhalt: { ...KAT.inhalt, begriffe: [{ text: ' Wal ', kategorie: 0 }, { text: '', kategorie: 1 }] } } as Frage)
    expect(k.inhalt).toEqual({ kategorien: ['Säugetier', 'Vogel'], begriffe: [{ text: 'Wal', kategorie: 0 }] })
    expect(bereinigeFrage({ ...LUE, inhalt: { ...LUE.inhalt, ablenker: ['Mond'] } } as Frage).inhalt).toEqual({ lueckentext: 'Die [Sonne] geht im [Osten|O] auf.', modus: 'eingabe' })
    const h = bereinigeFrage({ ...HOT, inhalt: { ...HOT.inhalt, ziel: { x: 12.345, y: 50, b: 20, h: 10 } } } as Frage)
    expect(h.inhalt).toMatchObject({ ziel: { x: 12.3 } })
  })

  it('Export und Import erhalten die Fragen; Gruppen dürfen auch als Name angegeben werden', () => {
    const datei = JSON.stringify(exportiereQuiz('Test', [KAT, LUE, HOT]))
    const { fragen, fehler } = importiereQuiz(datei)
    expect(fehler).toEqual([])
    expect(fragen.map((f) => f.inhalt)).toEqual([KAT.inhalt, { ...LUE.inhalt, ablenker: [] }, HOT.inhalt])
    const perName = importiereQuiz(JSON.stringify({ fragen: [{ typ: 'kategorien', text: 'x', kategorien: ['A', 'B'], begriffe: [{ text: 'y', kategorie: 'B' }] }] }))
    expect(perName.fragen[0].inhalt).toEqual({ kategorien: ['A', 'B'], begriffe: [{ text: 'y', kategorie: 1 }] })
  })

  it('Bilder von Hotspot-Fragen zählen beim Aufräumen als benutzt', () => {
    expect(pfadeIn([HOT, { ...KAT, medium: { art: 'bild', url: 'https://x', pfad: 'u1/m.webp' } }])).toEqual(['u1/b.webp', 'u1/m.webp'])
  })
})

describe('Neue Fragetypen: Bewertung auf dem Gerät (Wiederholung) wie auf dem Server', () => {
  const uebung = (f: Frage, loesung: unknown): Uebung => ({ id: 'x', frage: { ...alsBeamerFrage(f), punkte: 1 } as SchuelerFrage, loesung, gemerkt: Date.now() })
  it('Kategorien: Anteil richtig einsortierter Begriffe', () => {
    const u = uebung(KAT, { kategorien: KAT.inhalt, begriffe: (KAT.inhalt as { begriffe: unknown }).begriffe })
    expect(bewerte(u, { Wal: 0, Amsel: 1, Igel: 0 })).toBe(1)
    expect(bewerte(u, { Wal: 0, Amsel: 0, Igel: 1 })).toBeCloseTo(1 / 3)
  })
  it('Lückentext: pro Lücke, Schreibweisen egal', () => {
    const u = uebung(LUE, [['Sonne'], ['Osten', 'O']])
    expect(bewerte(u, ['sonne', ' o '])).toBe(1)
    expect(bewerte(u, ['Mond', 'Osten'])).toBe(0.5)
  })
  it('Hotspot: im Zielbereich oder nicht', () => {
    const u = uebung(HOT, { x: 50, y: 50, b: 20, h: 10 })
    expect(bewerte(u, { x: 59, y: 54 })).toBe(1)
    expect(bewerte(u, { x: 61, y: 50 })).toBe(0)
    expect(imZiel({ x: 40, y: 45 }, { x: 50, y: 50, b: 20, h: 10 })).toBe(true)
  })
  it('Hotspot mit mehreren Bereichen: Lösung als Liste, alte Lösung als einzelner Bereich', () => {
    const liste = [{ x: 20, y: 20, b: 10, h: 10 }, { x: 80, y: 80, b: 10, h: 10 }]
    expect(bewerte(uebung(HOT, liste), { x: 81, y: 79 })).toBe(1)
    expect(bewerte(uebung(HOT, liste), { x: 50, y: 50 })).toBe(0)
    expect(bewerte(uebung(HOT, liste[0]), { x: 21, y: 19 })).toBe(1)
  })
  it('Hotspot „alle Bereiche“ beim Üben: Anteil der getroffenen Bereiche', () => {
    const liste = [{ x: 20, y: 20, b: 10, h: 10 }, { x: 80, y: 80, b: 10, h: 10 }]
    expect(bewerte(uebung(HOT, liste), [{ x: 20, y: 20 }, { x: 80, y: 80 }])).toBe(1)
    expect(bewerte(uebung(HOT, liste), [{ x: 20, y: 20 }, { x: 50, y: 50 }])).toBe(0.5)
  })
  it('Hotspot bereinigen: mehrere Bereiche bleiben erhalten, `ziel` ist der erste', () => {
    const z1 = { x: 50, y: 50, b: 20, h: 10 }
    const z2 = { x: 70.04, y: 30, b: 15, h: 15 }
    const h = bereinigeFrage({ ...HOT, inhalt: { ...HOT.inhalt, ziele: [z1, z2] } } as Frage)
    expect(h.inhalt).toMatchObject({ ziel: z1, ziele: [z1, { x: 70 }] })
    // „alle Bereiche nötig“ bleibt nur bei mehreren Bereichen erhalten
    expect(bereinigeFrage({ ...HOT, inhalt: { ...HOT.inhalt, ziele: [z1, z2], alle: true } } as Frage).inhalt).toMatchObject({ alle: true })
    expect((bereinigeFrage({ ...HOT, inhalt: { ...HOT.inhalt, alle: true } } as Frage).inhalt as Record<string, unknown>).alle).toBeUndefined()
    // nur ein Bereich: Format wie bisher
    expect((bereinigeFrage(HOT as Frage).inhalt as Record<string, unknown>).ziele).toBeUndefined()
  })
})

describe('Neue Fragetypen am Handy', () => {
  it('Kategorisieren: jeden Begriff einer Gruppe zuordnen, dann senden', async () => {
    const senden = vi.fn()
    const frage: SchuelerFrage = { typ: 'kategorien', text: 'x', zeitlimit: 0, punkte: 1, ansicht: { kategorien: ['Säugetier', 'Vogel'], begriffe: ['Amsel', 'Wal'] } }
    render(<HandyEingabe frage={frage} senden={senden} />)
    const knopf = screen.getByRole('button', { name: 'Antwort senden' })
    await userEvent.click(screen.getByRole('button', { name: 'Amsel: Vogel' }))
    expect(knopf).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Wal: Vogel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wal: Säugetier' })) // umentschieden
    expect(screen.getByRole('button', { name: 'Wal: Säugetier' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(knopf)
    expect(senden).toHaveBeenCalledWith({ Amsel: 1, Wal: 0 })
  })

  it('Lückentext zum Eintippen und zum Auswählen', async () => {
    const senden = vi.fn()
    const frage: SchuelerFrage = { typ: 'lueckentext', text: 'x', zeitlimit: 0, punkte: 1, ansicht: { teile: ['Die ', ' geht im ', ' auf.'], luecken: 2, max_zeichen: 40, optionen: null } }
    const { unmount } = render(<HandyEingabe frage={frage} senden={senden} />)
    expect(screen.getByRole('button', { name: 'Antwort senden' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Lücke 1'), ' Sonne ')
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    expect(senden).toHaveBeenLastCalledWith(['Sonne', ''])
    unmount()
    render(<HandyEingabe frage={{ ...frage, ansicht: { ...frage.ansicht, optionen: ['Osten', 'Sonne', 'Mond'] } }} senden={senden} />)
    await userEvent.selectOptions(screen.getByLabelText('Lücke 1'), 'Sonne')
    await userEvent.selectOptions(screen.getByLabelText('Lücke 2'), 'Osten')
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    expect(senden).toHaveBeenLastCalledWith(['Sonne', 'Osten'])
  })

  it('Hotspot: Tippen setzt die Markierung (in Prozent des Bildes)', async () => {
    const senden = vi.fn()
    const frage: SchuelerFrage = { typ: 'hotspot', text: 'x', zeitlimit: 0, punkte: 1, ansicht: { bild: 'https://x/b.webp', beschreibung: 'Karte' } }
    render(<HandyEingabe frage={frage} senden={senden} />)
    const bild = screen.getByRole('img', { name: 'Karte' })
    bild.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120, x: 10, y: 20, toJSON: () => ({}) })
    expect(screen.getByRole('button', { name: 'Antwort senden' })).toBeDisabled()
    await userEvent.pointer({ keys: '[MouseLeft]', target: bild, coords: { clientX: 60, clientY: 95 } })
    expect(screen.getByLabelText('Deine Wahl')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    expect(senden).toHaveBeenCalledWith({ x: 25, y: 75 })
  })

  it('Hotspot „alle Bereiche“: erst senden, wenn alle Stellen angetippt sind; Antwort ist eine Liste', async () => {
    const senden = vi.fn()
    const frage: SchuelerFrage = { typ: 'hotspot', text: 'x', zeitlimit: 0, punkte: 1, ansicht: { bild: 'https://x/b.webp', beschreibung: 'Karte', anzahl: 2 } }
    render(<HandyEingabe frage={frage} senden={senden} />)
    const bild = screen.getByRole('img', { name: 'Karte' })
    bild.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    await userEvent.pointer({ keys: '[MouseLeft]', target: bild, coords: { clientX: 10, clientY: 20 } })
    expect(screen.getByRole('button', { name: 'Antwort senden' })).toBeDisabled()
    expect(screen.getByText(/1 von 2/)).toBeInTheDocument()
    await userEvent.pointer({ keys: '[MouseLeft]', target: bild, coords: { clientX: 70, clientY: 80 } })
    expect(screen.getAllByLabelText('Deine Wahl')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Antwort senden' }))
    expect(senden).toHaveBeenCalledWith([{ x: 10, y: 20 }, { x: 70, y: 80 }])
  })

  it('Lösung und Teilpunkte nach dem Antworten', () => {
    const kat: SchuelerFrage = { typ: 'kategorien', text: 'x', zeitlimit: 0, punkte: 1, ansicht: { kategorien: ['A', 'B'], begriffe: ['x', 'y', 'z'] } }
    expect(teilrichtigText(kat, 2 / 3)).toBe('2 von 3 Begriffen richtig')
    expect(teilrichtigText(kat, 1)).toBeNull()
    render(<div>{loesungText(kat, { kategorien: ['A', 'B'], begriffe: [{ text: 'x', kategorie: 0 }, { text: 'y', kategorie: 1 }, { text: 'z', kategorie: 0 }] })}</div>)
    expect(screen.getByText('x, z')).toBeInTheDocument()
    const lue: SchuelerFrage = { typ: 'lueckentext', text: 'x', zeitlimit: 0, punkte: 1, ansicht: { teile: ['Die ', ' geht auf.'], luecken: 1 } }
    expect(teilrichtigText(lue, 0)).toBe('0 von 1 Lücken richtig')
    render(<div data-testid="l">{loesungText(lue, [['Sonne', 'sonne']])}</div>)
    expect(screen.getByTestId('l')).toHaveTextContent('Die Sonne geht auf.')
  })
})

describe('Neue Fragetypen am Beamer und im Klassen-Duell', () => {
  const alsLehrkraft = (f: Frage) => alsBeamerFrage(f, () => 0) as LehrkraftFrage
  it('Kategorisieren: Gruppen mit den richtigen Begriffen und Zahl der Treffer', () => {
    render(<BeamerAuswertung frage={alsLehrkraft(KAT)} antworten={[{ antwort: { Wal: 0, Amsel: 1, Igel: 1 }, anteil: 2 / 3, punkte: 667 }, { antwort: { Wal: 0, Amsel: 1, Igel: 0 }, anteil: 1, punkte: 1000 }]} />)
    const vogel = screen.getByRole('heading', { name: 'Vogel' }).closest('section')!
    expect(within(vogel).getByText('Amsel')).toBeInTheDocument()
    expect(screen.getByText('Igel').nextSibling).toHaveTextContent('1/2')
    expect(screen.getByText('83 %')).toBeInTheDocument()
  })
  it('Hotspot: Zielbereich und alle Tippstellen', () => {
    render(<BeamerAuswertung frage={alsLehrkraft(HOT)} antworten={[{ antwort: { x: 50, y: 50 }, anteil: 1, punkte: 1000 }, { antwort: { x: 5, y: 5 }, anteil: 0, punkte: 0 }]} />)
    expect(screen.getByLabelText('richtige Stelle')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })
  it('Duell: Ansicht und Lösungszeilen', () => {
    expect(alsBeamerFrage(LUE).ansicht).toMatchObject({ teile: ['Die ', ' geht im ', ' auf.'], luecken: 2, optionen: null })
    const auswahl = alsBeamerFrage({ ...LUE, inhalt: { lueckentext: '[Rot] und [rot] und [Blau]', modus: 'auswahl', ablenker: ['Grün'] } } as Frage)
    expect([...(auswahl.ansicht.optionen ?? [])].sort()).toEqual(['Blau', 'Grün', 'Rot'])
    expect(loesungZeilen(LUE)).toEqual(['1. Sonne', '2. Osten / O'])
    expect(loesungZeilen(KAT)).toEqual(['Säugetier: Wal, Igel', 'Vogel: Amsel'])
  })
})
