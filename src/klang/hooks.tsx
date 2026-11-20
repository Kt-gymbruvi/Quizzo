import { useEffect, useRef, useSyncExternalStore } from 'react'
import { abonniereTon, setzeTon, spieleEffekt, starteSchleife, tonAn, type Stueck } from './motor.ts'

export function useTonAn() {
  return useSyncExternalStore(abonniereTon, tonAn, () => true)
}

/** Spielt die Musik in Schleife, solange `schleife` gesetzt ist (und der Ton an ist); wechselt beim Ändern weich */
export function useSchleife(schleife: Stueck | null) {
  const an = useTonAn()
  useEffect(() => {
    if (!schleife || !an) return
    return starteSchleife(schleife)
  }, [schleife, an])
}

/** Spielt `effekt` einmal, sobald sich `schluessel` ändert (null/undefined = nichts spielen) */
export function useEffektBei(schluessel: string | number | null | undefined, effekt: Stueck | null) {
  const aktuell = useRef(effekt)
  aktuell.current = effekt
  useEffect(() => {
    if (schluessel === null || schluessel === undefined || !aktuell.current) return
    spieleEffekt(aktuell.current)
  }, [schluessel])
}

/** Ruft `aktion` auf, wenn sich `wert` ändert (nicht beim ersten Wert, damit beim Öffnen nichts klingt) */
export function useBeiAenderung<T>(wert: T | undefined, aktion: (alt: T, neu: T) => void) {
  const alt = useRef<T | undefined>(undefined)
  const tun = useRef(aktion)
  tun.current = aktion
  useEffect(() => {
    if (wert === undefined) return
    if (alt.current !== undefined && alt.current !== wert) tun.current(alt.current, wert)
    alt.current = wert
  }, [wert])
}

/** Kleiner Schalter für die Kopfzeile am Beamer */
export function TonSchalter({ className = '' }: { className?: string }) {
  const an = useTonAn()
  return (
    <button
      type="button"
      onClick={() => setzeTon(!an)}
      aria-pressed={an}
      aria-label={an ? 'Ton ausschalten' : 'Ton einschalten'}
      title={an ? 'Musik und Töne sind an – zum Ausschalten antippen' : 'Musik und Töne sind aus – zum Einschalten antippen'}
      className={`rounded-xl bg-white/10 px-4 py-2 text-xl font-bold hover:bg-white/20 ${an ? '' : 'opacity-70'} ${className}`}
    >
      {an ? '🔊' : '🔇'}
    </button>
  )
}
