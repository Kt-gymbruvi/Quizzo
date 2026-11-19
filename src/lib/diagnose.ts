// Diagnose nach einem Live-Spiel: Welche Fragen waren schwer, welche falsche Antwort kam am häufigsten,
// wer braucht noch Hilfe? Nur für die Lehrkraft (nicht am Beamer zeigen).
// Es wird nichts zusätzlich gespeichert: Die Lehrkraft liest Spieler und Antworten ihres eigenen Spiels
// (RLS aus 002_spiel.sql), solange das Spiel nicht beendet ist. Beim Beenden ist alles gelöscht.

import { antwortAlsText } from './aufgaben.ts'
import { FRAGETYPEN, type Frage } from './fragetypen.ts'
import { ladeQuiz, speichereQuiz } from './quizze.ts'
import { normalisiere } from './spiel.ts'
import { db } from './supabase.ts'

export type DiagnoseSpieler = { id: string; spitzname: string }
export type DiagnoseAntwort = { spieler_id: string; frage_nr: number; antwort: unknown; anteil: number }
export type DiagnoseDaten = { titel: string; runde: number; fragen: Frage[]; spieler: DiagnoseSpieler[]; antworten: DiagnoseAntwort[] }

export type FragenAuswertung = {
  nr: number
  frage: Frage
  /** Durchschnitt aller Mitspielenden (keine Antwort = 0), 0..1; null bei Fragen ohne Wertung */
  quote: number | null
  beantwortet: number
  /** häufigste falsche Antwort (mindestens zweimal), als lesbarer Text */
  fehler: { text: string; anzahl: number } | null
}
export type SpielerAuswertung = {
  spieler: DiagnoseSpieler
  /** Anteil richtig je Frage (Index = Fragennummer); null = keine Antwort oder Frage ohne Wertung */
  anteile: (number | null)[]
  /** über alle bewerteten Fragen, 0..1 (keine Antwort = 0) */
  gesamt: number
}

/** Ab dieser Quote gilt eine Frage als „sitzt“ – darunter kommt sie in die Wiederholung */
export const SCHWELLE = 0.6

export async function ladeDiagnose(spielId: string): Promise<DiagnoseDaten> {
  const { data: spiel, error } = await db().from('spiele').select('quiz_id, runde').eq('id', spielId).single()
  if (error) throw error
  const s = spiel as { quiz_id: string; runde?: number }
  const [quiz, spieler, antworten] = await Promise.all([
    ladeQuiz(s.quiz_id),
    db().from('spieler').select('id, spitzname').eq('spiel_id', spielId),
    db().from('antworten').select('spieler_id, frage_nr, antwort, anteil').eq('spiel_id', spielId),
  ])
  if (spieler.error) throw spieler.error
  if (antworten.error) throw antworten.error
  return {
    titel: quiz.titel,
    runde: s.runde ?? 1,
    fragen: quiz.fragen,
    spieler: ((spieler.data ?? []) as DiagnoseSpieler[]).sort((a, b) => a.spitzname.localeCompare(b.spitzname, 'de')),
    antworten: (antworten.data ?? []) as DiagnoseAntwort[],
  }
}

const bewertet = (f: Frage) => FRAGETYPEN[f.typ].bewertet

/** Rechnet die Diagnose aus (reine Funktion, gut testbar). */
export function werteAus(d: Pick<DiagnoseDaten, 'fragen' | 'spieler' | 'antworten'>): { fragen: FragenAuswertung[]; spieler: SpielerAuswertung[] } {
  const anzahl = d.spieler.length
  const fragen = d.fragen.map((frage, nr): FragenAuswertung => {
    const zuFrage = d.antworten.filter((a) => a.frage_nr === nr)
    if (!bewertet(frage)) return { nr, frage, quote: null, beantwortet: zuFrage.length, fehler: null }
    const quote = anzahl ? zuFrage.reduce((s, a) => s + a.anteil, 0) / anzahl : 0
    // falsche Antworten gruppieren (Groß-/Kleinschreibung egal)
    const gruppen = new Map<string, { text: string; anzahl: number }>()
    for (const a of zuFrage.filter((x) => x.anteil < 1)) {
      const text = antwortAlsText({ typ: frage.typ, text: frage.text, inhalt: frage.inhalt as Record<string, unknown>, punkte: frage.punkte }, a.antwort)
      const k = normalisiere(text)
      if (!k) continue
      const g = gruppen.get(k)
      if (g) g.anzahl++
      else gruppen.set(k, { text, anzahl: 1 })
    }
    const haeufigste = [...gruppen.values()].sort((a, b) => b.anzahl - a.anzahl)[0]
    return { nr, frage, quote, beantwortet: zuFrage.length, fehler: haeufigste && haeufigste.anzahl >= 2 ? haeufigste : null }
  })
  const zaehlbar = fragen.filter((f) => f.quote !== null).map((f) => f.nr)
  const spieler = d.spieler
    .map((sp): SpielerAuswertung => {
      const anteile = d.fragen.map((f, nr) => (bewertet(f) ? (d.antworten.find((a) => a.spieler_id === sp.id && a.frage_nr === nr)?.anteil ?? null) : null))
      const gesamt = zaehlbar.length ? zaehlbar.reduce((s, nr) => s + (anteile[nr] ?? 0), 0) / zaehlbar.length : 0
      return { spieler: sp, anteile, gesamt }
    })
    .sort((a, b) => a.gesamt - b.gesamt || a.spieler.spitzname.localeCompare(b.spieler.spitzname, 'de'))
  return { fragen, spieler }
}

/** Fragen, die weniger als SCHWELLE richtig hatten (in Quiz-Reihenfolge) */
export const schwacheFragen = (auswertung: FragenAuswertung[]) => auswertung.filter((f) => f.quote !== null && f.quote < SCHWELLE).map((f) => f.frage)

/** Legt ein neues Quiz „<Titel> – Wiederholung“ mit den schwachen Fragen an. Liefert die Quiz-ID. */
export function erstelleWiederholungsQuiz(titel: string, fragen: Frage[]): Promise<string> {
  const zusatz = ' – Wiederholung'
  return speichereQuiz(null, titel.slice(0, 200 - zusatz.length) + zusatz, fragen)
}
