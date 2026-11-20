// Klang-Motor: erzeugt alle Töne selbst mit der Web-Audio-API (keine Audiodateien, keine fremden Melodien).
// Nur am Beamer der Lehrkraft; Schüler-Handys bleiben stumm. Ton lässt sich mit dem Schalter aus- und anschalten
// (Wahl bleibt im localStorage dieses Geräts). Ohne Web Audio (z. B. in Tests) passiert einfach nichts.
// (Dieselbe Datei gibt es in Klassenfunk – beide Projekte sind getrennte Repositories.)

export type Stimme =
  | 'pluck' // kurzer, heller Synth-Zupfton
  | 'lead' // Melodie-Synth
  | 'bass'
  | 'rhodes' // weiches E-Piano
  | 'glocke' // Glocke / Celesta
  | 'streicher' // Flächenklang
  | 'blech' // Fanfare
  | 'buzz' // elektronischer Summer
  | 'kick'
  | 'snare'
  | 'klatsch'
  | 'hat'
  | 'holz' // Holzblock / Tick
  | 'becken'

export interface Note {
  /** Zeitpunkt in Schlägen ab Beginn */
  t: number
  stimme: Stimme
  /** MIDI-Tonhöhe (bei Schlagzeug ohne Bedeutung, beim Holzblock die Tonhöhe) */
  ton?: number
  /** Länge in Schlägen (Standard 0,5) */
  dauer?: number
  /** Lautstärke 0–1.3 (Standard 1) */
  laut?: number
}

export interface Stueck {
  bpm: number
  noten: Note[]
  /** Nur bei Schleifen: Länge in Schlägen */
  beats?: number
  /** Verschiebung der „und“-Achtel nach hinten (0 = gerade, 0,17 ≈ Swing) */
  swing?: number
  /** Gesamtlautstärke 0–1 */
  laut?: number
}

const SCHLUESSEL = 'ton-an'
const hoerer = new Set<() => void>()
let an = leseAn()

function leseAn(): boolean {
  try {
    return localStorage.getItem(SCHLUESSEL) !== '0'
  } catch {
    return true
  }
}

