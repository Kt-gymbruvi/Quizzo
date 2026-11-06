// Wiederholung: Fragen, die ein Schüler im Live-Spiel falsch (oder gar nicht) beantwortet hat,
// werden NUR auf seinem eigenen Gerät gemerkt (localStorage) – nichts davon geht an den Server.
// Gespeichert werden Fragetext, Antwortmöglichkeiten und Lösung, kein Spitzname und keine Punkte.
// Höchstens 50 Fragen, jede höchstens 30 Tage; richtig geübte Fragen verschwinden.

import { FRAGETYPEN } from './fragetypen.ts'
import { normalisiere, type SchuelerFrage } from './spiel.ts'

export type Uebung = { id: string; frage: SchuelerFrage; loesung: unknown; gemerkt: number }

const SPEICHER = 'quizzo-wiederholung'
export const MAX_UEBUNGEN = 50
const HOECHSTENS_MS = 30 * 24 * 60 * 60 * 1000

/** Fragen, die sich zum Üben eignen (mit eindeutiger Lösung) */
export const uebbar = (f: SchuelerFrage) => FRAGETYPEN[f.typ].bewertet

/** Gleiche Frage = gleicher Typ, Text und Antwortmöglichkeiten (auch aus verschiedenen Spielen) */
function schluessel(f: SchuelerFrage): string {
  const ansicht = { ...f.ansicht } as Record<string, unknown>
  // Reihenfolge und Zuordnung werden in jedem Spiel anders gemischt – für den Vergleich sortieren
  for (const k of ['elemente', 'rechts']) if (Array.isArray(ansicht[k])) ansicht[k] = [...(ansicht[k] as string[])].sort()
  return JSON.stringify([f.typ, f.text, ansicht])
}

export function ladeUebungen(): Uebung[] {
  try {
    const roh = localStorage.getItem(SPEICHER)
    if (!roh) return []
    const alle = JSON.parse(roh) as Uebung[]
    const jetzt = Date.now()
    const gueltig = Array.isArray(alle) ? alle.filter((u) => u && u.frage && jetzt - u.gemerkt < HOECHSTENS_MS) : []
    if (gueltig.length !== alle.length) speichere(gueltig)
    return gueltig
  } catch {
    return []
  }
}

function speichere(liste: Uebung[]) {
  try {
    if (liste.length) localStorage.setItem(SPEICHER, JSON.stringify(liste))
    else localStorage.removeItem(SPEICHER)
  } catch {
    /* privater Modus o. Ä. – dann eben ohne Wiederholung */
  }
}

/** Merkt eine falsch beantwortete Frage (doppelte werden nur aktualisiert). */
export function merkeFehler(frage: SchuelerFrage, loesung: unknown) {
  if (!uebbar(frage) || loesung == null) return
  const id = schluessel(frage)
  const rest = ladeUebungen().filter((u) => u.id !== id)
  speichere([{ id, frage, loesung, gemerkt: Date.now() }, ...rest].slice(0, MAX_UEBUNGEN))
}

/** Nach dem Auflösen im Live-Spiel: falsch → merken, richtig → aus der Wiederholung streichen. */
export function merkeErgebnis(frage: SchuelerFrage, loesung: unknown, anteil: number | undefined) {
  if (!uebbar(frage)) return
  if ((anteil ?? 0) >= 1) entferneUebung(schluessel(frage))
  else merkeFehler(frage, loesung)
}

export function entferneUebung(id: string) {
  speichere(ladeUebungen().filter((u) => u.id !== id))
}

export function loescheAlleUebungen() {
  speichere([])
}

/** Bewertet eine Übungsantwort wie der Server (antwort_bewerten): Anteil richtig 0..1 */
export function bewerte(u: Uebung, a: unknown): number {
  const l = u.loesung
  switch (u.frage.typ) {
    case 'auswahl': {
      const sortiert = (x: unknown) => [...new Set(x as number[])].sort((p, q) => p - q).join(',')
      return sortiert(a) === sortiert(l) ? 1 : 0
    }
    case 'wahrfalsch':
      return a === l ? 1 : 0
    case 'freitext':
      return (l as string[]).some((x) => normalisiere(x) === normalisiere(String(a))) ? 1 : 0
    case 'reihenfolge':
      return JSON.stringify(a) === JSON.stringify(l) ? 1 : 0
    case 'zuordnung': {
      const paare = l as { links: string; rechts: string }[]
      const wahl = a as string[]
      return paare.filter((p, i) => wahl[i] === p.rechts).length / paare.length
    }
    case 'schieberegler': {
      const { richtig, toleranz } = l as { richtig: number; toleranz: number }
      const spanne = ((u.frage.ansicht.max ?? 100) - (u.frage.ansicht.min ?? 0)) / 4
      const diff = Math.abs(Number(a) - richtig)
      return diff <= toleranz ? 1 : Math.max(0, 1 - (diff - toleranz) / spanne)
    }
    default:
      return 0
  }
}
