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
