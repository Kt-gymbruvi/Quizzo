import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { db, supabase } from './supabase.ts'

export type SpielStatus = 'lobby' | 'frage' | 'auswertung' | 'ende'

export type LehrkraftZustand = {
  id: string
  pin: string
  status: SpielStatus
  frage_nr: number
  anzahl_fragen: number
  quiz_titel: string
  frage: { text: string; antworten: string[]; richtig: number; zeitlimit: number } | null
  restzeit_ms: number | null
  spieler: { id: string; spitzname: string; punkte: number }[]
  verteilung: number[]
  beantwortet: number
}

export type SchuelerZustand = {
  status: SpielStatus
  frage_nr: number
  anzahl_fragen: number
  spitzname: string
  punkte: number
  platz: number
  anzahl_spieler: number
  frage: { text: string; antworten: string[]; zeitlimit: number } | null
  restzeit_ms: number | null
  meine_antwort: { antwort: number; richtig?: boolean; punkte?: number } | null
  richtige_antwort: number | null
}

export type Teilnahme = { spiel_id: string; spieler_id: string; token: string; spitzname: string }

async function aufruf<T>(funktion: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(funktion, args)
  if (error) throw error
  return data as T
}

// --- Lehrkraft ---
export const erstelleSpiel = (quizId: string) => aufruf<{ id: string; pin: string }>('spiel_erstellen', { p_quiz_id: quizId })
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
export const antworte = (t: Teilnahme, frageNr: number, antwort: number) =>
  aufruf<unknown>('antwort_abgeben', { p_spieler: t.spieler_id, p_token: t.token, p_frage_nr: frageNr, p_antwort: antwort })

// Teilnahme nur in diesem Browser-Tab merken (übersteht Neuladen, verschwindet beim Schließen)
const SPEICHER = 'quizzo-teilnahme'
export function merkeTeilnahme(t: Teilnahme | null) {
  try {
    if (t) sessionStorage.setItem(SPEICHER, JSON.stringify(t))
    else sessionStorage.removeItem(SPEICHER)
  } catch {
    /* privater Modus o. Ä. – dann eben ohne Merken */
  }
}
export function gemerkteTeilnahme(): Teilnahme | null {
  try {
    const roh = sessionStorage.getItem(SPEICHER)
    return roh ? (JSON.parse(roh) as Teilnahme) : null
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
      setEnde(Date.now() + restzeitMs)
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