export const tonAn = () => an
export function setzeTon(wert: boolean) {
  an = wert
  try {
    localStorage.setItem(SCHLUESSEL, wert ? '1' : '0')
  } catch {
    /* ohne Speicher gilt die Wahl nur bis zum Neuladen */
  }
  if (master && ctx) master.gain.setTargetAtTime(wert ? 0.8 : 0, ctx.currentTime, 0.03)
  hoerer.forEach((h) => h())
}
export function abonniereTon(h: () => void) {
  hoerer.add(h)
  return () => void hoerer.delete(h)
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let rauschen: AudioBuffer | null = null

function kontext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    try {
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = an ? 0.8 : 0
      // Begrenzer, damit viele gleichzeitige Töne nie übersteuern
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 6
      master.connect(comp).connect(ctx.destination)
      const n = ctx.sampleRate
      rauschen = ctx.createBuffer(1, n, n)
      const daten = rauschen.getChannelData(0)
      for (let i = 0; i < n; i++) daten[i] = Math.random() * 2 - 1
    } catch {
      ctx = null
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

// Browser starten Audio erst nach einer Berührung: beim ersten Tippen den Motor aufwecken
if (typeof window !== 'undefined') {
  const wecken = () => {
    kontext()
    window.removeEventListener('pointerdown', wecken)
    window.removeEventListener('keydown', wecken)
  }
  window.addEventListener('pointerdown', wecken)
  window.addEventListener('keydown', wecken)
}

const frequenz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

/** Lautstärkeverlauf: schnell hoch, dann auslaufen */
function huelle(g: GainNode, t: number, spitze: number, anstieg: number, ausklang: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(Math.max(spitze, 0.0002), t + anstieg)
  g.gain.exponentialRampToValueAtTime(0.0001, t + anstieg + ausklang)
}

function schwingung(c: AudioContext, typ: OscillatorType, f: number, t: number, ende: number, ziel: AudioNode, verstimmung = 0) {
  const o = c.createOscillator()
  o.type = typ
  o.frequency.value = f
  o.detune.value = verstimmung
  o.connect(ziel)
  o.start(t)
  o.stop(ende)
  return o
}

function filter(c: AudioContext, typ: BiquadFilterType, f: number, ziel: AudioNode, q = 0.7) {
  const b = c.createBiquadFilter()
  b.type = typ
  b.frequency.value = f
  b.Q.value = q
  b.connect(ziel)
  return b
}

function geraeusch(c: AudioContext, t: number, ende: number, ziel: AudioNode) {
  const s = c.createBufferSource()
  s.buffer = rauschen
  s.loop = true
  s.connect(ziel)
  s.start(t, Math.random() * 0.5)
  s.stop(ende)
}

/** Spielt eine einzelne Note zum Zeitpunkt t (Sekunden der Audio-Uhr) */
function spieleNote(c: AudioContext, bus: AudioNode, n: Note, t: number, sek: number) {
  const laut = n.laut ?? 1
  const dauer = Math.max(0.05, (n.dauer ?? 0.5) * sek)
  const f = frequenz(n.ton ?? 60)
  const g = c.createGain()
  g.connect(bus)
  switch (n.stimme) {
    case 'pluck': {
      const ende = t + 0.7
      const lp = filter(c, 'lowpass', 3400, g, 1.2)
      lp.frequency.setValueAtTime(3400, t)
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.2)
      schwingung(c, 'sawtooth', f, t, ende, lp)
      schwingung(c, 'square', f, t, ende, lp, 7)
      huelle(g, t, 0.13 * laut, 0.004, Math.min(0.5, Math.max(0.14, dauer * 1.1)))
      break
    }
    case 'lead': {
      const lp = filter(c, 'lowpass', 3000, g)
      schwingung(c, 'square', f, t, t + dauer + 0.2, lp)
      schwingung(c, 'sawtooth', f, t, t + dauer + 0.2, lp, -9)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.12 * laut, t + 0.012)
      g.gain.setValueAtTime(0.1 * laut, t + dauer * 0.8)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dauer + 0.12)
      break
    }
    case 'bass': {
      const lp = filter(c, 'lowpass', 520, g, 1.5)
      schwingung(c, 'sawtooth', f, t, t + dauer + 0.2, lp)
      schwingung(c, 'sine', f, t, t + dauer + 0.2, g)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.3 * laut, t + 0.01)
      g.gain.setValueAtTime(0.26 * laut, t + dauer * 0.7)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dauer + 0.08)
      break
    }
    case 'rhodes': {
      const ende = t + dauer + 1.4
      const lp = filter(c, 'lowpass', 2600, g)
      schwingung(c, 'sine', f, t, ende, lp)
      const oberton = c.createGain()
      oberton.gain.setValueAtTime(0.35, t)
      oberton.gain.exponentialRampToValueAtTime(0.01, t + 0.35)
      oberton.connect(lp)
      schwingung(c, 'sine', f * 2, t, ende, oberton, 4)
      huelle(g, t, 0.17 * laut, 0.008, dauer + 0.9)
      break
    }
    case 'glocke': {
      const ende = t + 2.2
      for (const [faktor, anteil, lang] of [
        [1, 1, 1.6],
        [2.76, 0.4, 0.7],
        [5.4, 0.15, 0.3],
      ] as const) {
        const h = c.createGain()
        h.connect(bus)
        schwingung(c, 'sine', f * faktor, t, ende, h)
        huelle(h, t, 0.2 * laut * anteil, 0.003, lang)
      }
      break
    }
    case 'streicher': {
      const lp = filter(c, 'lowpass', 1300, g)
      const ende = t + dauer + 0.8
      schwingung(c, 'sawtooth', f, t, ende, lp, -7)
      schwingung(c, 'sawtooth', f, t, ende, lp, 7)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.06 * laut, t + Math.min(0.4, dauer * 0.4))
      g.gain.setValueAtTime(0.06 * laut, t + dauer)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dauer + 0.6)
      break
    }
    case 'blech': {
      const lp = filter(c, 'lowpass', 900, g, 0.9)
      lp.frequency.setValueAtTime(900, t)
      lp.frequency.linearRampToValueAtTime(2800, t + 0.08)
      const ende = t + dauer + 0.4
      schwingung(c, 'sawtooth', f, t, ende, lp, -6)
      schwingung(c, 'sawtooth', f, t, ende, lp, 6)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.14 * laut, t + 0.03)
      g.gain.setValueAtTime(0.12 * laut, t + dauer)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dauer + 0.3)
      break
    }
    case 'buzz': {
      const lp = filter(c, 'lowpass', 1400, g)
      schwingung(c, 'square', f, t, t + dauer + 0.1, lp)
      schwingung(c, 'sawtooth', f * 1.01, t, t + dauer + 0.1, lp)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.2 * laut, t + 0.01)
      g.gain.setValueAtTime(0.2 * laut, t + dauer)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dauer + 0.06)
      break
    }
    case 'kick': {
      const o = schwingung(c, 'sine', 150, t, t + 0.4, g)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
      huelle(g, t, 0.75 * laut, 0.004, 0.26)
      break
    }
    case 'snare': {
      const bp = filter(c, 'bandpass', 1900, g, 0.8)
      geraeusch(c, t, t + 0.3, bp)
      schwingung(c, 'triangle', 190, t, t + 0.12, g)
      huelle(g, t, 0.34 * laut, 0.002, 0.15)
      break
    }
    case 'klatsch': {
      const bp = filter(c, 'bandpass', 1250, g, 0.9)
      geraeusch(c, t, t + 0.3, bp)
      g.gain.setValueAtTime(0.0001, t)
      for (const v of [0, 0.011, 0.022]) {
        g.gain.setValueAtTime(0.3 * laut, t + v)
        g.gain.exponentialRampToValueAtTime(0.03, t + v + 0.01)
      }
      g.gain.setValueAtTime(0.28 * laut, t + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
      break
    }
    case 'hat': {
      const hp = filter(c, 'highpass', 7000, g)
      geraeusch(c, t, t + 0.3, hp)
      huelle(g, t, 0.1 * laut, 0.001, dauer > 0.3 ? 0.14 : 0.04)
      break
    }
    case 'holz': {
      schwingung(c, 'sine', n.ton ? f : 1500, t, t + 0.08, g)
      huelle(g, t, 0.28 * laut, 0.001, 0.04)
      break
    }
    case 'becken': {
      const hp = filter(c, 'highpass', 4500, g)
      geraeusch(c, t, t + 1.6, hp)
      huelle(g, t, 0.16 * laut, 0.004, 1.2)
      break
    }
  }
}

