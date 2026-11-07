import { db } from './supabase.ts'
import { bereinigeFrage, type Frage } from './fragetypen.ts'
import { pfadeIn, raeumeMedienAuf } from './medien.ts'
import { MAX_LAENGE, liegtIn, ordnerPfad, umbenannt } from './ordner.ts'

export type QuizUebersicht = {
  id: string
  titel: string
  geaendert_am: string
  anzahlFragen: number
  /** Ordner (null = ohne Ordner) */
  ordner: string | null
  /** zuletzt gespielt oder als Aufgabe verteilt */
  zuletztBenutzt: string | null
}

type QuizZeile = { id: string; titel: string; geaendert_am: string; ordner?: string | null; zuletzt_benutzt?: string | null; fragen: { count: number }[] | null }

export async function ladeQuizze(): Promise<QuizUebersicht[]> {
  const abfrage = (spalten: string) => db().from('quizze').select(spalten).order('geaendert_am', { ascending: false })
  let { data, error } = await abfrage('id, titel, geaendert_am, ordner, zuletzt_benutzt, fragen(count)')
  // Datenbank noch ohne Migration 008 (Ordner): ohne die neuen Spalten laden
  if (error && /ordner|zuletzt_benutzt/.test(error.message ?? '')) ({ data, error } = await abfrage('id, titel, geaendert_am, fragen(count)'))
  if (error) throw error
  return ((data ?? []) as unknown as QuizZeile[]).map((q) => ({
    id: q.id,
    titel: q.titel,
    geaendert_am: q.geaendert_am,
    anzahlFragen: q.fragen?.[0]?.count ?? 0,
    ordner: q.ordner ?? null,
    zuletztBenutzt: q.zuletzt_benutzt ?? null,
  }))
}

/** Prüft einen Ordnerpfad (z. B. „Oberstufe/Evolution“) und liefert ihn bereinigt; leer = ohne Ordner. */
export function pruefeOrdner(ordner: string | null): string | null {
  const pfad = ordnerPfad(ordner)
  if (pfad && pfad.length > MAX_LAENGE)
    throw new Error(`Der Ordnername ist zu lang: höchstens ${MAX_LAENGE} Zeichen, übergeordnete Ordner mitgezählt.`)
  return pfad
}

/** Quiz in einen Ordner legen (null = aus dem Ordner nehmen). Das Änderungsdatum bleibt. */
export async function verschiebeQuiz(id: string, ordner: string | null) {
  const { error } = await db().from('quizze').update({ ordner: pruefeOrdner(ordner) }).eq('id', id)
  if (error) throw error
}

/**
 * Ordner umbenennen oder verschieben (`neu` ist der ganze neue Pfad), mit `neu = null` auflösen.
 * Unterordner wandern mit; Quizze bleiben immer erhalten.
 */
export async function aendereOrdner(quizze: { id: string; ordner: string | null }[], alt: string, neu: string | null) {
  const ziel = pruefeOrdner(neu)
  if (ziel && liegtIn(ziel, alt) && ziel !== alt) throw new Error('Ein Ordner kann nicht in sich selbst verschoben werden.')
  const aenderungen = quizze.flatMap((q) => {
    const o = umbenannt(q.ordner, alt, ziel)
    return o === undefined ? [] : [{ id: q.id, ordner: pruefeOrdner(o) }]
  })
  const ergebnisse = await Promise.all(aenderungen.map((a) => db().from('quizze').update({ ordner: a.ordner }).eq('id', a.id)))
  const fehler = ergebnisse.find((e) => e.error)?.error
  if (fehler) throw fehler
}

/** Merkt sich „zuletzt benutzt“ (zum Sortieren). Fehler sind egal. */
export async function merkeBenutzt(id: string) {
  try {
    await db().from('quizze').update({ zuletzt_benutzt: new Date().toISOString() }).eq('id', id)
  } catch {
    /* nur eine Komfortfunktion */
  }
}

export async function ladeQuiz(id: string): Promise<{ titel: string; fragen: Frage[] }> {
  const { data, error } = await db()
    .from('quizze')
    .select('titel, fragen(position, typ, text, inhalt, zeitlimit, punkte, medium)')
    .eq('id', id)
    .order('position', { referencedTable: 'fragen' })
    .single()
  if (error) throw error
  return {
    titel: data.titel as string,
    fragen: (data.fragen as (Frage & { position: number })[]).map(
      ({ typ, text, inhalt, zeitlimit, punkte, medium }) => ({ typ, text, inhalt, zeitlimit, punkte, ...(medium ? { medium } : {}) }) as Frage,
    ),
  }
}

/** Speichert Titel und alle Fragen in einem Schritt (bereinigt). Liefert die Quiz-ID. */
export async function speichereQuiz(id: string | null, titel: string, fragen: Frage[]): Promise<string> {
  const { data, error } = await db().rpc('quiz_speichern', {
    p_id: id,
    p_titel: titel.trim(),
    p_fragen: fragen.map(bereinigeFrage),
  })
  if (error) throw error
  return data as string
}

/** Löscht das Quiz samt Fragen und danach die nicht mehr verwendeten Mediendateien. */
export async function loescheQuiz(id: string): Promise<void> {
  const { data } = await db().from('fragen').select('medium').eq('quiz_id', id)
  const pfade = pfadeIn((data ?? []) as { medium: Frage['medium'] }[])
  const { error } = await db().from('quizze').delete().eq('id', id)
  if (error) throw error
  if (pfade.length) await raeumeMedienAuf(pfade)
}
