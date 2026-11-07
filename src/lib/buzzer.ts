// Buzzer fürs Klassen-Duell: ein Handy pro Team. Alles läuft über einen Echtzeit-Kanal (Supabase Realtime,
// „broadcast“) – es wird nichts in der Datenbank gespeichert. Das iPad der Lehrkraft schickt regelmäßig den
// Zustand (welche Frage offen ist, wer dran ist); die Team-Handys schicken nur „hallo“ und „buzz“.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'

export type BuzzerZustand = {
  /** Buzzer gerade freigegeben? */
  offen: boolean
  /** Zähler: jede Freigabe hat eine neue Runde – alte, verspätete Buzzes zählen nicht */
  runde: number
  /** Team, das zuerst gebuzzert hat (Index) */
  dran: number | null
  /** Teams, die bei dieser Frage schon falsch geantwortet haben */
  gesperrt: number[]
  /** Kategorie und Wert der offenen Frage, z. B. „Evolution · 300“ */
  frage: string | null
  teams: { name: string; punkte: number }[]
}

export const kanalName = (pin: string) => `quizzo-buzzer-${pin}`
export const istBuzzerPin = (pin: string) => /^\d{6}$/.test(pin)
export function neuerBuzzerPin() {
  const z = new Uint32Array(1)
  crypto.getRandomValues(z)
  return String(100000 + (z[0] % 900000))
}
export function buzzerLink(pin: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/buzzer?pin=${pin}`
}

const HALLO_ALLE_MS = 3000
const ZUSTAND_ALLE_MS = 2000
const VERBUNDEN_MS = 8000

function oeffneKanal(pin: string) {
  if (!supabase?.channel) return null
  return supabase.channel(kanalName(pin), { config: { broadcast: { self: false } } })
}

/** Verbindung abgerissen (z. B. WLAN weg, Handy im Standby)? Dann neu anmelden. */
function wiederVerbinden(kanal: RealtimeChannel) {
  const zustand = (kanal as unknown as { state?: string }).state
  if (zustand === 'errored' || zustand === 'closed') kanal.subscribe()
}

/** Lehrkraft (iPad): sendet den Zustand, nimmt den ersten Buzz einer Runde an, merkt sich verbundene Teams. */
export function useBuzzerLehrkraft(pin: string | null, zustand: BuzzerZustand | null, beiBuzz: (team: number) => void) {
  const kanalRef = useRef<RealtimeChannel | null>(null)
  const zustandRef = useRef(zustand)
  const beiBuzzRef = useRef(beiBuzz)
  const gesehen = useRef<Map<number, number>>(new Map())
  const [verbunden, setVerbunden] = useState<number[]>([])

  useEffect(() => {
    zustandRef.current = zustand
    beiBuzzRef.current = beiBuzz
  })

  const senden = useCallback(() => {
    if (kanalRef.current && zustandRef.current) kanalRef.current.send({ type: 'broadcast', event: 'zustand', payload: zustandRef.current })
  }, [])

  useEffect(() => {
    if (!pin) return
    const kanal = oeffneKanal(pin)
    if (!kanal) return
    kanal
      .on('broadcast', { event: 'buzz' }, ({ payload }) => {
        const z = zustandRef.current
        const team = Number(payload?.team)
        if (!z || !z.offen || z.dran !== null || payload?.runde !== z.runde) return
        if (!Number.isInteger(team) || team < 0 || team >= z.teams.length || z.gesperrt.includes(team)) return
        // sofort sperren, damit ein zweiter Buzz derselben Runde nicht auch zählt
        zustandRef.current = { ...z, dran: team }
        beiBuzzRef.current(team)
      })
      .on('broadcast', { event: 'hallo' }, ({ payload }) => {
        const team = Number(payload?.team)
        if (Number.isInteger(team)) gesehen.current.set(team, Date.now())
      })
      .subscribe()
    kanalRef.current = kanal
    const t = setInterval(() => {
      wiederVerbinden(kanal)
      senden()
      const jetzt = Date.now()
      setVerbunden([...gesehen.current].filter(([, zeit]) => jetzt - zeit < VERBUNDEN_MS).map(([team]) => team).sort())
    }, ZUSTAND_ALLE_MS)
    return () => {
      clearInterval(t)
      kanalRef.current = null
      supabase?.removeChannel(kanal)
    }
  }, [pin, senden])

  // Jede Änderung sofort an die Handys
  useEffect(senden, [zustand, senden])

  return { verbunden }
}

/** Team-Handy: empfängt den Zustand, meldet sich regelmäßig, buzzert. */
export function useBuzzerTeam(pin: string | null, team: number | null) {
  const kanalRef = useRef<RealtimeChannel | null>(null)
  const [zustand, setZustand] = useState<BuzzerZustand | null>(null)
  const [zuletzt, setZuletzt] = useState(0)
  const [jetzt, setJetzt] = useState(() => Date.now())
  const teamRef = useRef(team)
  useEffect(() => {
    teamRef.current = team
  })

  useEffect(() => {
    if (!pin) return
    const kanal = oeffneKanal(pin)
    if (!kanal) return
    kanal
      .on('broadcast', { event: 'zustand' }, ({ payload }) => {
        setZustand(payload as BuzzerZustand)
        setZuletzt(Date.now())
      })
      .subscribe()
    kanalRef.current = kanal
    const hallo = () => {
      wiederVerbinden(kanal)
      if (teamRef.current !== null) kanal.send({ type: 'broadcast', event: 'hallo', payload: { team: teamRef.current } })
      setJetzt(Date.now())
    }
    const t = setInterval(hallo, HALLO_ALLE_MS)
    return () => {
      clearInterval(t)
      kanalRef.current = null
      supabase?.removeChannel(kanal)
    }
  }, [pin])

  // Nach der Teamwahl gleich melden
  useEffect(() => {
    if (team !== null) kanalRef.current?.send({ type: 'broadcast', event: 'hallo', payload: { team } })
  }, [team])

  const buzz = useCallback(() => {
    if (teamRef.current === null || !zustand?.offen) return
    kanalRef.current?.send({ type: 'broadcast', event: 'buzz', payload: { team: teamRef.current, runde: zustand.runde } })
    if ('vibrate' in navigator) navigator.vibrate?.(80)
  }, [zustand])

  return { zustand, verbunden: zuletzt > 0 && jetzt - zuletzt < VERBUNDEN_MS, buzz }
}