function plane(c: AudioContext, bus: AudioNode, s: Stueck, start: number) {
  const sek = 60 / s.bpm
  for (const n of s.noten) {
    const beat = s.swing && Math.abs((n.t % 1) - 0.5) < 1e-6 ? n.t + s.swing : n.t
    spieleNote(c, bus, n, start + beat * sek, sek)
  }
}

/** Kurzer Effekt (Jingle, Signalton) – einmal abspielen */
export function spieleEffekt(s: Stueck) {
  if (!an) return
  const c = kontext()
  if (!c || !master) return
  const bus = c.createGain()
  bus.gain.value = s.laut ?? 0.8
  bus.connect(master)
  plane(c, bus, s, c.currentTime + 0.03)
  const dauer = Math.max(0, ...s.noten.map((n) => n.t + (n.dauer ?? 0.5))) * (60 / s.bpm)
  setTimeout(() => bus.disconnect(), (dauer + 3) * 1000)
}

/** Musik in Schleife; gibt die Funktion zum (weichen) Beenden zurück */
export function starteSchleife(s: Stueck): () => void {
  if (!an || !s.beats) return () => {}
  const c = kontext()
  if (!c || !master) return () => {}
  const bus = c.createGain()
  bus.gain.setValueAtTime(0.0001, c.currentTime)
  bus.gain.linearRampToValueAtTime(s.laut ?? 0.6, c.currentTime + 0.25)
  bus.connect(master)
  const dauer = (s.beats * 60) / s.bpm
  let naechster = c.currentTime + 0.1
  const nachlegen = () => {
    // Die nächsten Sekunden vorausplanen; so läuft die Musik auch, wenn der Tab kurz gedrosselt wird
    while (naechster - c.currentTime < 2.5) {
      plane(c, bus, s, naechster)
      naechster += dauer
    }
  }
  nachlegen()
  const takt = setInterval(nachlegen, 400)
  return () => {
    clearInterval(takt)
    bus.gain.cancelScheduledValues(c.currentTime)
    bus.gain.setTargetAtTime(0, c.currentTime, 0.08)
    setTimeout(() => bus.disconnect(), 800)
  }
}
