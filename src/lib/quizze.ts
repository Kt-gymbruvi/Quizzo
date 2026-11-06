import { db } from './supabase.ts'
import { bereinigeFrage, type Frage } from './fragetypen.ts'
import { pfadeIn, raeumeMedienAuf } from './medien.ts'

export type QuizUebersicht = {
  id: string
  titel: string
  geaendert_am: string
  anzahlFragen: number
}

export async function ladeQuizze(): Promise<QuizUebersicht[]> {
  const { data, error } = await db()
    .from('quizze')
    .select('id, titel, geaendert_am, fragen(count)')
    .order('geaendert_am', { ascending: false })
  if (error) throw error
  return (data ?? []).map((q) => ({
    id: q.id as string,
    titel: q.titel as string,
    geaendert_am: q.geaendert_am as string,
    anzahlFragen: (q.fragen as { count: number }[] | null)?.[0]?.count ?? 0,
  }))
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
