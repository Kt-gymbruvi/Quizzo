// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { ANONYM, LEHRKRAFT_A, LEHRKRAFT_B, als, lehrkraft, neueDatenbank, rpc } from './datenbank.ts'

const A = lehrkraft(LEHRKRAFT_A)
const B = lehrkraft(LEHRKRAFT_B)

const FRAGEN = [
  { text: 'Hauptstadt von Frankreich?', antworten: ['Lyon', 'Paris', 'Nizza'], richtig: 1, zeitlimit: 20 },
  { text: '2 + 2?', antworten: ['4', '5'], richtig: 0, zeitlimit: 10 },
]

type Beitritt = { spiel_id: string; spieler_id: string; token: string; spitzname: string }
type SchuelerZustand = {
  status: string
  frage_nr: number
  punkte: number
  platz: number
  frage: { text: string; antworten: string[]; zeitlimit: number } | null
  meine_antwort: { antwort: number; richtig?: boolean; punkte?: number } | null
  richtige_antwort: number | null
}
type LehrkraftZustand = { status: string; frage_nr: number; beantwortet: number; verteilung: number[]; spieler: { spitzname: string; punkte: number }[] }

let db: PGlite
let quizId: string

beforeAll(async () => {
  db = await neueDatenbank()
  quizId = await rpc<string>(db, A, 'quiz_speichern', [null, 'Erdkunde', JSON.stringify(FRAGEN)])
}, 60_000)

