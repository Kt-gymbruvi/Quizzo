// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { bereinigeFrage, importiereQuiz } from '../../lib/fragetypen.ts'
import beispiel from '../../../beispiele/alle-fragetypen.quizzo.json?raw'
import { ANONYM, LEHRKRAFT_A, LEHRKRAFT_B, als, lehrkraft, neueDatenbank, restlicheMigrationen, rpc } from './datenbank.ts'

const A = lehrkraft(LEHRKRAFT_A)
const B = lehrkraft(LEHRKRAFT_B)

type F = { typ: string; text: string; inhalt: unknown; zeitlimit?: number; punkte?: number }
const json = (x: unknown) => JSON.stringify(x)

const FRAGEN: F[] = [
  { typ: 'auswahl', text: 'Hauptstadt von Frankreich?', inhalt: { antworten: ['Lyon', 'Paris', 'Nizza'], richtig: [1] }, zeitlimit: 20 },
  { typ: 'wahrfalsch', text: 'Die Erde ist rund.', inhalt: { richtig: true }, zeitlimit: 10, punkte: 2 },
  { typ: 'folie', text: 'Jetzt kommt eine Umfrage', inhalt: { text: 'Bitte ehrlich antworten.' } },
  { typ: 'umfrage', text: 'Wie fandest du das?', inhalt: { antworten: ['Gut', 'Geht so'] } },
]

type Beitritt = { spiel_id: string; spieler_id: string; token: string; spitzname: string }
type SchuelerZustand = {
  status: string
  frage_nr: number
  punkte: number
  platz: number
  frage: { typ: string; text: string; ansicht: Record<string, unknown>; zeitlimit: number } | null
  restzeit_ms: number | null
  meine_antwort: { antwort: unknown; richtig?: boolean; anteil?: number; punkte?: number } | null
  loesung: unknown
}
type LehrkraftZustand = {
  status: string
  frage_nr: number
  beantwortet: number
  restzeit_ms: number | null
  frage: { typ: string; inhalt: unknown } | null
  antworten: { antwort: unknown; anteil: number; punkte: number }[]
  spieler: { spitzname: string; punkte: number }[]
}

describe('Umbau bestehender Quizze (Migration 003)', () => {
  it('wandelt alte Fragen in Multiple-Choice-Fragen um', async () => {
    const db = await neueDatenbank('003')
    const alt = [{ text: 'Alt?', antworten: ['a', 'b', 'c'], richtig: 2, zeitlimit: 30 }]
    await rpc(db, A, 'quiz_speichern', [null, 'Altes Quiz', json(alt)])
    await restlicheMigrationen(db, '003')
    const rows = await als(db, A, 'select typ, text, inhalt, punkte, zeitlimit from public.fragen')
    expect(rows).toEqual([{ typ: 'auswahl', text: 'Alt?', inhalt: { antworten: ['a', 'b', 'c'], richtig: [2] }, punkte: 1, zeitlimit: 30 }])
  }, 60_000)
})

