import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeamWertung } from './teams.ts'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { db, supabase } from './supabase.ts'
import type { Frage, FrageTyp } from './fragetypen.ts'

/** Text vergleichbar machen (wie normalisiere() in der Datenbank). */
export const normalisiere = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export type SpielStatus = 'lobby' | 'frage' | 'auswertung' | 'ende'

/** Was Schüler während einer Frage sehen (ohne Lösung; Reihenfolge/Zuordnung gemischt). */
export type Ansicht = {
  antworten?: string[]
  mehrfach?: boolean
  max_zeichen?: number
  elemente?: string[]
  links?: string[]
  rechts?: string[]
  min?: number
  max?: number
  schritt?: number
  einheit?: string | null
  text?: string | null
}

export type LehrkraftFrage = Frage & { ansicht: Ansicht }
export type AbgegebeneAntwort = { antwort: unknown; anteil: number; punkte: number }

export type Spielmodus = 'klassisch' | 'team'

export type LehrkraftZustand = {
  id: string
  pin: string
  modus: Spielmodus
  /** Turnier: Rundennummer (ab 1) */
  runde?: number
  anzahl_teams: number | null
  /** Teamwertung (nur im Teamspiel), beste zuerst */
  teams: TeamWertung | null
  status: SpielStatus
  frage_nr: number
  anzahl_fragen: number
  quiz_titel: string
  frage: LehrkraftFrage | null
  restzeit_ms: number | null
  spieler: { id: string; spitzname: string; punkte: number; team?: number | null }[]
  antworten: AbgegebeneAntwort[]
  beantwortet: number
}

export type SchuelerFrage = { typ: FrageTyp; text: string; zeitlimit: number; punkte: number; ansicht: Ansicht }

export type SchuelerZustand = {
  status: SpielStatus
  frage_nr: number
  anzahl_fragen: number
  spitzname: string
  punkte: number
  platz: number
  anzahl_spieler: number
  modus: Spielmodus
  runde?: number
  team: number | null
  teams: TeamWertung | null
  frage: SchuelerFrage | null
  restzeit_ms: number | null
  meine_antwort: { antwort: unknown; richtig?: boolean; anteil?: number; punkte?: number } | null
  /** Lösung nach der Auflösung (Format je Fragetyp, null bei Umfrage usw.) */
  loesung: unknown
}

export type Teilnahme = { spiel_id: string; spieler_id: string; token: string; spitzname: string; team?: number | null; /** nur auf dem Gerät gemerkt */ pin?: string }

async function aufruf<T>(funktion: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(funktion, args)
  if (error) throw error
  return data as T
}

// --- Lehrkraft ---
export const erstelleSpiel = (quizId: string, modus: Spielmodus = 'klassisch', teams: number | null = null) =>
  aufruf<{ id: string; pin: string }>('spiel_erstellen', { p_quiz_id: quizId, p_modus: modus, p_teams: modus === 'team' ? teams : null })
/** Turnier: nach dem Endstand mit einem anderen Quiz weiterspielen (Punkte bleiben) */
export const naechsteRunde = (spielId: string, quizId: string) => aufruf<void>('spiel_naechste_runde', { p_spiel: spielId, p_quiz_id: quizId })
/** Teamspiel, Lobby: Spieler ins nächste Team setzen */
export const wechsleTeam = (spielerId: string) => aufruf<void>('spieler_team_wechseln', { p_spieler: spielerId })
export const steuereSpiel = (spielId: string, aktion: 'weiter' | 'aufloesen') =>
  aufruf<void>('spiel_steuern', { p_spiel: spielId, p_aktion: aktion })
export const ladeLehrkraftZustand = (spielId: string) => aufruf<LehrkraftZustand | null>('spiel_zustand_lehrkraft', { p_spiel: spielId })

export async function entferneSpieler(spielerId: string) {
  const { error } = await db().from('spieler').delete().eq('id', spielerId)
  if (error) throw error
}

/** Löscht das Spiel samt allen Spitznamen, Antworten und Punkten. */
export async function loescheSpiel(spielId: string) {
  const { error } = await db().from('spiele').delete().eq('id', spielId)
  if (error) throw error
}

// --- Schüler ---
export const trittBei = (pin: string, spitzname: string) => aufruf<Teilnahme>('spiel_beitreten', { p_pin: pin, p_spitzname: spitzname })
export const ladeSchuelerZustand = (t: Teilnahme) =>
  aufruf<SchuelerZustand | null>('spiel_zustand_schueler', { p_spieler: t.spieler_id, p_token: t.token })
