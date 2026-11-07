// Klassen-Duell (Jeopardy-Stil): Teams spielen am Beamer, ohne Handys.
// Jedes gewählte Quiz wird eine Kategorie, seine Fragen werden Felder mit 100 bis 500 Punkten.
// Es werden keine Daten auf dem Server gespeichert – der Spielstand liegt nur auf dem Lehrkraft-Gerät.
import { FRAGETYPEN, type Frage } from './fragetypen.ts'
import type { Ansicht, LehrkraftFrage } from './spiel.ts'
import { zahl } from '../spiel/Beamer.tsx'

export const MIN_KATEGORIEN = 2
export const MAX_KATEGORIEN = 6
export const MAX_TEAMS = 6

export type DuellEinstellung = {
  /** Quiz-IDs in der gewählten Reihenfolge = Kategorien */
  quizIds: string[]
  /** Anzahl Teams (2–6) */
  teams: number
  /** Fragen (Felder) pro Kategorie (3–5) */
  zeilen: number
  /** Fragen zufällig aus dem Quiz wählen statt der Reihe nach */
  zufall: boolean
  /** Falsche Antworten kosten Punkte */
  abzug: boolean
  /** Ein Handy pro Team als Buzzer (wählbar) */
  buzzer: boolean
}

/** Einstellung ↔ Adresse (…/leiten/duell?q=a,b&t=2&z=5&r=0&a=0) – so lässt sich ein Duell auch als Lesezeichen speichern */
export function alsAdresse(e: DuellEinstellung) {
  const p = new URLSearchParams({ q: e.quizIds.join(','), t: String(e.teams), z: String(e.zeilen), r: e.zufall ? '1' : '0', a: e.abzug ? '1' : '0', b: e.buzzer ? '1' : '0' })
  return `/leiten/duell?${p}`
}
export function ausAdresse(p: URLSearchParams): DuellEinstellung | null {
  const quizIds = (p.get('q') ?? '').split(',').filter((x) => /^[0-9a-f-]{8,}$/i.test(x))
  const zahl = (k: string, min: number, max: number, std: number) => {
    const n = Number(p.get(k))
    return Number.isInteger(n) && n >= min && n <= max ? n : std
  }
  if (quizIds.length < MIN_KATEGORIEN || quizIds.length > MAX_KATEGORIEN) return null
  return { quizIds, teams: zahl('t', 2, MAX_TEAMS, 2), zeilen: zahl('z', 3, 5, 5), zufall: p.get('r') === '1', abzug: p.get('a') === '1', buzzer: p.get('b') === '1' }
}

/** Nur Fragen mit richtiger Lösung taugen fürs Duell (keine Umfrage, Wortwolke, offene Frage, Folie) */
export const fuersDuell = (f: Frage) => FRAGETYPEN[f.typ].bewertet

export type Kategorie = { quizId: string; titel: string; fragen: Frage[] }

/** Schwierigkeit fürs Sortieren: ohne Angabe = mittel */
export const schwierigkeitVon = (f: Frage) => f.schwierigkeit ?? 2

/**
 * Wählt pro Quiz die Fragen-Nummern aus (der Reihe nach oder zufällig) und ordnet sie nach Schwierigkeit:
 * leichte auf die niedrigen Felder (100), schwere auf die hohen (500). Bei gleicher Schwierigkeit bleibt die Reihenfolge.
 */
export function waehleFragen(fragen: Frage[], zeilen: number, zufall: boolean, zufallszahl: () => number = Math.random): number[] {
  const passend = fragen.map((f, i) => (fuersDuell(f) ? i : -1)).filter((i) => i >= 0)
  let auswahl = passend.slice(0, zeilen)
  if (zufall) {
    const gemischt = [...passend]
    for (let i = gemischt.length - 1; i > 0; i--) {
      const j = Math.floor(zufallszahl() * (i + 1))
      ;[gemischt[i], gemischt[j]] = [gemischt[j], gemischt[i]]
    }
    auswahl = gemischt.slice(0, zeilen)
  }
  return auswahl.map((i, pos) => ({ i, pos })).sort((a, b) => schwierigkeitVon(fragen[a.i]) - schwierigkeitVon(fragen[b.i]) || a.pos - b.pos).map((x) => x.i)
}

export const wertVon = (zeile: number) => (zeile + 1) * 100
export const feldSchluessel = (kategorie: number, zeile: number) => `${kategorie}-${zeile}`

// ---------- Spielstand (nur auf diesem Gerät) ----------
export type Spielstand = {
  /** Adresse des Duells – ein anderes Duell beginnt mit neuem Stand */
  schluessel: string
  /** gewählte Fragen-Nummern je Kategorie */
  auswahl: number[][]
  teams: { name: string; punkte: number }[]
  /** erledigte Felder: Team-Index des Gewinners oder null (niemand) */
  felder: Record<string, number | null>
  /** PIN für die Buzzer-Handys (nur wenn Buzzer gewählt) */
  pin?: string
}