describe('Datenbank', () => {
  let db: PGlite
  let quizId: string

  beforeAll(async () => {
    db = await neueDatenbank()
    quizId = await rpc<string>(db, A, 'quiz_speichern', [null, 'Erdkunde', json(FRAGEN)])
  }, 60_000)

  describe('Quizze: Row Level Security', () => {
    it('Lehrkraft A sieht ihr Quiz mit allen Fragen', async () => {
      expect(await als(db, A, 'select titel from public.quizze')).toEqual([{ titel: 'Erdkunde' }])
      expect(await als(db, A, 'select typ from public.fragen order by position')).toEqual(FRAGEN.map((f) => ({ typ: f.typ })))
    })

    it('Lehrkraft B sieht weder Quizze noch Fragen von A', async () => {
      expect(await als(db, B, 'select * from public.quizze')).toEqual([])
      expect(await als(db, B, 'select * from public.fragen')).toEqual([])
    })

    it('Lehrkraft B kann As Quiz weder ändern noch löschen', async () => {
      await expect(rpc(db, B, 'quiz_speichern', [quizId, 'Gehackt', json(FRAGEN)])).rejects.toThrow('Quiz nicht gefunden')
      await als(db, B, 'update public.quizze set titel = $1 where id = $2', ['Gehackt', quizId])
      await als(db, B, 'delete from public.quizze where id = $1', [quizId])
      await als(db, B, 'delete from public.fragen where quiz_id = $1', [quizId])
      expect(await als(db, A, 'select titel from public.quizze')).toEqual([{ titel: 'Erdkunde' }])
      expect(await als(db, A, 'select count(*)::int as n from public.fragen')).toEqual([{ n: FRAGEN.length }])
    })

    it('Lehrkraft B kann kein Quiz auf As Namen anlegen', async () => {
      await expect(als(db, B, 'insert into public.quizze (titel, besitzer_id) values ($1, $2)', ['Fremd', LEHRKRAFT_A])).rejects.toThrow(/row-level security/)
    })

    it('Ohne Anmeldung: kein Zugriff auf Quizze, Fragen und Speicherfunktion', async () => {
      await expect(als(db, ANONYM, 'select * from public.quizze')).rejects.toThrow(/permission denied/)
      await expect(als(db, ANONYM, 'select * from public.fragen')).rejects.toThrow(/permission denied/)
      await expect(rpc(db, ANONYM, 'quiz_speichern', [null, 'x', '[]'])).rejects.toThrow(/permission denied/)
    })
  })

  describe('Schwierigkeit pro Frage (Migration 010)', () => {
    it('quiz_speichern übernimmt leicht/mittel/schwer, ohne Angabe bleibt leer; ungültige Werte abgelehnt', async () => {
      const fragen = [
        { ...FRAGEN[0], schwierigkeit: 1 },
        { ...FRAGEN[1], schwierigkeit: 3 },
        FRAGEN[3],
      ]
      const id = await rpc<string>(db, A, 'quiz_speichern', [null, 'Schwierigkeiten', json(fragen)])
      expect(await als(db, A, 'select schwierigkeit from public.fragen where quiz_id = $1 order by position', [id])).toEqual([
        { schwierigkeit: 1 },
        { schwierigkeit: 3 },
        { schwierigkeit: null },
      ])
      await expect(rpc(db, A, 'quiz_speichern', [id, 'Schwierigkeiten', json([{ ...FRAGEN[0], schwierigkeit: 4 }])])).rejects.toThrow(/check/)
      await als(db, A, 'delete from public.quizze where id = $1', [id])
    })
  })

  describe('Quizze: Ordner und „zuletzt benutzt“ (Migration 008)', () => {
    it('Lehrkraft legt eigene Quizze in Ordner, fremde nicht', async () => {
      await als(db, A, 'update public.quizze set ordner = $1 where id = $2', ['Erdkunde 7b', quizId])
      await als(db, B, 'update public.quizze set ordner = $1 where id = $2', ['Gehackt', quizId])
      expect(await als(db, A, 'select ordner from public.quizze where id = $1', [quizId])).toEqual([{ ordner: 'Erdkunde 7b' }])
      await expect(als(db, A, 'update public.quizze set ordner = $1 where id = $2', ['x'.repeat(61), quizId])).rejects.toThrow(/check/)
      await als(db, A, 'update public.quizze set ordner = null where id = $1', [quizId])
    })
    it('Verteilen merkt sich „zuletzt benutzt“', async () => {
      await rpc(db, A, 'aufgabe_erstellen', [quizId, 'selbstlernen', null, null])
      const [q] = await als<{ zuletzt_benutzt: Date | null }>(db, A, 'select zuletzt_benutzt from public.quizze where id = $1', [quizId])
      expect(q.zuletzt_benutzt).not.toBeNull()
    })
  })

  describe('Lernangebote auf der Webseite (Migration 009)', () => {
    const zeile = (ordner: string, extra: Record<string, unknown> = {}) => ({ ordner, titel: 'Titel', text: 'Erklärung', fach: 'bio', stufen: ['7'], ...extra })
    const einfuegen = (wer: typeof A, z: ReturnType<typeof zeile>) =>
      als(db, wer, 'insert into public.lernangebote (ordner, titel, text, fach, stufen, thema, sichtbar) values ($1, $2, $3, $4, $5, $6, coalesce($7, true))', [
        z.ordner, z.titel, z.text, z.fach, z.stufen, (z as { thema?: string }).thema ?? null, (z as { sichtbar?: boolean }).sichtbar ?? null,
      ])

    it('Lehrkraft legt Einträge an; Besucher lesen (auch „versteckt“-Markierung), ändern aber nichts', async () => {
      await einfuegen(A, zeile('herzzyklus'))
      await einfuegen(A, zeile('geheim', { sichtbar: false }))
      expect(await als(db, ANONYM, 'select ordner, sichtbar from public.lernangebote order by ordner')).toEqual([
        { ordner: 'geheim', sichtbar: false },
        { ordner: 'herzzyklus', sichtbar: true },
      ])
      // wem ein Eintrag gehört, sehen Besucher nicht
      await expect(als(db, ANONYM, 'select besitzer_id from public.lernangebote')).rejects.toThrow(/permission denied/)
      expect(await als(db, A, 'select ordner from public.lernangebote order by ordner')).toEqual([{ ordner: 'geheim' }, { ordner: 'herzzyklus' }])
      await expect(als(db, ANONYM, "update public.lernangebote set titel = 'x'")).rejects.toThrow(/permission denied/)
      await expect(als(db, ANONYM, 'delete from public.lernangebote')).rejects.toThrow(/permission denied/)
      await expect(als(db, ANONYM, "insert into public.lernangebote (ordner, titel, fach) values ('neu', 'x', 'bio')")).rejects.toThrow(/permission denied/)
    })

    it('andere Lehrkräfte können fremde Einträge nicht ändern', async () => {
      await als(db, B, "update public.lernangebote set titel = 'Gehackt' where ordner = 'herzzyklus'")
      await als(db, B, "delete from public.lernangebote where ordner = 'herzzyklus'")
      expect(await als(db, A, "select titel from public.lernangebote where ordner = 'herzzyklus'")).toEqual([{ titel: 'Titel' }])
      // Eintrag auf fremden Namen anlegen geht nicht
      await expect(
        als(db, B, 'insert into public.lernangebote (ordner, titel, fach, besitzer_id) values ($1, $2, $3, $4)', ['fremd', 'x', 'bio', LEHRKRAFT_A]),
      ).rejects.toThrow(/row-level security/)
    })

    it('Lehrkraft ändert Einordnung, Reihenfolge und Sichtbarkeit; ungültige Werte lehnt die Datenbank ab', async () => {
      await als(db, A, "update public.lernangebote set fach = 'sport', stufen = '{sek2,10}', thema = 'evo', position = 30, sichtbar = false where ordner = 'herzzyklus'")
      expect(await als(db, A, "select fach, stufen, thema, position, sichtbar from public.lernangebote where ordner = 'herzzyklus'")).toEqual([
        { fach: 'sport', stufen: ['sek2', '10'], thema: 'evo', position: 30, sichtbar: false },
      ])
      expect(await als(db, ANONYM, "select sichtbar from public.lernangebote where ordner = 'herzzyklus'")).toEqual([{ sichtbar: false }])
      await expect(einfuegen(A, zeile('Böser Ordner/../'))).rejects.toThrow(/check/)
      await expect(einfuegen(A, zeile('lang', { text: 'x'.repeat(601) }))).rejects.toThrow(/check/)
      await expect(einfuegen(A, zeile('stufe', { stufen: ['<script>'] }))).rejects.toThrow(/check/)
      await als(db, A, 'delete from public.lernangebote')
      expect(await als(db, A, 'select count(*)::int as n from public.lernangebote')).toEqual([{ n: 0 }])
    })
  })

  describe('Fragetypen: die Datenbank nimmt nur vollständige Fragen an', () => {
    const gueltig: F[] = [
      { typ: 'auswahl', text: 'Mehrere richtig', inhalt: { antworten: ['a', 'b', 'c', 'd', 'e', 'f'], richtig: [0, 5] } },
      { typ: 'wahrfalsch', text: 'Stimmt', inhalt: { richtig: false } },
      { typ: 'freitext', text: 'Hauptstadt?', inhalt: { loesungen: ['Berlin', 'berlin '] } },
      { typ: 'reihenfolge', text: 'Sortiere', inhalt: { elemente: ['1', '2', '3'] } },
      { typ: 'zuordnung', text: 'Ordne zu', inhalt: { paare: [{ links: 'Hund', rechts: 'bellt' }, { links: 'Katze', rechts: 'miaut' }] } },
      { typ: 'umfrage', text: 'Meinung', inhalt: { antworten: ['ja', 'nein'] } },
      { typ: 'wortwolke', text: 'Ein Wort', inhalt: {} },
      { typ: 'offen', text: 'Erkläre', inhalt: {} },
      { typ: 'schieberegler', text: 'Jahr?', inhalt: { min: 1900, max: 2000, schritt: 1, richtig: 1989, toleranz: 0, einheit: '' } },
      { typ: 'folie', text: 'Info', inhalt: { text: 'Hallo' } },
    ]
    it('akzeptiert die Beispieldatei mit allen Fragetypen (so wie die App sie speichert)', async () => {
      const { fragen } = importiereQuiz(beispiel)
      await expect(rpc(db, A, 'quiz_speichern', [null, 'Beispiel', json(fragen.map(bereinigeFrage))])).resolves.toBeTruthy()
    })

    it.each(gueltig)('akzeptiert: $typ', async (f) => {
      await expect(rpc(db, A, 'quiz_speichern', [null, 'Test ' + f.typ, json([f])])).resolves.toBeTruthy()
    })

    const ungueltig: [string, F][] = [
      ['Multiple Choice ohne richtige Antwort', { typ: 'auswahl', text: 'x', inhalt: { antworten: ['a', 'b'], richtig: [] } }],
      ['Multiple Choice mit Index außerhalb', { typ: 'auswahl', text: 'x', inhalt: { antworten: ['a', 'b'], richtig: [2] } }],
      ['Multiple Choice mit 7 Antworten', { typ: 'auswahl', text: 'x', inhalt: { antworten: ['1', '2', '3', '4', '5', '6', '7'], richtig: [0] } }],
      ['Multiple Choice mit leerer Antwort', { typ: 'auswahl', text: 'x', inhalt: { antworten: ['a', ' '], richtig: [0] } }],
      ['Richtig/Falsch ohne Lösung', { typ: 'wahrfalsch', text: 'x', inhalt: {} }],
      ['Freitext ohne Lösung', { typ: 'freitext', text: 'x', inhalt: { loesungen: [] } }],
      ['Reihenfolge mit 2 Elementen', { typ: 'reihenfolge', text: 'x', inhalt: { elemente: ['a', 'b'] } }],
      ['Reihenfolge mit doppeltem Element', { typ: 'reihenfolge', text: 'x', inhalt: { elemente: ['a', 'b', 'A'] } }],
      ['Zuordnung mit doppelter rechter Seite', { typ: 'zuordnung', text: 'x', inhalt: { paare: [{ links: 'a', rechts: 'x' }, { links: 'b', rechts: 'x' }] } }],
      ['Schieberegler: Lösung außerhalb', { typ: 'schieberegler', text: 'x', inhalt: { min: 0, max: 10, schritt: 1, richtig: 11, toleranz: 0 } }],
      ['Schieberegler: min ≥ max', { typ: 'schieberegler', text: 'x', inhalt: { min: 10, max: 10, schritt: 1, richtig: 10, toleranz: 0 } }],
      ['unbekannter Typ', { typ: 'tanzen', text: 'x', inhalt: {} }],
      ['ungültiger Punktefaktor', { typ: 'wahrfalsch', text: 'x', inhalt: { richtig: true }, punkte: 3 }],
    ]
    it.each(ungueltig)('lehnt ab: %s', async (_name, f) => {
      await expect(rpc(db, A, 'quiz_speichern', [null, 'Kaputt', json([f])])).rejects.toThrow(/check constraint/)
    })
  })

  describe('Bewertung der Antworten (Anteil richtig, 0 bis 1)', () => {
    async function bewerte(typ: string, inhalt: unknown, antwort: unknown) {
      const r = await db.query<{ a: number }>('select public.antwort_bewerten($1, $2, $3) as a', [typ, json(inhalt), json(antwort)])
      return r.rows[0].a
    }

    it('Multiple Choice: nur die vollständig richtige Auswahl zählt', async () => {
      const mc = { antworten: ['a', 'b', 'c', 'd'], richtig: [0, 2] }
      expect(await bewerte('auswahl', mc, [2, 0])).toBe(1)
      expect(await bewerte('auswahl', mc, [0])).toBe(0)
      expect(await bewerte('auswahl', mc, [0, 1, 2])).toBe(0)
    })
    it('Richtig/Falsch', async () => {
      expect(await bewerte('wahrfalsch', { richtig: false }, false)).toBe(1)
      expect(await bewerte('wahrfalsch', { richtig: false }, true)).toBe(0)
    })
    it('Freitext ignoriert Groß-/Kleinschreibung und doppelte Leerzeichen', async () => {
      const ft = { loesungen: ['New York', 'NYC'] }
      expect(await bewerte('freitext', ft, '  new   york ')).toBe(1)
      expect(await bewerte('freitext', ft, 'nyc')).toBe(1)
      expect(await bewerte('freitext', ft, 'Boston')).toBe(0)
    })
    it('Reihenfolge: nur die exakt richtige Reihenfolge zählt', async () => {
      const r = { elemente: ['eins', 'zwei', 'drei'] }
      expect(await bewerte('reihenfolge', r, ['eins', 'zwei', 'drei'])).toBe(1)
      expect(await bewerte('reihenfolge', r, ['zwei', 'eins', 'drei'])).toBe(0)
    })
    it('Zuordnung: Teilpunkte für jedes richtige Paar', async () => {
      const z = { paare: [{ links: 'a', rechts: '1' }, { links: 'b', rechts: '2' }, { links: 'c', rechts: '3' }, { links: 'd', rechts: '4' }] }
      expect(await bewerte('zuordnung', z, ['1', '2', '3', '4'])).toBe(1)
      expect(await bewerte('zuordnung', z, ['1', '2', '4', '3'])).toBe(0.5)
    })
    it('Schieberegler: volle Punkte innerhalb der Toleranz, dann abnehmend', async () => {
      const s = { min: 0, max: 100, schritt: 1, richtig: 50, toleranz: 2 }
      expect(await bewerte('schieberegler', s, 52)).toBe(1)
      expect(await bewerte('schieberegler', s, 64.5)).toBeCloseTo(0.5)
      expect(await bewerte('schieberegler', s, 100)).toBe(0)
    })
    it('Umfrage, Wortwolke, offene Frage: keine Punkte', async () => {
      expect(await bewerte('umfrage', { antworten: ['a', 'b'] }, [1])).toBe(0)
      expect(await bewerte('wortwolke', {}, 'Spaß')).toBe(0)
      expect(await bewerte('offen', {}, 'Weil …')).toBe(0)
    })
    it.each([
      ['auswahl', { antworten: ['a', 'b'], richtig: [0] }, [5]],
      ['auswahl', { antworten: ['a', 'b'], richtig: [0] }, 'a'],
      ['wahrfalsch', { richtig: true }, 1],
      ['freitext', { loesungen: ['x'] }, ''],
      ['reihenfolge', { elemente: ['a', 'b', 'c'] }, ['a', 'b']],
      ['schieberegler', { min: 0, max: 10, schritt: 1, richtig: 5, toleranz: 0 }, 11],
      ['umfrage', { antworten: ['a', 'b'] }, [0, 1]],
      ['wortwolke', {}, 'x'.repeat(26)],
      ['folie', {}, 'x'],
    ])('lehnt ungültige Antworten ab: %s %j', async (typ, inhalt, antwort) => {
      await expect(bewerte(typ as string, inhalt, antwort)).rejects.toThrow(/QUIZZO/)
    })
  })

  describe('Live-Spiel', () => {
    let spiel: { id: string; pin: string }
    let fuchs: Beitritt
    let eule: Beitritt
    const zustandS = (b: Beitritt) => rpc<SchuelerZustand>(db, ANONYM, 'spiel_zustand_schueler', [b.spieler_id, b.token])
    const zustandL = () => rpc<LehrkraftZustand>(db, A, 'spiel_zustand_lehrkraft', [spiel.id])
    const antworte = (b: Beitritt, nr: number, a: unknown) => rpc(db, ANONYM, 'antwort_abgeben', [b.spieler_id, b.token, nr, json(a)])

    it('Lehrkraft A startet ein Spiel und bekommt eine 6-stellige PIN', async () => {
      spiel = await rpc(db, A, 'spiel_erstellen', [quizId])
      expect(spiel.pin).toMatch(/^\d{6}$/)
    })

    it('Fremde dürfen zu As Quiz kein Spiel starten', async () => {
      await expect(rpc(db, B, 'spiel_erstellen', [quizId])).rejects.toThrow('Quiz nicht gefunden')
      await expect(rpc(db, ANONYM, 'spiel_erstellen', [quizId])).rejects.toThrow(/permission denied/)
    })

    it('Schüler treten ohne Konto mit PIN und Spitzname bei', async () => {
      fuchs = await rpc(db, ANONYM, 'spiel_beitreten', [spiel.pin, '  Schlauer   Fuchs '])
      eule = await rpc(db, ANONYM, 'spiel_beitreten', [spiel.pin, 'Eule'])
      expect(fuchs.spitzname).toBe('Schlauer Fuchs')
    })

    it('lehnt doppelte Spitznamen, falsche PIN und zu lange Namen ab', async () => {
      await expect(rpc(db, ANONYM, 'spiel_beitreten', [spiel.pin, 'eule'])).rejects.toThrow('schon vergeben')
      await expect(rpc(db, ANONYM, 'spiel_beitreten', ['000000', 'Neu'])).rejects.toThrow('Kein laufendes Spiel')
      await expect(rpc(db, ANONYM, 'spiel_beitreten', [spiel.pin, 'x'.repeat(21)])).rejects.toThrow('1 bis 20 Zeichen')
    })

    it('Schüler haben keinen direkten Zugriff auf Spieltabellen', async () => {
      for (const t of ['spiele', 'spieler', 'antworten']) {
        await expect(als(db, ANONYM, `select * from public.${t}`)).rejects.toThrow(/permission denied/)
      }
    })

    it('Lehrkraft sieht Spitznamen, aber nicht die geheimen Spieler-Schlüssel', async () => {
      expect(await als(db, A, 'select spitzname from public.spieler order by spitzname')).toEqual([{ spitzname: 'Eule' }, { spitzname: 'Schlauer Fuchs' }])
      await expect(als(db, A, 'select token from public.spieler')).rejects.toThrow(/permission denied/)
    })

    it('Lehrkraft B kann As Spiel weder sehen noch steuern', async () => {
      expect(await rpc(db, B, 'spiel_zustand_lehrkraft', [spiel.id])).toBeNull()
      expect(await als(db, B, 'select spitzname from public.spieler')).toEqual([])
      expect(await als(db, B, 'select * from public.antworten')).toEqual([])
      await expect(rpc(db, B, 'spiel_steuern', [spiel.id, 'weiter'])).rejects.toThrow('Spiel nicht gefunden')
    })

    it('Frage 1 (Multiple Choice): Schüler sehen keine Lösung', async () => {
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      const z = await zustandS(fuchs)
      expect(z.frage).toMatchObject({ typ: 'auswahl', ansicht: { antworten: ['Lyon', 'Paris', 'Nizza'], mehrfach: false } })
      expect(JSON.stringify(z)).not.toContain('richtig')
      expect(z.loesung).toBeNull()
    })

    it('falscher Schlüssel: kein Zugriff', async () => {
      expect(await rpc(db, ANONYM, 'spiel_zustand_schueler', [fuchs.spieler_id, eule.token])).toBeNull()
      await expect(antworte({ ...fuchs, token: eule.token }, 0, [1])).rejects.toThrow('nicht (mehr) in diesem Spiel')
    })

    it('richtige Antwort gibt 500–1000 Punkte, zweimal antworten geht nicht', async () => {
      await antworte(fuchs, 0, [1])
      await expect(antworte(fuchs, 0, [2])).rejects.toThrow('schon beantwortet')
      const z = await zustandS(fuchs)
      expect(z.punkte).toBeGreaterThanOrEqual(500)
      expect(z.punkte).toBeLessThanOrEqual(1000)
      expect(z.meine_antwort).toEqual({ antwort: [1] }) // Ergebnis erst nach Auflösung
    })

    it('nach Ablauf der Zeit werden keine Antworten mehr angenommen', async () => {
      await db.query(`update public.spiele set frage_start = now() - interval '25 seconds' where id = $1`, [spiel.id])
      await expect(antworte(eule, 0, [0])).rejects.toThrow('Zeit ist abgelaufen')
      await db.query(`update public.spiele set frage_start = now() where id = $1`, [spiel.id])
    })

    it('ungültige Antworten werden abgelehnt', async () => {
      await expect(antworte(eule, 0, [3])).rejects.toThrow('Ungültige Antwort')
      await expect(antworte(eule, 0, true)).rejects.toThrow('Ungültige Antwort')
      await antworte(eule, 0, [0]) // falsch
    })

    it('Lehrkraft sieht alle Antworten zur aktuellen Frage (ohne Namen)', async () => {
      const z = await zustandL()
      expect(z.beantwortet).toBe(2)
      expect(z.antworten.map((a) => a.antwort).sort()).toEqual([[0], [1]])
      expect(JSON.stringify(z.antworten)).not.toContain('Fuchs')
    })

    it('nach dem Auflösen sehen Schüler ihr Ergebnis und die Lösung', async () => {
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'aufloesen'])
      const f = await zustandS(fuchs)
      const e = await zustandS(eule)
      expect(f.meine_antwort).toMatchObject({ richtig: true, anteil: 1 })
      expect(f.platz).toBe(1)
      expect(e.meine_antwort).toMatchObject({ antwort: [0], richtig: false, punkte: 0 })
      expect(e.loesung).toEqual([1])
      await expect(antworte(eule, 0, [1])).rejects.toThrow('schon vorbei')
    })

    it('Frage 2 zählt doppelt (Punktefaktor 2): bis zu 2000 Punkte', async () => {
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      const vorher = (await zustandS(eule)).punkte
      await antworte(eule, 1, true)
      const nachher = (await zustandS(eule)).punkte
      expect(nachher - vorher).toBeGreaterThan(1000)
      expect(nachher - vorher).toBeLessThanOrEqual(2000)
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'aufloesen'])
    })

    it('Präsentationsfolie: kein Countdown, nicht beantwortbar, „weiter“ geht direkt zur nächsten Frage', async () => {
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      const z = await zustandL()
      expect(z.frage?.typ).toBe('folie')
      expect(z.restzeit_ms).toBeNull()
      expect((await zustandS(fuchs)).frage?.ansicht).toEqual({ text: 'Bitte ehrlich antworten.' })
      await expect(antworte(fuchs, 2, 'x')).rejects.toThrow('nicht beantworten')
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'aufloesen']) // wird ignoriert
      expect((await zustandL()).status).toBe('frage')
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      expect((await zustandL()).frage?.typ).toBe('umfrage')
    })

    it('Umfrage: Antworten werden gezählt, aber es gibt keine Punkte', async () => {
      const vorher = (await zustandS(fuchs)).punkte
      await antworte(fuchs, 3, [0])
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'aufloesen'])
      expect((await zustandS(fuchs)).punkte).toBe(vorher)
      expect((await zustandS(fuchs)).loesung).toBeNull()
      expect((await zustandL()).antworten).toEqual([{ antwort: [0], anteil: 0, punkte: 0 }])
    })

    it('nach der letzten Frage endet das Spiel; danach kann niemand mehr beitreten', async () => {
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      expect((await zustandL()).status).toBe('ende')
      await expect(rpc(db, ANONYM, 'spiel_beitreten', [spiel.pin, 'Spät'])).rejects.toThrow('Kein laufendes Spiel')
    })

    it('Lehrkraft B kann As Spiel nicht löschen', async () => {
      await als(db, B, 'delete from public.spiele where id = $1', [spiel.id])
      expect(await als(db, A, 'select count(*)::int as n from public.spiele')).toEqual([{ n: 1 }])
    })

    it('Spiel beenden löscht alle Spieldaten (Spitznamen, Antworten, Punkte)', async () => {
      await als(db, A, 'delete from public.spiele where id = $1', [spiel.id])
      for (const t of ['spiele', 'spieler', 'antworten']) {
        expect((await db.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0].n).toBe(0)
      }
      expect(await zustandS(fuchs)).toBeNull()
      expect(await als(db, A, 'select titel from public.quizze where id = $1', [quizId])).toEqual([{ titel: 'Erdkunde' }])
    })

    it('liegengebliebene Spiele werden nach 6 Stunden automatisch gelöscht', async () => {
      const alt = await rpc<{ id: string; pin: string }>(db, A, 'spiel_erstellen', [quizId])
      await rpc(db, ANONYM, 'spiel_beitreten', [alt.pin, 'Igel'])
      await db.query(`update public.spiele set erstellt_am = now() - interval '7 hours' where id = $1`, [alt.id])
      const neu = await rpc<{ id: string }>(db, A, 'spiel_erstellen', [quizId])
      expect((await db.query<{ id: string }>('select id from public.spiele')).rows.map((r) => r.id)).toEqual([neu.id])
      expect((await db.query<{ n: number }>('select count(*)::int as n from public.spieler')).rows[0].n).toBe(0)
    })

    it('die Aufräum-Funktion ist von außen nicht aufrufbar', async () => {
      await expect(rpc(db, ANONYM, 'spiele_aufraeumen', [])).rejects.toThrow(/permission denied/)
      await expect(rpc(db, A, 'spiele_aufraeumen', [])).rejects.toThrow(/permission denied/)
    })
  })

  describe('Medien (Bild, Audio, Video)', () => {
    const ORDNER_A = LEHRKRAFT_A
    const pfadA = `${ORDNER_A}/11111111-2222-4333-8444-555555555555.webp`
    const url = 'https://beispiel.supabase.co/storage/v1/object/public/quizzo-medien/' + pfadA
    const mit = (medium: unknown): F & { medium: unknown } => ({ ...FRAGEN[0], medium })

    it('speichert ein Medium zur Frage und zeigt es der Lehrkraft im Spiel', async () => {
      const medium = { art: 'bild', url, pfad: pfadA, beschreibung: 'Karte von Frankreich' }
      const id = await rpc<string>(db, A, 'quiz_speichern', [null, 'Mit Bild', json([mit(medium)])])
      expect(await als(db, A, 'select medium from public.fragen where quiz_id = $1', [id])).toEqual([{ medium }])
      const sp = await rpc<{ id: string; pin: string }>(db, A, 'spiel_erstellen', [id])
      const b = await rpc<Beitritt>(db, ANONYM, 'spiel_beitreten', [sp.pin, 'Bildgucker'])
      await rpc(db, A, 'spiel_steuern', [sp.id, 'weiter'])
      const l = await rpc<{ frage: { medium: unknown } }>(db, A, 'spiel_zustand_lehrkraft', [sp.id])
      expect(l.frage.medium).toEqual(medium)
      // Schüler bekommen das Medium nicht (nur Beamer)
      const z = await rpc<SchuelerZustand>(db, ANONYM, 'spiel_zustand_schueler', [b.spieler_id, b.token])
      expect(JSON.stringify(z)).not.toContain('medium')
    })

    it('Fragen ohne Medium bleiben gültig', async () => {
      const id = await rpc<string>(db, A, 'quiz_speichern', [null, 'Ohne', json([mit(null)])])
      expect(await als(db, A, 'select medium from public.fragen where quiz_id = $1', [id])).toEqual([{ medium: null }])
    })

    it.each([
      ['unbekannte Art', { art: 'pdf', url }],
      ['keine https-Adresse', { art: 'bild', url: 'http://unsicher.example/bild.png' }],
      ['Adresse fehlt', { art: 'audio' }],
      ['Skript statt Adresse', { art: 'bild', url: 'javascript:alert(1)' }],
      ['falscher Speicherpfad', { art: 'bild', url, pfad: '../fremd/datei.png' }],
      ['YouTube-ID ungültig', { art: 'youtube', id: 'abc' }],
      ['Ende vor Start', { art: 'youtube', id: 'dQw4w9WgXcQ', start: 30, ende: 10 }],
      ['negativer Start', { art: 'video', url, start: -5 }],
      ['zu lange Beschreibung', { art: 'bild', url, beschreibung: 'x'.repeat(301) }],
      ['kein Objekt', ['bild', url]],
    ])('lehnt ungültige Medien ab: %s', async (_, medium) => {
      await expect(rpc(db, A, 'quiz_speichern', [null, 'Kaputt', json([mit(medium)])])).rejects.toThrow(/fragen_medium_check/)
    })

    it('akzeptiert YouTube mit Ausschnitt und Audio mit Startzeit', async () => {
      const fragen = [mit({ art: 'youtube', id: 'dQw4w9WgXcQ', start: 12, ende: 40 }), mit({ art: 'audio', url, start: 3 })]
      await expect(rpc(db, A, 'quiz_speichern', [null, 'Medien ok', json(fragen)])).resolves.toBeTruthy()
    })

    const hochladen = (wer: typeof A, name: string) =>
      als(db, wer, `insert into storage.objects (bucket_id, name) values ('quizzo-medien', $1) returning name`, [name])

    it('der Speicher-Bucket ist angelegt: öffentlich lesbar, höchstens 50 MB, nur Medienformate', async () => {
      const [b] = await als<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
        db, ANONYM, `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'quizzo-medien'`)
      expect(b.public).toBe(true)
      expect(Number(b.file_size_limit)).toBe(50 * 1024 * 1024)
      expect(b.allowed_mime_types).toContain('image/webp')
      expect(b.allowed_mime_types.some((t) => /pdf|html|javascript|svg/.test(t))).toBe(false)
    })

    it('Lehrkräfte laden nur in ihren eigenen Ordner hoch', async () => {
      await expect(hochladen(A, pfadA)).resolves.toEqual([{ name: pfadA }])
      await expect(hochladen(A, `${LEHRKRAFT_B}/fremd.webp`)).rejects.toThrow(/row-level security/)
      await expect(hochladen(A, 'ohne-ordner.webp')).rejects.toThrow(/row-level security/)
    })

    it('ohne Anmeldung: kein Hochladen, keine Dateiliste', async () => {
      await expect(hochladen(ANONYM, `${LEHRKRAFT_A}/anonym.webp`)).rejects.toThrow(/row-level security/)
      expect(await als(db, ANONYM, 'select name from storage.objects')).toEqual([])
    })

    it('Lehrkraft B sieht und löscht keine Dateien von A', async () => {
      expect(await als(db, B, 'select name from storage.objects')).toEqual([])
      await als(db, B, 'delete from storage.objects where name = $1', [pfadA])
      expect(await als(db, A, 'select name from storage.objects')).toEqual([{ name: pfadA }])
    })

    it('Lehrkraft A kann ihre eigenen Dateien löschen', async () => {
      await als(db, A, 'delete from storage.objects where name = $1', [pfadA])
      expect(await als(db, A, 'select name from storage.objects')).toEqual([])
    })
  })

  describe('Teamspiel', () => {
    type Wertung = { team: number; punkte: number; mitglieder: number; platz: number }[]
    type L = Omit<LehrkraftZustand, 'spieler'> & { modus: string; anzahl_teams: number | null; teams: Wertung | null; spieler: { id: string; spitzname: string; punkte: number; team: number | null }[] }
    let spiel: { id: string; pin: string }
    const teil: Beitritt[] = []
    const zustandL = () => rpc<L>(db, A, 'spiel_zustand_lehrkraft', [spiel.id])
    const zustandS = (b: Beitritt) => rpc<SchuelerZustand & { modus: string; team: number; teams: Wertung }>(db, ANONYM, 'spiel_zustand_schueler', [b.spieler_id, b.token])

    it('klassische Spiele bleiben der Standard (auch für den alten Aufruf ohne Modus)', async () => {
      const sp = await rpc<{ id: string }>(db, A, 'spiel_erstellen', [quizId])
      const z = await rpc<L>(db, A, 'spiel_zustand_lehrkraft', [sp.id])
      expect(z.modus).toBe('klassisch')
      expect(z.teams).toBeNull()
    })

    it('prüft Modus und Anzahl der Teams', async () => {
      await expect(rpc(db, A, 'spiel_erstellen', [quizId, 'turnier', null])).rejects.toThrow('Unbekannter Spielmodus')
      await expect(rpc(db, A, 'spiel_erstellen', [quizId, 'team', 1])).rejects.toThrow('2 bis 6 Teams')
      await expect(rpc(db, A, 'spiel_erstellen', [quizId, 'team', 7])).rejects.toThrow('2 bis 6 Teams')
      await expect(rpc(db, A, 'spiel_erstellen', [quizId, 'team', null])).rejects.toThrow('2 bis 6 Teams')
    })

    it('verteilt Beitretende gleichmäßig auf die Teams', async () => {
      spiel = await rpc(db, A, 'spiel_erstellen', [quizId, 'team', 3])
      for (const name of ['T1', 'T2', 'T3', 'T4', 'T5']) teil.push(await rpc<Beitritt & { team: number }>(db, ANONYM, 'spiel_beitreten', [spiel.pin, name]))
      expect(teil.map((t) => (t as Beitritt & { team: number }).team)).toEqual([1, 2, 3, 1, 2])
      const z = await zustandL()
      expect(z.anzahl_teams).toBe(3)
      expect(z.teams!.map((t) => t.mitglieder)).toEqual([2, 2, 1])
    })

    it('Lehrkraft kann in der Lobby umsetzen, Fremde und Schüler nicht', async () => {
      await rpc(db, A, 'spieler_team_wechseln', [teil[0].spieler_id]) // T1: 1 → 2
      await rpc(db, A, 'spieler_team_wechseln', [teil[1].spieler_id]) // T2: 2 → 3
      expect((await zustandL()).spieler.find((s) => s.spitzname === 'T1')!.team).toBe(2)
      await expect(rpc(db, B, 'spieler_team_wechseln', [teil[0].spieler_id])).rejects.toThrow('Spieler nicht gefunden')
      await expect(rpc(db, ANONYM, 'spieler_team_wechseln', [teil[0].spieler_id])).rejects.toThrow(/permission denied/)
      await expect(rpc(db, ANONYM, 'team_wertung', [spiel.id])).rejects.toThrow(/permission denied/)
      await expect(rpc(db, A, 'team_wertung', [spiel.id])).rejects.toThrow(/permission denied/)
    })

    it('Teampunkte sind der Durchschnitt der Mitglieder; Schüler sehen ihr Team und die Wertung', async () => {
      // Teams jetzt: 1 = {T4}, 2 = {T1, T5}, 3 = {T2, T3}
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      await rpc(db, ANONYM, 'antwort_abgeben', [teil[3].spieler_id, teil[3].token, 0, json([1])]) // T4 richtig
      await rpc(db, ANONYM, 'antwort_abgeben', [teil[0].spieler_id, teil[0].token, 0, json([1])]) // T1 richtig
      await rpc(db, ANONYM, 'antwort_abgeben', [teil[4].spieler_id, teil[4].token, 0, json([0])]) // T5 falsch
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'aufloesen'])
      const punkte = Object.fromEntries((await zustandL()).spieler.map((s) => [s.spitzname, s.punkte]))
      const w = (await zustandL()).teams!
      expect(w[0]).toMatchObject({ team: 1, punkte: punkte.T4, mitglieder: 1, platz: 1 })
      expect(w.find((t) => t.team === 2)).toMatchObject({ punkte: Math.round(punkte.T1 / 2), platz: 2 })
      expect(w.find((t) => t.team === 3)).toMatchObject({ punkte: 0, platz: 3 })

      const s = await zustandS(teil[0])
      expect(s.modus).toBe('team')
      expect(s.team).toBe(2)
      expect(s.teams).toEqual(w)
      expect(JSON.stringify(s.teams)).not.toMatch(/T\d/) // keine Spitznamen anderer in der Teamwertung
    })

    it('nach dem Start kann nicht mehr umgesetzt werden', async () => {
      await expect(rpc(db, A, 'spieler_team_wechseln', [teil[0].spieler_id])).rejects.toThrow('vor dem Start')
    })

    it('wer später beitritt, kommt ins kleinste Team', async () => {
      const spaet = await rpc<Beitritt & { team: number }>(db, ANONYM, 'spiel_beitreten', [spiel.pin, 'Spät'])
      expect(spaet.team).toBe(1)
    })
  })

  describe('Turnier (mehrere Runden)', () => {
    type L = { status: string; runde: number; quiz_titel: string; frage_nr: number; spieler: { spitzname: string; punkte: number }[] }
    let spiel: { id: string; pin: string }
    let fuchs: Beitritt
    let quiz2: string
    const zustandL = () => rpc<L>(db, A, 'spiel_zustand_lehrkraft', [spiel.id])
    const bisZumEnde = async () => {
      for (let i = 0; i < 20 && (await zustandL()).status !== 'ende'; i++) {
        await rpc(db, A, 'spiel_steuern', [spiel.id, 'aufloesen'])
        await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      }
    }

    it('vor dem Endstand gibt es keine nächste Runde', async () => {
      quiz2 = await rpc<string>(db, A, 'quiz_speichern', [null, 'Runde zwei', json([FRAGEN[1]])])
      spiel = await rpc(db, A, 'spiel_erstellen', [quizId])
      fuchs = await rpc<Beitritt>(db, ANONYM, 'spiel_beitreten', [spiel.pin, 'Turnierfuchs'])
      expect((await zustandL()).runde).toBe(1)
      await expect(rpc(db, A, 'spiel_naechste_runde', [spiel.id, quiz2])).rejects.toThrow('erst nach dem Endstand')
    })

    it('nach dem Endstand: neues Quiz, Punkte bleiben, alte Antworten werden gelöscht', async () => {
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      await rpc(db, ANONYM, 'antwort_abgeben', [fuchs.spieler_id, fuchs.token, 0, json([1])])
      await bisZumEnde()
      const ende = await zustandL()
      expect(ende.status).toBe('ende')
      const punkte = ende.spieler[0].punkte
      expect(punkte).toBeGreaterThan(0)

      await rpc(db, A, 'spiel_naechste_runde', [spiel.id, quiz2])
      const z = await zustandL()
      expect(z).toMatchObject({ status: 'lobby', runde: 2, quiz_titel: 'Runde zwei', frage_nr: -1 })
      expect(z.spieler).toEqual([expect.objectContaining({ spitzname: 'Turnierfuchs', punkte })])
      expect(await als(db, A, 'select count(*)::int as n from public.antworten where spiel_id = $1', [spiel.id])).toEqual([{ n: 0 }])

      const s = await rpc<SchuelerZustand & { runde: number }>(db, ANONYM, 'spiel_zustand_schueler', [fuchs.spieler_id, fuchs.token])
      expect(s).toMatchObject({ status: 'lobby', runde: 2, punkte })
    })

    it('in Runde 2 kann wieder Frage 1 beantwortet werden und die Punkte addieren sich', async () => {
      const vorher = (await zustandL()).spieler[0].punkte
      await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
      await rpc(db, ANONYM, 'antwort_abgeben', [fuchs.spieler_id, fuchs.token, 0, json(true)])
      expect((await zustandL()).spieler[0].punkte).toBeGreaterThan(vorher)
    })

    it('nur mit eigenen Quizzen und nur im eigenen Spiel', async () => {
      await bisZumEnde()
      expect((await zustandL()).status).toBe('ende')
      const fremdesQuiz = await rpc<string>(db, B, 'quiz_speichern', [null, 'Von B', json(FRAGEN)])
      await expect(rpc(db, A, 'spiel_naechste_runde', [spiel.id, fremdesQuiz])).rejects.toThrow('Quiz nicht gefunden')
      await expect(rpc(db, B, 'spiel_naechste_runde', [spiel.id, fremdesQuiz])).rejects.toThrow('Spiel nicht gefunden')
      await expect(rpc(db, ANONYM, 'spiel_naechste_runde', [spiel.id, quiz2])).rejects.toThrow(/permission denied/)
    })
  })

  describe('Aufgaben: Selbstlernen, Hausaufgabe, Prüfung', () => {
    type Erstellt = { id: string; code: string }
    type Oeffnen = { modus: string; titel: string; offen: boolean; anzahl_fragen: number; fragen: { typ: string; ansicht: unknown }[] | null }
    type Beitritt = { teilnehmer_id: string; token: string; name: string }
    type Zustand = { name: string; abgegeben: boolean; punkte: number | null; fragen: unknown[]; antworten: Record<string, unknown>[] }
    type Ergebnis = {
      modus: string
      offen: boolean
      statistik: { frage_nr: number; versuche: number; richtig: number }[]
      teilnehmer: { id: string; spitzname: string | null; code: string | null; punkte: number; aktiv: boolean; abgegeben_am: string | null; antworten: unknown[] }[]
    }
    const inTagen = (t: number) => new Date(Date.now() + t * 86400_000).toISOString()
    const antworten = (code: string, b: Beitritt | null, nr: number, a: unknown) =>
      rpc<Record<string, unknown>>(db, ANONYM, 'aufgabe_antworten', [code, b?.teilnehmer_id ?? null, b?.token ?? null, nr, json(a)])

    describe('Selbstlernen (anonym)', () => {
      let auf: Erstellt
      it('Fragen ohne Lösung, Antworten zählen nur anonym pro Frage', async () => {
        auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'selbstlernen', null, null])
        expect(auf.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
        const o = await rpc<Oeffnen>(db, ANONYM, 'aufgabe_oeffnen', [auf.code.toLowerCase()])
        expect(o).toMatchObject({ modus: 'selbstlernen', titel: 'Erdkunde', offen: true, anzahl_fragen: 4 })
        expect(JSON.stringify(o.fragen)).not.toMatch(/"richtig"/)

        expect(await antworten(auf.code, null, 0, [1])).toEqual({ anteil: 1, loesung: [1] })
        expect(await antworten(auf.code, null, 0, [0])).toEqual({ anteil: 0, loesung: [1] })
        await antworten(auf.code, null, 1, true)
        const e = await rpc<Ergebnis>(db, A, 'aufgabe_ergebnisse', [auf.id])
        expect(e.statistik).toEqual([
          expect.objectContaining({ frage_nr: 0, versuche: 2, richtig: 1 }),
          expect.objectContaining({ frage_nr: 1, versuche: 1, richtig: 1 }),
        ])
        expect(e.teilnehmer).toEqual([])
      })
      it('man kann keinen Namen angeben, ungültige Antworten werden abgelehnt', async () => {
        await expect(rpc(db, ANONYM, 'aufgabe_beitreten', [auf.code, 'Fuchs'])).rejects.toThrow('keinen Namen')
        await expect(antworten(auf.code, null, 0, 'quatsch')).rejects.toThrow('Ungültige Antwort')
        await expect(antworten(auf.code, null, 9, [1])).rejects.toThrow('Frage gibt es nicht')
        await expect(rpc(db, ANONYM, 'aufgabe_oeffnen', ['XXXXXX'])).rejects.toThrow('gibt es nicht')
      })
    })

    describe('Hausaufgabe (Spitzname, Frist höchstens 14 Tage)', () => {
      let auf: Erstellt
      let fuchs: Beitritt
      it('Frist ist Pflicht und höchstens 14 Tage, gelöscht wird 7 Tage nach der Frist', async () => {
        await expect(rpc(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', null, null])).rejects.toThrow('höchstens 14 Tagen')
        await expect(rpc(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(15), null])).rejects.toThrow('höchstens 14 Tagen')
        await expect(rpc(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(-1), null])).rejects.toThrow('Zukunft')
        auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(3), null])
        const [z] = await als<{ tage: number }>(db, A, 'select extract(day from loeschen_am - frist)::int as tage from public.aufgaben where id = $1', [auf.id])
        expect(z.tage).toBe(7)
      })
      it('Fragen gibt es erst nach dem Beitreten, Spitznamen sind eindeutig', async () => {
        expect((await rpc<Oeffnen>(db, ANONYM, 'aufgabe_oeffnen', [auf.code])).fragen).toBeNull()
        fuchs = await rpc<Beitritt>(db, ANONYM, 'aufgabe_beitreten', [auf.code, ' Fuchs '])
        expect(fuchs.name).toBe('Fuchs')
        await expect(rpc(db, ANONYM, 'aufgabe_beitreten', [auf.code, 'fuchs'])).rejects.toThrow('schon vergeben')
        await expect(rpc(db, ANONYM, 'aufgabe_beitreten', [auf.code, ''])).rejects.toThrow('1 bis 20')
        const z = await rpc<Zustand>(db, ANONYM, 'aufgabe_zustand', [fuchs.teilnehmer_id, fuchs.token])
        expect(z).toMatchObject({ name: 'Fuchs', abgegeben: false, punkte: 0, antworten: [] })
        expect(z.fragen).toHaveLength(4)
        expect(await rpc(db, ANONYM, 'aufgabe_zustand', [fuchs.teilnehmer_id, '00000000-0000-4000-8000-000000000000'])).toBeNull()
      })
      it('jede Frage einmal, mit Ergebnis und Lösung; nach der letzten ist abgegeben', async () => {
        expect(await antworten(auf.code, fuchs, 0, [1])).toEqual({ anteil: 1, punkte: 1000, abgegeben: false, zu_spaet: false, loesung: [1] })
        await expect(antworten(auf.code, fuchs, 0, [1])).rejects.toThrow('schon beantwortet')
        expect(await antworten(auf.code, fuchs, 1, false)).toMatchObject({ anteil: 0, punkte: 0, loesung: true })
        expect(await antworten(auf.code, fuchs, 3, [0])).toMatchObject({ abgegeben: true }) // Folie (Nr. 2) zählt nicht
        const z = await rpc<Zustand>(db, ANONYM, 'aufgabe_zustand', [fuchs.teilnehmer_id, fuchs.token])
        expect(z).toMatchObject({ abgegeben: true, punkte: 1000 })
        expect(z.antworten[0]).toEqual({ frage_nr: 0, anteil: 1, punkte: 1000, zu_spaet: false, loesung: [1] })
        await expect(antworten(auf.code, null, 0, [1])).rejects.toThrow('nicht (mehr) bei dieser Aufgabe')
      })
      it('die Lehrkraft sieht Spitznamen und Punkte, aber keinen Schlüssel', async () => {
        const e = await rpc<Ergebnis>(db, A, 'aufgabe_ergebnisse', [auf.id])
        expect(e.teilnehmer).toEqual([expect.objectContaining({ spitzname: 'Fuchs', code: null, punkte: 1000, antworten: expect.any(Array) })])
        expect(e.teilnehmer[0].abgegeben_am).not.toBeNull()
        expect(JSON.stringify(e)).not.toContain(fuchs.token)
        await expect(als(db, A, 'select token from public.aufgabe_teilnehmer')).rejects.toThrow(/permission denied/)
      })
      it('nach dem Beenden geht nichts mehr', async () => {
        await expect(rpc(db, B, 'aufgabe_schliessen', [auf.id])).rejects.toThrow('nicht gefunden')
        await rpc(db, A, 'aufgabe_schliessen', [auf.id])
        expect((await rpc<Oeffnen>(db, ANONYM, 'aufgabe_oeffnen', [auf.code])).offen).toBe(false)
        await expect(rpc(db, ANONYM, 'aufgabe_beitreten', [auf.code, 'Igel'])).rejects.toThrow('schon beendet')
      })
    })

    describe('Prüfung (Pseudonym-Codes)', () => {
      let auf: Erstellt
      let codes: string[]
      let b: Beitritt
      it('erzeugt die gewünschte Zahl eindeutiger Codes, gelöscht wird nach 30 Tagen', async () => {
        await expect(rpc(db, A, 'aufgabe_erstellen', [quizId, 'pruefung', inTagen(1), 0])).rejects.toThrow('1 bis 60')
        await expect(rpc(db, A, 'aufgabe_erstellen', [quizId, 'pruefung', inTagen(31), 5])).rejects.toThrow('30 Tagen')
        auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'pruefung', inTagen(1), 25])
        const e = await rpc<Ergebnis>(db, A, 'aufgabe_ergebnisse', [auf.id])
        codes = e.teilnehmer.map((t) => t.code!)
        expect(codes).toHaveLength(25)
        expect(new Set(codes).size).toBe(25)
        codes.forEach((c) => expect(c).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/))
        expect(e.teilnehmer.every((t) => t.spitzname === null)).toBe(true)
        const [z] = await als<{ tage: number }>(db, A, 'select extract(day from loeschen_am - erstellt_am)::int as tage from public.aufgaben where id = $1', [auf.id])
        expect(z.tage).toBe(30)
      })
      it('beitreten nur mit gültigem Code, jeder Code nur auf einem Gerät', async () => {
        await expect(rpc(db, ANONYM, 'aufgabe_beitreten', [auf.code, 'ZZZ-ZZZ'])).rejects.toThrow('gibt es nicht')
        b = await rpc<Beitritt>(db, ANONYM, 'aufgabe_beitreten', [auf.code, codes[0].replace('-', ' ').toLowerCase()])
        expect(b.name).toBe(codes[0])
        await expect(rpc(db, ANONYM, 'aufgabe_beitreten', [auf.code, codes[0]])).rejects.toThrow('anderen Gerät')
      })
      it('keine Lösung und kein Ergebnis für Schüler', async () => {
        expect(await antworten(auf.code, b, 0, [0])).toEqual({ ok: true, abgegeben: false, zu_spaet: false })
        const z = await rpc<Zustand>(db, ANONYM, 'aufgabe_zustand', [b.teilnehmer_id, b.token])
        expect(z.punkte).toBeNull()
        expect(z.antworten).toEqual([{ frage_nr: 0 }])
        expect(JSON.stringify(z)).not.toMatch(/"richtig"|"loesung"|"anteil"/)
      })
      it('Lehrkraft kann einen Code freigeben, die Antworten bleiben', async () => {
        const t = (await rpc<Ergebnis>(db, A, 'aufgabe_ergebnisse', [auf.id])).teilnehmer.find((x) => x.code === codes[0])!
        expect(t.aktiv).toBe(true)
        await expect(rpc(db, B, 'pruefung_code_freigeben', [t.id])).rejects.toThrow('nicht gefunden')
        await rpc(db, A, 'pruefung_code_freigeben', [t.id])
        expect(await rpc(db, ANONYM, 'aufgabe_zustand', [b.teilnehmer_id, b.token])).toBeNull()
        const neu = await rpc<Beitritt>(db, ANONYM, 'aufgabe_beitreten', [auf.code, codes[0]])
        const z = await rpc<Zustand>(db, ANONYM, 'aufgabe_zustand', [neu.teilnehmer_id, neu.token])
        expect(z.antworten).toEqual([{ frage_nr: 0 }])
      })
    })

    describe('Zeitlimit pro Frage (Hausaufgabe, Prüfung)', () => {
      type Offen = { frage: { typ: string; text: string; zeitlimit: number }; restzeit_ms: number | null }
      type ZZustand = Omit<Zustand, 'fragen'> & { mit_zeit: boolean; geoeffnet: { frage_nr: number; restzeit_ms: number }[]; fragen: { text: string; zeitlimit: number; verdeckt?: boolean }[] }
      const oeffnen = (b: Beitritt, nr: number) => rpc<Offen>(db, ANONYM, 'aufgabe_frage_oeffnen', [b.teilnehmer_id, b.token, nr])
      const zustand = (b: Beitritt) => rpc<ZZustand>(db, ANONYM, 'aufgabe_zustand', [b.teilnehmer_id, b.token])
      const zurueckdrehen = (b: Beitritt, sekunden: number) =>
        db.query(`update public.aufgabe_gestartet set gestartet_am = now() - make_interval(secs => $2) where teilnehmer_id = $1`, [b.teilnehmer_id, sekunden])

      it('nur für Hausaufgabe und Prüfung, feste Zeit zwischen 10 und 600 Sekunden', async () => {
        await expect(rpc(db, A, 'aufgabe_erstellen', [quizId, 'selbstlernen', null, null, 0])).rejects.toThrow('kein Zeitlimit')
        await expect(rpc(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(2), null, 5])).rejects.toThrow('10 Sekunden')
        await expect(rpc(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(2), null, 601])).rejects.toThrow('10 Minuten')
        const ohne = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(2), null])
        const b = await rpc<Beitritt>(db, ANONYM, 'aufgabe_beitreten', [ohne.code, 'Ohne'])
        const z = await zustand(b)
        expect(z.mit_zeit).toBe(false)
        expect(z.fragen.every((f) => !f.verdeckt && f.zeitlimit === 0 && f.text)).toBe(true)
      })

      it('Fragen sind verdeckt, bis man sie öffnet – Zeiten aus dem Quiz', async () => {
        const auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(2), null, 0])
        const b = await rpc<Beitritt>(db, ANONYM, 'aufgabe_beitreten', [auf.code, 'Uhu'])
        const z = await zustand(b)
        expect(z.mit_zeit).toBe(true)
        expect(z.fragen.map((f) => [f.text, f.zeitlimit, !!f.verdeckt])).toEqual([
          ['', 20, true],
          ['', 10, true],
          ['Jetzt kommt eine Umfrage', 0, false], // Folien haben keine Zeit und sind nie verdeckt
          ['', 20, true],
        ])
        expect(JSON.stringify(z.fragen)).not.toContain('Paris')
        await expect(antworten(auf.code, b, 0, [1])).rejects.toThrow('zuerst')
        const o = await oeffnen(b, 0)
        expect(o.frage.text).toBe('Hauptstadt von Frankreich?')
        expect(o.restzeit_ms).toBeGreaterThan(18_000)
        expect(o.restzeit_ms).toBeLessThanOrEqual(20_000)
        // nochmal öffnen (z. B. Neuladen) startet die Zeit nicht neu
        await zurueckdrehen(b, 15)
        expect((await oeffnen(b, 0)).restzeit_ms).toBeLessThanOrEqual(5_000)
        const z2 = await zustand(b)
        expect(z2.fragen[0]).toMatchObject({ text: 'Hauptstadt von Frankreich?' })
        expect(z2.geoeffnet).toEqual([{ frage_nr: 0, restzeit_ms: expect.any(Number) }])
        expect(await antworten(auf.code, b, 0, [1])).toMatchObject({ anteil: 1, punkte: 1000, zu_spaet: false })
        expect((await zustand(b)).geoeffnet).toEqual([])
        await expect(oeffnen(b, 0)).rejects.toThrow('schon beantwortet')
      })

      it('zu spät oder ohne Antwort: zählt als beantwortet, aber 0 Punkte', async () => {
        const auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(2), null, 30])
        const b = await rpc<Beitritt>(db, ANONYM, 'aufgabe_beitreten', [auf.code, 'Spatz'])
        expect((await oeffnen(b, 0)).restzeit_ms).toBeGreaterThan(28_000) // feste Zeit statt 20 s aus dem Quiz
        await zurueckdrehen(b, 40) // über 30 s + Kulanz
        expect((await oeffnen(b, 0)).restzeit_ms).toBe(0)
        expect(await antworten(auf.code, b, 0, [1])).toMatchObject({ anteil: 0, punkte: 0, zu_spaet: true, loesung: [1] })
        await oeffnen(b, 1)
        expect(await antworten(auf.code, b, 1, null)).toMatchObject({ anteil: 0, punkte: 0, zu_spaet: true }) // Zeit abgelaufen
        await oeffnen(b, 3)
        expect(await antworten(auf.code, b, 3, [0])).toMatchObject({ abgegeben: true })
        const e = await rpc<Ergebnis & { mit_zeit: boolean }>(db, A, 'aufgabe_ergebnisse', [auf.id])
        expect(e.mit_zeit).toBe(true)
        expect(e.teilnehmer[0].antworten).toEqual([
          expect.objectContaining({ frage_nr: 0, anteil: 0, zu_spaet: true }),
          expect.objectContaining({ frage_nr: 1, antwort: null, zu_spaet: true }),
          expect.objectContaining({ frage_nr: 3, zu_spaet: false }),
        ])
      })

      it('auch bei der Prüfung; Öffnen-Zeiten sind für niemanden direkt lesbar', async () => {
        const auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'pruefung', inTagen(1), 1, 60])
        const [{ code }] = await als<{ code: string }>(db, A, 'select code from public.aufgabe_teilnehmer where aufgabe_id = $1', [auf.id])
        const b = await rpc<Beitritt>(db, ANONYM, 'aufgabe_beitreten', [auf.code, code])
        await oeffnen(b, 0)
        expect(await antworten(auf.code, b, 0, [1])).toEqual({ ok: true, abgegeben: false, zu_spaet: false })
        await expect(als(db, ANONYM, 'select * from public.aufgabe_gestartet')).rejects.toThrow(/permission denied/)
        await expect(als(db, A, 'select * from public.aufgabe_gestartet')).rejects.toThrow(/permission denied/)
        await expect(rpc(db, ANONYM, 'aufgabe_frage_oeffnen', [b.teilnehmer_id, '00000000-0000-4000-8000-000000000000', 1])).rejects.toThrow('nicht (mehr)')
        for (const f of ['aufgabe_restzeit', 'aufgabe_frage_schueler', 'aufgabe_fragen_teilnehmer', 'aufgabe_kulanz']) {
          const [{ n }] = await als<{ n: boolean }>(db, A, `select has_function_privilege('anon', p.oid, 'execute') as n from pg_proc p where proname = $1`, [f])
          expect(n).toBe(false)
        }
      })
    })

    describe('Rechte und automatisches Löschen', () => {
      it('Schüler haben keinen Tabellenzugriff, fremde Lehrkräfte sehen nichts', async () => {
        for (const t of ['aufgaben', 'aufgabe_teilnehmer', 'aufgabe_antworten', 'aufgabe_statistik']) {
          await expect(als(db, ANONYM, `select * from public.${t}`)).rejects.toThrow(/permission denied/)
        }
        expect(await als(db, B, 'select id from public.aufgaben')).toEqual([])
        expect(await rpc(db, B, 'aufgaben_liste', [])).toEqual([])
        const liste = await rpc<{ modus: string }[]>(db, A, 'aufgaben_liste', [])
        expect([...new Set(liste.map((x) => x.modus))].sort()).toEqual(['hausaufgabe', 'pruefung', 'selbstlernen'])
        for (const f of ['aufgaben_liste', 'aufgaben_aufraeumen', 'zufallscode']) {
          await expect(rpc(db, ANONYM, f, f === 'zufallscode' ? [6] : [])).rejects.toThrow(/permission denied/)
        }
        await expect(rpc(db, ANONYM, 'aufgabe_erstellen', [quizId, 'selbstlernen', null, null])).rejects.toThrow(/permission denied/)
        await expect(rpc(db, B, 'aufgabe_erstellen', [quizId, 'selbstlernen', null, null])).rejects.toThrow('Quiz nicht gefunden')
      })
      it('nach Ablauf wird alles gelöscht (Aufgabe, Teilnehmer, Antworten)', async () => {
        const auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'hausaufgabe', inTagen(1), null])
        const b = await rpc<Beitritt>(db, ANONYM, 'aufgabe_beitreten', [auf.code, 'Dachs'])
        await antworten(auf.code, b, 0, [1])
        // Zeit vorspulen: Löschdatum in die Vergangenheit setzen
        await db.query(`update public.aufgaben set loeschen_am = now() - interval '1 minute' where id = $1`, [auf.id])
        await expect(rpc(db, ANONYM, 'aufgabe_oeffnen', [auf.code])).rejects.toThrow('gibt es nicht')
        expect(await rpc(db, ANONYM, 'aufgabe_zustand', [b.teilnehmer_id, b.token])).toBeNull()
        await rpc(db, A, 'aufgaben_liste', [])
        const rest = await db.query<{ n: number }>(
          `select (select count(*) from public.aufgaben where id = $1)
                + (select count(*) from public.aufgabe_teilnehmer where aufgabe_id = $1)
                + (select count(*) from public.aufgabe_antworten where aufgabe_id = $1) as n`,
          [auf.id],
        )
        expect(Number(rest.rows[0].n)).toBe(0)
      })
      it('auch das Aufräumen der Live-Spiele löscht abgelaufene Aufgaben', async () => {
        const auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'pruefung', inTagen(1), 1])
        await db.query(`update public.aufgaben set loeschen_am = now() - interval '1 minute' where id = $1`, [auf.id])
        await db.query('select public.spiele_aufraeumen()')
        expect((await db.query('select 1 from public.aufgaben where id = $1', [auf.id])).rows).toEqual([])
      })
      it('Lehrkraft kann eigene Aufgaben jederzeit löschen', async () => {
        const auf = await rpc<Erstellt>(db, A, 'aufgabe_erstellen', [quizId, 'selbstlernen', null, null])
        await als(db, B, 'delete from public.aufgaben where id = $1', [auf.id])
        expect(await als(db, A, 'select id from public.aufgaben where id = $1', [auf.id])).toHaveLength(1)
        await als(db, A, 'delete from public.aufgaben where id = $1', [auf.id])
        expect(await als(db, A, 'select id from public.aufgaben where id = $1', [auf.id])).toEqual([])
      })
    })
  })

  describe('Schüler sehen bei keinem Fragetyp die Lösung vorab', () => {
    const typen: F[] = [
      { typ: 'auswahl', text: 'x', inhalt: { antworten: ['a', 'b', 'c'], richtig: [0, 2] } },
      { typ: 'wahrfalsch', text: 'x', inhalt: { richtig: true } },
      { typ: 'freitext', text: 'x', inhalt: { loesungen: ['Geheimwort'] } },
      { typ: 'reihenfolge', text: 'x', inhalt: { elemente: ['a', 'b', 'c', 'd', 'e', 'f'] } },
      { typ: 'zuordnung', text: 'x', inhalt: { paare: [{ links: 'L1', rechts: 'R1' }, { links: 'L2', rechts: 'R2' }] } },
      { typ: 'schieberegler', text: 'x', inhalt: { min: 0, max: 100, schritt: 1, richtig: 42, toleranz: 0, einheit: 'kg' } },
    ]
    it.each(typen)('$typ', async (f) => {
      const id = await rpc<string>(db, A, 'quiz_speichern', [null, 'Geheim ' + f.typ, json([f])])
      const sp = await rpc<{ id: string; pin: string }>(db, A, 'spiel_erstellen', [id])
      const b = await rpc<Beitritt>(db, ANONYM, 'spiel_beitreten', [sp.pin, 'Tester'])
      await rpc(db, A, 'spiel_steuern', [sp.id, 'weiter'])
      const z = await rpc<SchuelerZustand>(db, ANONYM, 'spiel_zustand_schueler', [b.spieler_id, b.token])
      const text = JSON.stringify(z.frage)
      expect(text).not.toMatch(/"richtig"|"loesungen"|"paare"|Geheimwort|42/)
      expect(z.loesung).toBeNull()
      if (f.typ === 'zuordnung') expect(z.frage?.ansicht).toMatchObject({ links: ['L1', 'L2'] })
    })
  })
})
