import { useMemo, type CSSProperties } from 'react'

// Wortwolke am Beamer: Die Frage steht in der Mitte, die genannten Wörter schweben darum herum
// und bleiben ständig leicht in Bewegung. Größe = Häufigkeit. Antippen blendet ein Wort aus.
// (Dieselbe Datei gibt es in Klassenfunk – beide Projekte sind getrennte Repositories.)

export interface Wort {
  schluessel: string
  text: string
  anzahl: number
}

export interface Platz extends Wort {
  /** Mittelpunkt in Einheiten der Breite (0–100) bzw. Höhe (0–HOEHE) */
  x: number
  y: number
  /** Schriftgröße in cqw (Prozent der Breite der Wolke) */
  schrift: number
}

export interface WolkenLayout {
  frage: { schrift: number; breite: number }
  woerter: Platz[]
}

export const BREITE = 100
export const HOEHE = 50
const MAX_WOERTER = 60

type Kasten = { x: number; y: number; b: number; h: number }
const ueberlappt = (a: Kasten, b: Kasten, rand: number) => Math.abs(a.x - b.x) < (a.b + b.b) / 2 + rand && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + rand
const imBild = (k: Kasten) => k.x - k.b / 2 >= 1 && k.x + k.b / 2 <= BREITE - 1 && k.y - k.h / 2 >= 1 && k.y + k.h / 2 <= HOEHE - 1

/**
 * Legt die Wörter spiralförmig um die Frage herum aus (häufigste zuerst, also am nächsten an der Frage),
 * ohne dass sich etwas überlappt. Rein rechnerisch und ohne Zufall: gleiche Eingabe = gleiche Wolke.
 */
export function legeWolkeAus(frage: string, woerter: Wort[]): WolkenLayout {
  // Frage-Kasten in der Mitte: je länger der Text, desto kleiner die Schrift
  const schriftFrage = frage.length <= 30 ? 3.4 : frage.length <= 70 ? 2.8 : frage.length <= 130 ? 2.2 : 1.8
  const maxBreite = 38
  const einzeilig = frage.length * schriftFrage * 0.52
  const zeilen = Math.max(1, Math.ceil(einzeilig / (maxBreite - 5)))
  const breiteFrage = Math.min(maxBreite, einzeilig + 5)
  const mitte: Kasten = { x: BREITE / 2, y: HOEHE / 2, b: breiteFrage, h: zeilen * schriftFrage * 1.25 + 3.5 }

  const liste = woerter.slice(0, MAX_WOERTER)
  const max = Math.max(1, ...liste.map((w) => w.anzahl))
  const belegt: Kasten[] = [mitte]
  const platziert: Platz[] = []

  for (const w of liste) {
    let schrift = 2.4 + Math.pow(w.anzahl / max, 0.8) * 4.4
    for (let versuch = 0; versuch < 7; versuch++, schrift *= 0.88) {
      const b = w.text.length * schrift * 0.58 + 1.2
      const h = schrift * 1.2 + 0.6
      let fund: Kasten | null = null
      for (let k = 0; k < 600 && !fund; k++) {
        const winkel = k * 0.55
        const radius = 1 + k * 0.13
        const kasten = { x: BREITE / 2 + Math.cos(winkel) * radius * 1.9, y: HOEHE / 2 + Math.sin(winkel) * radius, b, h }
        if (imBild(kasten) && !belegt.some((o) => ueberlappt(kasten, o, 0.8))) fund = kasten
      }
      if (fund) {
        belegt.push(fund)
        platziert.push({ ...w, x: fund.x, y: fund.y, schrift })
        break
      }
    }
  }
  return { frage: { schrift: schriftFrage, breite: breiteFrage }, woerter: platziert }
}

/** Stabile Pseudo-Zufallszahlen je Wort, damit jedes Wort seine eigene Schwebebewegung hat */
function streuung(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  h >>>= 0
  const z = (n: number) => ((h >>> n) & 255) / 255
  const dauer = 6 + z(0) * 5
  return {
    dauer,
    versatz: -z(8) * dauer,
    dx: (z(16) < 0.5 ? 1 : -1) * (0.7 + z(24) * 1.0),
    dy: 0.5 + z(4) * 0.8,
    dreh: (z(12) - 0.5) * 3,
  }
}

export function Wortwolke({
  frage,
  woerter,
  waehle,
  farben,
  frageKlasse,
}: {
  frage: string
  woerter: Wort[]
  /** Wort angetippt (Schlüssel) – z. B. zum Ausblenden */
  waehle: (schluessel: string) => void
  /** Tailwind-Textfarben, reihum auf die Wörter verteilt */
  farben: string[]
  /** Farbklassen für den Frage-Kasten in der Mitte */
  frageKlasse: string
}) {
  const layout = useMemo(() => legeWolkeAus(frage, woerter), [frage, woerter])
  return (
    <div className="flex flex-col gap-2">
      {/* cqw = Prozent der Breite dieses Kastens: alles skaliert gleichmäßig mit der Bildschirmgröße */}
      <div className="relative w-full overflow-hidden rounded-3xl bg-white/5" style={{ aspectRatio: `${BREITE} / ${HOEHE}`, containerType: 'inline-size' }}>
        <p
          className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-[2cqw] px-[1.5cqw] py-[0.9cqw] text-center leading-tight font-extrabold break-words shadow-lg ${frageKlasse}`}
          style={{ left: '50%', top: '50%', width: `${layout.frage.breite}%`, fontSize: `${layout.frage.schrift}cqw` }}
        >
          {frage}
        </p>
        <ul className="absolute inset-0" aria-label="Wortwolke">
          {layout.woerter.map((w, i) => {
            const s = streuung(w.schluessel)
            const stil = {
              left: `${w.x}%`,
              top: `${(w.y / HOEHE) * 100}%`,
              fontSize: `${w.schrift}cqw`,
              '--dx': `${s.dx}cqw`,
              '--dy': `${s.dy}cqw`,
              '--dr': `${s.dreh}deg`,
            } as CSSProperties
            return (
              <li key={w.schluessel} className="wolke-platz absolute -translate-x-1/2 -translate-y-1/2" style={stil}>
                <button
                  type="button"
                  onClick={() => waehle(w.schluessel)}
                  title="Antippen zum Ausblenden"
                  className={`wolke-wort block leading-none font-black whitespace-nowrap hover:line-through ${farben[i % farben.length]}`}
                  style={{ animationDuration: `${s.dauer}s`, animationDelay: `${s.versatz}s` }}
                >
                  {w.text}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
