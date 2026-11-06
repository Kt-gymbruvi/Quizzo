import { db } from './supabase.ts'
import { FRAGETYPEN, type FrageTyp } from './fragetypen.ts'
import type { SchuelerFrage } from './spiel.ts'

// Aufgaben ohne Live-Spiel: Selbstlernen, Hausaufgabe, Prüfung (siehe supabase/migrations/007_aufgaben.sql)

export type Aufgabenmodus = 'selbstlernen' | 'hausaufgabe' | 'pruefung'

export const MODUS_INFO: Record<Aufgabenmodus, { name: string; symbol: string; text: string; datenschutz: string }> = {
  selbstlernen: {
    name: 'Selbstlernen',
    symbol: '📚',
    text: 'Üben im eigenen Tempo, beliebig oft. Nach jeder Frage gibt es die Lösung.',
    datenschutz: 'Völlig anonym: kein Name, gespeichert werden nur Zahlen pro Frage (Versuche, richtig).',
  },
  hausaufgabe: {
    name: 'Hausaufgabe',
    symbol: '🏠',
    text: 'Mit Spitzname und Abgabefrist (höchstens 14 Tage). Jede Frage einmal, danach Lösung.',
    datenschutz: 'Spitzname, Antworten und Punkte werden 7 Tage nach der Frist automatisch gelöscht.',
  },
  pruefung: {
    name: 'Prüfung',
    symbol: '📝',
    text: 'Mit Prüfungscodes zum Ausdrucken. Keine Lösungen und kein Ergebnis auf dem Handy.',
    datenschutz: 'Quizzo kennt keine Namen – nur du ordnest die Codes auf Papier zu. Alles wird spätestens nach 30 Tagen gelöscht.',
  },
}

export type AufgabeUebersicht = {
  id: string
  code: string
  modus: Aufgabenmodus
  titel: string
  erstellt_am: string
  frist: string | null
  loeschen_am: string | null
  offen: boolean
  teilnehmer: number
  abgegeben: number
  versuche: number
}

export type AufgabeFrage = { typ: FrageTyp; text: string; inhalt: Record<string, unknown>; punkte: number }
export type AufgabeAntwort = { frage_nr: number; antwort: unknown; anteil: number; punkte: number }
export type AufgabeTeilnehmer = {
  id: string
  spitzname: string | null
  code: string | null
  punkte: number
  aktiv: boolean
  begonnen_am: string | null
  abgegeben_am: string | null
  antworten: AufgabeAntwort[]
}
export type AufgabeErgebnis = Omit<AufgabeUebersicht, 'teilnehmer' | 'abgegeben' | 'versuche'> & {
  geschlossen: boolean
  fragen: AufgabeFrage[]
  statistik: { frage_nr: number; versuche: number; richtig: number; anteil_summe: number }[]
  teilnehmer: AufgabeTeilnehmer[]
}

/** Was Schüler beim Öffnen sehen (Fragen nur beim Selbstlernen). */
export type AufgabeInfo = {
  code: string
  modus: Aufgabenmodus
  titel: string
  frist: string | null
  offen: boolean
  anzahl_fragen: number
  fragen: SchuelerFrage[] | null
}
export type AufgabeZustand = Omit<AufgabeInfo, 'fragen' | 'anzahl_fragen'> & {
  name: string
  abgegeben: boolean
  punkte: number | null
  fragen: SchuelerFrage[]
  /** Hausaufgabe: mit Ergebnis und Lösung; Prüfung: nur die Nummer */
  antworten: { frage_nr: number; anteil?: number; punkte?: number; loesung?: unknown }[]
}
export type AufgabeRueckmeldung = { anteil?: number; punkte?: number; loesung?: unknown; abgegeben?: boolean; ok?: boolean }
export type AufgabeTeilnahme = { teilnehmer_id: string; token: string; name: string }

async function aufruf<T>(funktion: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(funktion, args)
  if (error) throw error
  return data as T
}

// --- Lehrkraft ---
export const erstelleAufgabe = (quizId: string, modus: Aufgabenmodus, frist: Date | null, codes: number | null) =>
  aufruf<{ id: string; code: string }>('aufgabe_erstellen', {
    p_quiz_id: quizId,
    p_modus: modus,
    p_frist: frist ? frist.toISOString() : null,
    p_codes: modus === 'pruefung' ? codes : null,
  })
export const ladeAufgaben = () => aufruf<AufgabeUebersicht[]>('aufgaben_liste', {})
export const ladeErgebnisse = (id: string) => aufruf<AufgabeErgebnis | null>('aufgabe_ergebnisse', { p_aufgabe: id })
export const schliesseAufgabe = (id: string) => aufruf<void>('aufgabe_schliessen', { p_aufgabe: id })
export const gibCodeFrei = (teilnehmerId: string) => aufruf<void>('pruefung_code_freigeben', { p_teilnehmer: teilnehmerId })
export async function loescheAufgabe(id: string) {
  const { error } = await db().from('aufgaben').delete().eq('id', id)
  if (error) throw error
}

// --- Schüler ---
export const oeffneAufgabe = (code: string) => aufruf<AufgabeInfo>('aufgabe_oeffnen', { p_code: code })
export const trittAufgabeBei = (code: string, name: string) => aufruf<AufgabeTeilnahme>('aufgabe_beitreten', { p_code: code, p_name: name })
export const ladeAufgabeZustand = (t: AufgabeTeilnahme) =>
  aufruf<AufgabeZustand | null>('aufgabe_zustand', { p_teilnehmer: t.teilnehmer_id, p_token: t.token })
