import type { MouseEvent } from 'react'

// Bild einer Hotspot-Frage mit Markierungen. Alle Angaben in Prozent der Bildbreite/-höhe,
// damit es auf jedem Bildschirm (Beamer, Handy, Editor) gleich passt.

export type Punkt = { x: number; y: number }
export type Ziel = { x: number; y: number; b: number; h: number }

/** Tippstelle in Prozent des Bildes (getBoundingClientRect berücksichtigt auch die Verkleinerung durch <Einpassen>) */
export function tippStelle(e: MouseEvent<HTMLElement>): Punkt {
  const r = e.currentTarget.getBoundingClientRect()
  const prozent = (wert: number, start: number, groesse: number) => (groesse > 0 ? Math.min(100, Math.max(0, ((wert - start) / groesse) * 100)) : 50)
  return { x: Math.round(prozent(e.clientX, r.left, r.width) * 10) / 10, y: Math.round(prozent(e.clientY, r.top, r.height) * 10) / 10 }
}

export function HotspotBild({
  url,
  beschreibung,
  hoehe = 'max-h-[50dvh]',
  tippen,
  marker,
  punkte = [],
  ziel,
  zielBeschriftung = 'Zielbereich',
}: {
  url: string
  beschreibung?: string | null
  /** Tailwind-Klasse für die größte Höhe des Bildes */
  hoehe?: string
  tippen?: (p: Punkt) => void
  /** eigene Wahl (gelber Kreis) */
  marker?: Punkt | null
  /** Antworten aller (kleine Punkte, z. B. am Beamer) */
  punkte?: (Punkt & { richtig?: boolean })[]
  /** Zielbereich (nur nach dem Auflösen / im Editor) */
  ziel?: Ziel | null
  zielBeschriftung?: string
}) {
  return (
    <div className="relative mx-auto w-fit max-w-full">
      <img
        src={url}
        alt={beschreibung ?? 'Bild zur Frage'}
        draggable={false}
        onClick={tippen ? (e) => tippen(tippStelle(e)) : undefined}
        className={`block w-auto max-w-full select-none rounded-2xl bg-white/5 ${hoehe} ${tippen ? 'cursor-crosshair' : ''}`}
      />
      {ziel && (
        <span
          aria-label={zielBeschriftung}
          className="pointer-events-none absolute rounded-lg border-4 border-green-400 bg-green-400/25"
          style={{ left: `${ziel.x - ziel.b / 2}%`, top: `${ziel.y - ziel.h / 2}%`, width: `${ziel.b}%`, height: `${ziel.h}%` }}
        />
      )}
      {punkte.map((p, i) => (
        <span
          key={i}
          className={`pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${p.richtig ? 'bg-green-500' : 'bg-rose-500'}`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        />
      ))}
      {marker && (
        <span
          aria-label="Deine Wahl"
          className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-quizzo-yellow bg-quizzo-yellow/30 shadow-lg"
          style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
        />
      )}
    </div>
  )
}

/** Liegt der Punkt im Zielbereich? (wie antwort_bewerten in der Datenbank) */
export const imZiel = (p: Punkt, z: Ziel) => Math.abs(p.x - z.x) <= z.b / 2 && Math.abs(p.y - z.y) <= z.h / 2
