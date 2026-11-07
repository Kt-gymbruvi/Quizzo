import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Passt den Inhalt in den freien Platz ein, ohne dass man scrollen muss:
 * Ist er zu hoch oder zu breit, wird er gleichmäßig verkleinert (höchstens bis `minimum`).
 * Ist er kleiner, füllt er den Platz wie gewohnt (Kinder mit `flex-1` wachsen mit).
 * Erst wenn selbst die kleinste Stufe nicht reicht, darf gescrollt werden.
 */
export function Einpassen({ children, minimum = 0.5, className = '' }: { children: ReactNode; minimum?: number; className?: string }) {
  const aussen = useRef<HTMLDivElement>(null)
  const innen = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const a = aussen.current
    const i = innen.current
    if (!a || !i) return
    let bild = 0

    const anpassen = () => {
      const breite = a.clientWidth
      const hoehe = a.clientHeight
      if (!breite || !hoehe) return // z. B. in Tests (jsdom) – dann einfach normal anzeigen
      // Bei Maßstab s wird der Inhalt in (breite/s × hoehe/s) gesetzt und danach um s verkleinert
      const passt = (s: number) => {
        i.style.width = `${breite / s}px`
        i.style.minHeight = `${hoehe / s}px`
        return i.offsetHeight <= hoehe / s + 1 && i.scrollWidth <= breite / s + 1
      }
      let s = 1
      if (!passt(1)) {
        if (!passt(minimum)) s = minimum
        else {
          let unten = minimum
          let oben = 1
          for (let k = 0; k < 7; k++) {
            const mitte = (unten + oben) / 2
            if (passt(mitte)) unten = mitte
            else oben = mitte
          }
          s = unten
        }
        passt(s)
      }
      i.style.transform = s < 1 ? `scale(${s})` : ''
      a.style.overflowY = i.offsetHeight * s > hoehe + 1 ? 'auto' : 'hidden'
    }
    const planen = () => {
      cancelAnimationFrame(bild)
      bild = requestAnimationFrame(anpassen)
    }

    anpassen()
    const groesse = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(planen) : null
    groesse?.observe(a)
    const aenderung = typeof MutationObserver !== 'undefined' ? new MutationObserver(planen) : null
    aenderung?.observe(i, { childList: true, subtree: true, characterData: true })
    i.addEventListener('load', planen, true) // Bilder ändern nach dem Laden ihre Höhe
    return () => {
      cancelAnimationFrame(bild)
      groesse?.disconnect()
      aenderung?.disconnect()
      i.removeEventListener('load', planen, true)
    }
  }, [minimum])

  return (
    <div ref={aussen} className={`relative min-h-0 flex-1 overflow-hidden ${className}`}>
      <div ref={innen} className="absolute top-0 left-0 flex w-full origin-top-left flex-col">
        {children}
      </div>
    </div>
  )
}
