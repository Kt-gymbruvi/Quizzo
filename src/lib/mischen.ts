// Mischen bei Hausaufgabe und Prüfung: Jede Person bekommt Fragen und Antwortmöglichkeiten in
// einer eigenen Reihenfolge. Der Zufall hängt fest an einem Schlüssel (Teilnehmer-ID), damit
// Neuladen nichts ändert. Fragen-Nummern und Antworten an den Server bleiben unverändert.
import type { SchuelerFrage } from './spiel.ts'

/** Wiederholbarer Zufall (0 ≤ x < 1) aus einem Text – gleicher Text, gleiche Folge. */
export function zufallAus(schluessel: string): () => number {
  let h = 2166136261
  for (let i = 0; i < schluessel.length; i++) h = Math.imul(h ^ schluessel.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates mit gegebenem Zufall */
export function gemischt<T>(liste: readonly T[], zufall: () => number): T[] {
  const l = [...liste]
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1))
    ;[l[i], l[j]] = [l[j], l[i]]
  }
  return l
}

/**
 * Reihenfolge der Fragen-Nummern für eine Person. Präsentationsfolien bleiben an ihrem Platz
 * (sie leiten oft die folgende Frage ein), nur die übrigen Fragen tauschen untereinander.
 */
export function fragenReihenfolge(fragen: readonly { typ: string }[], schluessel: string): number[] {
  const plaetze = fragen.map((f, i) => (f.typ === 'folie' ? -1 : i)).filter((i) => i >= 0)
  const neu = gemischt(plaetze, zufallAus(`fragen:${schluessel}`))
  let k = 0
  return fragen.map((f, i) => (f.typ === 'folie' ? i : neu[k++]))
}

/**
 * Antwortmöglichkeiten einer Frage mischen. Liefert die Frage zur Anzeige und eine Funktion,
 * die eine Antwort zurück ins Format der Datenbank übersetzt (bei Multiple Choice: Original-Nummern).
 */
export function mischeFrage(frage: SchuelerFrage, schluessel: string): { frage: SchuelerFrage; zurueck: (antwort: unknown) => unknown } {
  const zufall = zufallAus(`antworten:${schluessel}`)
  const a = frage.ansicht
  if ((frage.typ === 'auswahl' || frage.typ === 'umfrage') && a.antworten) {
    const ordnung = gemischt(a.antworten.map((_, i) => i), zufall)
    return {
      frage: { ...frage, ansicht: { ...a, antworten: ordnung.map((i) => a.antworten![i]) } },
      zurueck: (antwort) => (Array.isArray(antwort) ? antwort.map((i) => ordnung[i as number]).sort((x, y) => x - y) : antwort),
    }
  }
  // Texte (Elemente, Gegenstücke, Begriffe, Auswahl im Lückentext) werden als Text geschickt – nur die Anzeige ändert sich
  const neu = { ...a }
  for (const k of ['elemente', 'rechts', 'begriffe', 'optionen'] as const) {
    const liste = (a as Record<string, unknown>)[k]
    if (Array.isArray(liste)) (neu as Record<string, unknown>)[k] = gemischt(liste, zufall)
  }
  return { frage: { ...frage, ansicht: neu }, zurueck: (antwort) => antwort }
}