describe('Quizze: Row Level Security', () => {
  it('Lehrkraft A sieht ihr Quiz mit allen Fragen', async () => {
    expect(await als(db, A, 'select titel from public.quizze')).toEqual([{ titel: 'Erdkunde' }])
    expect(await als(db, A, 'select count(*)::int as n from public.fragen')).toEqual([{ n: 2 }])
  })

  it('Lehrkraft B sieht weder Quizze noch Fragen von A', async () => {
    expect(await als(db, B, 'select * from public.quizze')).toEqual([])
    expect(await als(db, B, 'select * from public.fragen')).toEqual([])
  })

  it('Lehrkraft B kann As Quiz weder ändern noch löschen', async () => {
    await expect(rpc(db, B, 'quiz_speichern', [quizId, 'Gehackt', JSON.stringify(FRAGEN)])).rejects.toThrow('Quiz nicht gefunden')
    await als(db, B, 'update public.quizze set titel = $1 where id = $2', ['Gehackt', quizId])
    await als(db, B, 'delete from public.quizze where id = $1', [quizId])
    await als(db, B, 'delete from public.fragen where quiz_id = $1', [quizId])
    expect(await als(db, A, 'select titel from public.quizze')).toEqual([{ titel: 'Erdkunde' }])
    expect(await als(db, A, 'select count(*)::int as n from public.fragen')).toEqual([{ n: 2 }])
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

describe('Live-Spiel', () => {
  let spiel: { id: string; pin: string }
  let fuchs: Beitritt
  let eule: Beitritt

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
    expect(fuchs.token).toBeTruthy()
  })

  it('lehnt doppelte Spitznamen, falsche PIN und zu lange Namen ab', async () => {
    await expect(rpc(db, ANONYM, 'spiel_beitreten', [spiel.pin, 'eule'])).rejects.toThrow('schon vergeben')
    await expect(rpc(db, ANONYM, 'spiel_beitreten', ['000000', 'Neu'])).rejects.toThrow('Kein laufendes Spiel')
    await expect(rpc(db, ANONYM, 'spiel_beitreten', [spiel.pin, 'x'.repeat(21)])).rejects.toThrow('1 bis 20 Zeichen')
    await expect(rpc(db, ANONYM, 'spiel_beitreten', [spiel.pin, '   '])).rejects.toThrow('1 bis 20 Zeichen')
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

  it('erste Frage: Schüler sehen Frage und Antworten, aber nicht die richtige Lösung', async () => {
    await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
    const z = await rpc<SchuelerZustand>(db, ANONYM, 'spiel_zustand_schueler', [fuchs.spieler_id, fuchs.token])
    expect(z.status).toBe('frage')
    expect(z.frage).toEqual({ text: 'Hauptstadt von Frankreich?', antworten: ['Lyon', 'Paris', 'Nizza'], zeitlimit: 20 })
    expect(JSON.stringify(z)).not.toContain('"richtig"')
    expect(z.richtige_antwort).toBeNull()
  })

  it('falscher Schlüssel: kein Zugriff', async () => {
    expect(await rpc(db, ANONYM, 'spiel_zustand_schueler', [fuchs.spieler_id, eule.token])).toBeNull()
    await expect(rpc(db, ANONYM, 'antwort_abgeben', [fuchs.spieler_id, eule.token, 0, 1])).rejects.toThrow('nicht (mehr) in diesem Spiel')
  })

  it('richtige Antwort gibt 500–1000 Punkte, zweimal antworten geht nicht', async () => {
    await rpc(db, ANONYM, 'antwort_abgeben', [fuchs.spieler_id, fuchs.token, 0, 1])
    await expect(rpc(db, ANONYM, 'antwort_abgeben', [fuchs.spieler_id, fuchs.token, 0, 2])).rejects.toThrow('schon beantwortet')
    const z = await rpc<SchuelerZustand>(db, ANONYM, 'spiel_zustand_schueler', [fuchs.spieler_id, fuchs.token])
    expect(z.punkte).toBeGreaterThanOrEqual(500)
    expect(z.punkte).toBeLessThanOrEqual(1000)
    expect(z.meine_antwort).toEqual({ antwort: 1 }) // Ergebnis erst nach Auflösung
  })

  it('nach Ablauf der Zeit werden keine Antworten mehr angenommen', async () => {
    await db.query(`update public.spiele set frage_start = now() - interval '25 seconds' where id = $1`, [spiel.id])
    await expect(rpc(db, ANONYM, 'antwort_abgeben', [eule.spieler_id, eule.token, 0, 0])).rejects.toThrow('Zeit ist abgelaufen')
  })

  it('ungültige Antwortnummern werden abgelehnt', async () => {
    await db.query(`update public.spiele set frage_start = now() where id = $1`, [spiel.id])
    await expect(rpc(db, ANONYM, 'antwort_abgeben', [eule.spieler_id, eule.token, 0, 3])).rejects.toThrow('Ungültige Antwort')
    await rpc(db, ANONYM, 'antwort_abgeben', [eule.spieler_id, eule.token, 0, 0]) // falsch
  })

  it('Lehrkraft sieht, wie viele geantwortet haben und wie die Antworten verteilt sind', async () => {
    const z = await rpc<LehrkraftZustand>(db, A, 'spiel_zustand_lehrkraft', [spiel.id])
    expect(z.beantwortet).toBe(2)
    expect(z.verteilung).toEqual([1, 1, 0])
    expect(z.spieler[0].spitzname).toBe('Schlauer Fuchs')
  })

  it('nach dem Auflösen sehen Schüler ihr Ergebnis und die richtige Antwort', async () => {
    await rpc(db, A, 'spiel_steuern', [spiel.id, 'aufloesen'])
    const f = await rpc<SchuelerZustand>(db, ANONYM, 'spiel_zustand_schueler', [fuchs.spieler_id, fuchs.token])
    const e = await rpc<SchuelerZustand>(db, ANONYM, 'spiel_zustand_schueler', [eule.spieler_id, eule.token])
    expect(f.meine_antwort?.richtig).toBe(true)
    expect(f.platz).toBe(1)
    expect(e.meine_antwort).toEqual({ antwort: 0, richtig: false, punkte: 0 })
    expect(e.platz).toBe(2)
    expect(e.richtige_antwort).toBe(1)
  })

  it('nach der Auflösung kann nicht mehr geantwortet werden', async () => {
    await expect(rpc(db, ANONYM, 'antwort_abgeben', [eule.spieler_id, eule.token, 0, 1])).rejects.toThrow('schon vorbei')
  })

  it('nach der letzten Frage endet das Spiel; danach kann niemand mehr beitreten', async () => {
    await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter']) // Frage 2
    await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter']) // doppelter Klick: ignoriert
    expect((await rpc<LehrkraftZustand>(db, A, 'spiel_zustand_lehrkraft', [spiel.id])).frage_nr).toBe(1)
    await rpc(db, A, 'spiel_steuern', [spiel.id, 'aufloesen'])
    await rpc(db, A, 'spiel_steuern', [spiel.id, 'weiter'])
    expect((await rpc<LehrkraftZustand>(db, A, 'spiel_zustand_lehrkraft', [spiel.id])).status).toBe('ende')
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
    expect(await rpc(db, ANONYM, 'spiel_zustand_schueler', [fuchs.spieler_id, fuchs.token])).toBeNull()
    // Das Quiz selbst bleibt erhalten
    expect(await als(db, A, 'select titel from public.quizze')).toEqual([{ titel: 'Erdkunde' }])
  })

  it('liegengebliebene Spiele werden nach 6 Stunden automatisch gelöscht', async () => {
    const alt = await rpc<{ id: string }>(db, A, 'spiel_erstellen', [quizId])
    await rpc(db, ANONYM, 'spiel_beitreten', [(await db.query<{ pin: string }>('select pin from public.spiele where id = $1', [alt.id])).rows[0].pin, 'Igel'])
    await db.query(`update public.spiele set erstellt_am = now() - interval '7 hours' where id = $1`, [alt.id])
    const neu = await rpc<{ id: string; pin: string }>(db, A, 'spiel_erstellen', [quizId])
    const reste = await db.query<{ id: string }>('select id from public.spiele')
    expect(reste.rows.map((r) => r.id)).toEqual([neu.id])
    expect((await db.query<{ n: number }>('select count(*)::int as n from public.spieler')).rows[0].n).toBe(0)
  })

  it('die Aufräum-Funktion ist von außen nicht aufrufbar', async () => {
    await expect(rpc(db, ANONYM, 'spiele_aufraeumen', [])).rejects.toThrow(/permission denied/)
    await expect(rpc(db, A, 'spiele_aufraeumen', [])).rejects.toThrow(/permission denied/)
  })
})