export const antworte = (t: Teilnahme, frageNr: number, antwort: unknown) =>
  aufruf<unknown>('antwort_abgeben', { p_spieler: t.spieler_id, p_token: t.token, p_frage_nr: frageNr, p_antwort: antwort })

// Teilnahme auf diesem Gerät merken, damit man nach „Zurück“, Neuladen oder versehentlichem
// Schließen des Tabs wieder ins laufende Spiel kommt. Gespeichert werden nur Spiel-ID, Spieler-ID,
// Token, Spitzname und PIN – nach 6 Stunden (so lange lebt ein Spiel höchstens) wird es verworfen.
const SPEICHER = 'quizzo-teilnahme'
const HOECHSTENS_MS = 6 * 60 * 60 * 1000
export function merkeTeilnahme(t: Teilnahme | null) {
  try {
    if (t) localStorage.setItem(SPEICHER, JSON.stringify({ ...t, gemerkt: Date.now() }))
    else localStorage.removeItem(SPEICHER)
  } catch {
    /* privater Modus o. Ä. – dann eben ohne Merken */
  }
}
export function gemerkteTeilnahme(): Teilnahme | null {
  try {
    const roh = localStorage.getItem(SPEICHER)
    if (!roh) return null
    const { gemerkt, ...t } = JSON.parse(roh) as Teilnahme & { gemerkt?: number }
    if (!t.spieler_id || !t.token || typeof gemerkt !== 'number' || Date.now() - gemerkt > HOECHSTENS_MS) {
      localStorage.removeItem(SPEICHER)
      return null
    }
    return t
  } catch {
    return null
  }
}

/** Link zum Mitspielen (mit vorausgefüllter PIN). */
export function mitspielLink(pin: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/mitspielen?pin=${pin}`
}

// --- Echtzeit ---

/**
 * Realtime-Kanal eines Spiels: Ruft `beiSignal` auf, sobald ein anderes Gerät „aktualisieren“ sendet.
 * Liefert eine Funktion, mit der man selbst das Signal sendet. Es werden keine Daten übertragen,
 * nur der Hinweis, den Zustand neu abzufragen.
 */
export function useSpielKanal(spielId: string | undefined, beiSignal: () => void) {
  const kanalRef = useRef<RealtimeChannel | null>(null)
  const beiSignalRef = useRef(beiSignal)
  useEffect(() => {
    beiSignalRef.current = beiSignal
  })

  useEffect(() => {
    if (!spielId || !supabase?.channel) return
    const kanal = supabase.channel(`quizzo-spiel-${spielId}`, { config: { broadcast: { self: false } } })
    kanal.on('broadcast', { event: 'aktualisieren' }, () => beiSignalRef.current()).subscribe()
    kanalRef.current = kanal
    return () => {
      kanalRef.current = null
      supabase?.removeChannel(kanal)
    }
  }, [spielId])

  return useCallback(() => {
    kanalRef.current?.send({ type: 'broadcast', event: 'aktualisieren', payload: {} })
  }, [])
}

/** Ruft `fn` sofort und dann regelmäßig auf (Sicherheitsnetz, falls ein Realtime-Signal verloren geht). */
export function useRegelmaessig(fn: () => void, intervallMs: number, aktiv = true) {
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })
  useEffect(() => {
    if (!aktiv) return
    fnRef.current()
    const t = setInterval(() => fnRef.current(), intervallMs)
    return () => clearInterval(t)
  }, [intervallMs, aktiv])
}

/**
 * Countdown in ganzen Sekunden. Die Restzeit kommt vom Server und wird nur beim Wechsel
 * von `schluessel` (z. B. neue Frage) übernommen, damit die Anzeige nicht springt.
 */
export function useCountdown(restzeitMs: number | null | undefined, schluessel: string): number | null {
  const [ende, setEnde] = useState<number | null>(null)
  const [jetzt, setJetzt] = useState(() => Date.now())
  const letzterSchluessel = useRef<string | null>(null)

  useEffect(() => {
    if (restzeitMs == null) {
      letzterSchluessel.current = null
      setEnde(null)
    } else if (letzterSchluessel.current !== schluessel) {
      letzterSchluessel.current = schluessel
      const jetzt = Date.now()
      setJetzt(jetzt) // sonst zeigt die erste Anzeige mit einer alten Uhrzeit eine Sekunde zu viel
      setEnde(jetzt + restzeitMs)
    }
  }, [restzeitMs, schluessel])

  useEffect(() => {
    if (ende === null) return
    const t = setInterval(() => setJetzt(Date.now()), 250)
    return () => clearInterval(t)
  }, [ende])

  if (ende === null) return null
  return Math.max(0, Math.ceil((ende - jetzt) / 1000))
}