export function neuerStand(schluessel: string, auswahl: number[][], teamNamen: string[]): Spielstand {
  return { schluessel, auswahl, teams: teamNamen.map((name) => ({ name, punkte: 0 })), felder: {} }
}

/** Punkte vergeben (richtig: +Wert; falsch mit Abzug: −Wert). Gibt einen neuen Stand zurück. */
export function punkte(stand: Spielstand, team: number, betrag: number): Spielstand {
  return { ...stand, teams: stand.teams.map((t, i) => (i === team ? { ...t, punkte: t.punkte + betrag } : t)) }
}
/** Feld schließen (Gewinner-Team oder null) */
export function schliesseFeld(stand: Spielstand, schluessel: string, gewinner: number | null): Spielstand {
  return { ...stand, felder: { ...stand.felder, [schluessel]: gewinner } }
}

export const anzahlFelder = (stand: Spielstand) => stand.auswahl.reduce((s, k) => s + k.length, 0)
export const alleErledigt = (stand: Spielstand) => Object.keys(stand.felder).length >= anzahlFelder(stand)

/** Rangliste: Plätze mit Gleichstand */
export function rangliste(stand: Spielstand) {
  const sortiert = stand.teams.map((t, i) => ({ ...t, index: i })).sort((a, b) => b.punkte - a.punkte)
  return sortiert.map((t) => ({ ...t, platz: sortiert.findIndex((x) => x.punkte === t.punkte) + 1 }))
}

const SPEICHER = 'quizzo-duell'
export function ladeStand(schluessel: string): Spielstand | null {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null') as Spielstand | null
    return s && s.schluessel === schluessel && Array.isArray(s.teams) && Array.isArray(s.auswahl) ? s : null
  } catch {
    return null
  }
}
export function speichereStand(s: Spielstand | null) {
  try {
    if (s) localStorage.setItem(SPEICHER, JSON.stringify(s))
    else localStorage.removeItem(SPEICHER)
  } catch {
    /* Gerät ohne Speicher: Spiel geht trotzdem, nur ohne Fortsetzen */
  }
}

// ---------- Anzeige am Beamer ----------
function gemischt<T>(liste: T[], zufallszahl: () => number = Math.random) {
  const l = [...liste]
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(zufallszahl() * (i + 1))
    ;[l[i], l[j]] = [l[j], l[i]]
  }
  return l
}

/** Wie die Frage am Beamer erscheint (wie im Live-Spiel: Reihenfolge und Zuordnung gemischt) */
export function alsBeamerFrage(f: Frage, zufallszahl: () => number = Math.random): LehrkraftFrage {
  let ansicht: Ansicht = {}
  switch (f.typ) {
    case 'auswahl':
      ansicht = { antworten: f.inhalt.antworten, mehrfach: f.inhalt.richtig.length > 1 }
      break
    case 'reihenfolge':
      ansicht = { elemente: gemischt(f.inhalt.elemente, zufallszahl) }
      break
    case 'zuordnung':
      ansicht = { links: f.inhalt.paare.map((p) => p.links), rechts: gemischt(f.inhalt.paare.map((p) => p.rechts), zufallszahl) }
      break
    case 'schieberegler':
      ansicht = { min: f.inhalt.min, max: f.inhalt.max, schritt: f.inhalt.schritt, einheit: f.inhalt.einheit ?? null }
      break
  }
  return { ...f, ansicht } as LehrkraftFrage
}

/** Lösung als Zeilen zum Anzeigen */
export function loesungZeilen(f: Frage): string[] {
  switch (f.typ) {
    case 'auswahl':
      return f.inhalt.richtig.map((i) => f.inhalt.antworten[i])
    case 'wahrfalsch':
      return [f.inhalt.richtig ? 'Richtig' : 'Falsch']
    case 'freitext':
      return [f.inhalt.loesungen.join(' / ')]
    case 'reihenfolge':
      return f.inhalt.elemente.map((e, i) => `${i + 1}. ${e}`)
    case 'zuordnung':
      return f.inhalt.paare.map((p) => `${p.links} ⇄ ${p.rechts}`)
    case 'schieberegler': {
      const e = f.inhalt.einheit ? ` ${f.inhalt.einheit}` : ''
      const t = f.inhalt.toleranz ? ` (± ${zahl(f.inhalt.toleranz)}${e} zählt noch)` : ''
      return [`${zahl(f.inhalt.richtig)}${e}${t}`]
    }
    default:
      return []
  }
}
