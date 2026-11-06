import { db } from './supabase.ts'

export const MAX_ANTWORTEN = 4
export const ZEITLIMITS = [10, 20, 30, 60, 90, 120] as const

/** Frage, wie sie im Editor bearbeitet wird (immer 4 Antwortfelder, evtl. leer). */
export type EditorFrage = {
  text: string
  antworten: string[]
  richtig: number
  zeitlimit: number
}

/** Frage, wie sie gespeichert wird (nur ausgefüllte Antworten). */
export type GespeicherteFrage = EditorFrage

export type QuizUebersicht = {
  id: string
  titel: string
  geaendert_am: string
  anzahlFragen: number
}

export function neueFrage(): EditorFrage {
  return { text: '', antworten: Array(MAX_ANTWORTEN).fill(''), richtig: 0, zeitlimit: 20 }
}

/** Füllt eine gespeicherte Frage auf 4 Antwortfelder auf. */
export function zuEditorFrage(f: GespeicherteFrage): EditorFrage {
  const antworten = [...f.antworten]
  while (antworten.length < MAX_ANTWORTEN) antworten.push('')
  return { text: f.text, antworten, richtig: f.richtig, zeitlimit: f.zeitlimit }
}

/** Entfernt leere Antworten, kürzt Leerzeichen und passt den Index der richtigen Antwort an. */
export function bereinigeFrage(f: EditorFrage): GespeicherteFrage {
  const antworten: string[] = []
  let richtig = -1
  f.antworten.forEach((a, i) => {
    const t = a.trim()
    if (!t) return
    if (i === f.richtig) richtig = antworten.length
    antworten.push(t)
  })
  return { text: f.text.trim(), antworten, richtig, zeitlimit: f.zeitlimit }
}

/** Prüft ein Quiz vor dem Speichern. Liefert eine Liste verständlicher Fehlermeldungen. */
export function pruefeQuiz(titel: string, fragen: EditorFrage[]): string[] {
  const fehler: string[] = []
  if (!titel.trim()) fehler.push('Bitte gib dem Quiz einen Titel.')
  else if (titel.trim().length > 200) fehler.push('Der Titel darf höchstens 200 Zeichen lang sein.')
  if (fragen.length === 0) fehler.push('Das Quiz braucht mindestens eine Frage.')
  fragen.forEach((f, i) => {
    const nr = `Frage ${i + 1}`
    if (!f.text.trim()) fehler.push(`${nr}: Der Fragetext fehlt.`)
    else if (f.text.trim().length > 500) fehler.push(`${nr}: Der Fragetext ist zu lang (höchstens 500 Zeichen).`)
    const ausgefuellt = f.antworten.filter((a) => a.trim()).length
    if (ausgefuellt < 2) fehler.push(`${nr}: Bitte mindestens zwei Antworten ausfüllen.`)
    else if (!f.antworten[f.richtig]?.trim()) fehler.push(`${nr}: Die als richtig markierte Antwort ist leer.`)
  })
  return fehler
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

export async function ladeQuiz(id: string): Promise<{ titel: string; fragen: GespeicherteFrage[] }> {
  const { data, error } = await db()
    .from('quizze')
    .select('titel, fragen(position, text, antworten, richtig, zeitlimit)')
    .eq('id', id)
    .order('position', { referencedTable: 'fragen' })
    .single()
  if (error) throw error
  return {
    titel: data.titel as string,
    fragen: (data.fragen as (GespeicherteFrage & { position: number })[]).map(({ text, antworten, richtig, zeitlimit }) => ({
      text,
      antworten,
      richtig,
      zeitlimit,
    })),
  }
}

/** Speichert Titel und alle Fragen in einem Schritt. Liefert die Quiz-ID. */
export async function speichereQuiz(id: string | null, titel: string, fragen: EditorFrage[]): Promise<string> {
  const { data, error } = await db().rpc('quiz_speichern', {
    p_id: id,
    p_titel: titel.trim(),
    p_fragen: fragen.map(bereinigeFrage),
  })
  if (error) throw error
  return data as string
}

export async function loescheQuiz(id: string): Promise<void> {
  const { error } = await db().from('quizze').delete().eq('id', id)
  if (error) throw error
}