export const beantworte = (code: string, t: AufgabeTeilnahme | null, frageNr: number, antwort: unknown) =>
  aufruf<AufgabeRueckmeldung>('aufgabe_antworten', {
    p_code: code,
    p_teilnehmer: t?.teilnehmer_id ?? null,
    p_token: t?.token ?? null,
    p_frage_nr: frageNr,
    p_antwort: antwort,
  })

/** Code vereinheitlichen wie code_normal() in der Datenbank. */
export const codeNormal = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Sieht wie ein Aufgaben-Code aus (6 Zeichen, mindestens ein Buchstabe – Spiel-PINs sind nur Ziffern)? */
export const istAufgabenCode = (s: string) => /^[A-Z0-9]{6}$/.test(codeNormal(s)) && /[A-Z]/.test(codeNormal(s))

export function aufgabenLink(code: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/aufgabe/${code}`
}

// Anmeldung bei Hausaufgabe/Prüfung auf diesem Gerät merken (nur Schlüssel und Spitzname/Code),
// damit man später weitermachen kann. Nach 30 Tagen (längste Aufbewahrung) wird es verworfen.
const SPEICHER = 'quizzo-aufgaben'
const HOECHSTENS_MS = 30 * 24 * 3600_000
type Gemerkt = Record<string, AufgabeTeilnahme & { gemerkt: number }>

function ladeGemerkt(): Gemerkt {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Gemerkt
    const jetzt = Date.now()
    return Object.fromEntries(Object.entries(roh).filter(([, t]) => t && typeof t.gemerkt === 'number' && jetzt - t.gemerkt < HOECHSTENS_MS))
  } catch {
    return {}
  }
}
export function gemerkteAufgabe(code: string): AufgabeTeilnahme | null {
  const t = ladeGemerkt()[codeNormal(code)]
  return t ? { teilnehmer_id: t.teilnehmer_id, token: t.token, name: t.name } : null
}
export function merkeAufgabe(code: string, t: AufgabeTeilnahme | null) {
  try {
    const alle = ladeGemerkt()
    if (t) alle[codeNormal(code)] = { ...t, gemerkt: Date.now() }
    else delete alle[codeNormal(code)]
    if (Object.keys(alle).length) localStorage.setItem(SPEICHER, JSON.stringify(alle))
    else localStorage.removeItem(SPEICHER)
  } catch {
    /* privater Modus o. Ä. */
  }
}

// --- Auswertung ---

/** Höchstpunktzahl einer Frage (0 bei Umfrage, Folie usw.). */
export const hoechstpunkte = (f: AufgabeFrage) => (FRAGETYPEN[f.typ].bewertet ? 1000 * f.punkte : 0)

/** Lesbare Darstellung einer abgegebenen Antwort für die Lehrkraft. */
export function antwortAlsText(f: AufgabeFrage, a: unknown): string {
  if (a === null || a === undefined) return ''
  const i = f.inhalt as { antworten?: string[]; paare?: { links: string; rechts: string }[]; einheit?: string | null }
  switch (f.typ) {
    case 'auswahl':
    case 'umfrage':
      return Array.isArray(a) ? a.map((n) => i.antworten?.[n as number] ?? '?').join(', ') : ''
    case 'wahrfalsch':
      return a === true ? 'Richtig' : 'Falsch'
    case 'reihenfolge':
      return Array.isArray(a) ? a.join(' → ') : ''
    case 'zuordnung':
      return Array.isArray(a) ? a.map((r, n) => `${i.paare?.[n]?.links ?? '?'} – ${r}`).join('; ') : ''
    case 'schieberegler':
      return `${a}${i.einheit ? ' ' + i.einheit : ''}`
    default:
      return String(a)
  }
}

/** Ergebnisse als CSV (Semikolon, für Excel mit deutscher Einstellung). */
export function ergebnisCsv(e: AufgabeErgebnis): string {
  const max = e.fragen.reduce((s, f) => s + hoechstpunkte(f), 0)
  const zelle = (x: unknown) => {
    const s = String(x ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const kopf = [e.modus === 'pruefung' ? 'Code' : 'Spitzname', 'Punkte', 'von', 'Prozent', 'abgegeben',
    ...e.fragen.map((f, n) => `F${n + 1}: ${f.text}`)]
  const zeilen = e.teilnehmer
    .filter((t) => t.begonnen_am)
    .map((t) => [
      t.code ?? t.spitzname,
      t.punkte,
      max,
      max ? Math.round((100 * t.punkte) / max) : '',
      t.abgegeben_am ? 'ja' : 'nein',
      ...e.fragen.map((f, n) => {
        const a = t.antworten.find((x) => x.frage_nr === n)
        if (!a) return ''
        return FRAGETYPEN[f.typ].bewertet ? `${Math.round(a.anteil * 100)} % (${antwortAlsText(f, a.antwort)})` : antwortAlsText(f, a.antwort)
      }),
    ])
  return '﻿' + [kopf, ...zeilen].map((z) => z.map(zelle).join(';')).join('\r\n')
}
