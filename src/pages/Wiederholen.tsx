import { useState } from 'react'
import { Knopf, Logo, ZurueckLink } from '../components.tsx'
import { HandyEingabe, loesungText } from '../spiel/Handy.tsx'
import { bewerte, entferneUebung, ladeUebungen, loescheAlleUebungen, type Uebung } from '../lib/wiederholung.ts'

// Wiederholung (Schüler, Handy): falsch beantwortete Fragen aus Live-Spielen in Ruhe noch einmal üben.
// Alles passiert auf diesem Gerät – ohne Countdown, ohne Punkte, ohne Server.

type Ergebnis = { uebung: Uebung; anteil: number }

export default function Wiederholen() {
  const [liste, setListe] = useState(() => ladeUebungen())
  const [nr, setNr] = useState(0)
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const [geschafft, setGeschafft] = useState(0)

  const aktuell = liste.length ? liste[nr % liste.length] : null

  function antworten(antwort: unknown) {
    if (!aktuell) return
    const anteil = bewerte(aktuell, antwort)
    setErgebnis({ uebung: aktuell, anteil })
    if (anteil >= 1) {
      entferneUebung(aktuell.id)
      setGeschafft((g) => g + 1)
    }
  }

  function weiter() {
    if (!ergebnis) return
    const neu = ladeUebungen()
    // richtige Frage ist weg (gleicher Index zeigt schon die nächste), falsche ans Ende stellen
    setNr((n) => (ergebnis.anteil >= 1 ? n : n + 1))
    setListe(neu)
    setErgebnis(null)
  }

  function allesLoeschen() {
    if (!window.confirm('Alle gemerkten Fragen von diesem Gerät löschen?')) return
    loescheAlleUebungen()
    setListe([])
  }

  let inhalt
  if (ergebnis) {
    const richtig = ergebnis.anteil >= 1
    const loesung = loesungText(ergebnis.uebung.frage, ergebnis.uebung.loesung)
    inhalt = (
      <div className={`-mx-4 flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl px-5 py-6 text-center ${richtig ? 'bg-green-600' : ergebnis.anteil > 0 ? 'bg-amber-600' : 'bg-red-600'}`}>
        <p className="text-5xl font-black">{richtig ? 'Richtig!' : ergebnis.anteil > 0 ? 'Fast!' : 'Noch nicht'}</p>
        {richtig ? (
          <p className="text-xl">Diese Frage hast du jetzt drauf – sie ist aus deiner Liste verschwunden.</p>
        ) : (
          loesung && (
            <div className="text-xl">
              Richtig ist: <b>{loesung}</b>
              <p className="mt-2 text-lg">Die Frage bleibt in deiner Liste und kommt später noch einmal.</p>
            </div>
          )
        )}
        <Knopf onClick={weiter} className="mt-2 !py-4 !text-2xl">
          {ladeUebungen().length ? 'Nächste Frage' : 'Fertig'}
        </Knopf>
      </div>
    )
  } else if (!aktuell) {
    inhalt = (
      <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <p className="text-6xl" aria-hidden="true">
          {geschafft ? '🎉' : '✨'}
        </p>
        <p className="text-3xl font-black">{geschafft ? 'Alles geschafft!' : 'Nichts zu wiederholen'}</p>
        <p className="text-xl text-white/80">
          {geschafft
            ? `Du hast ${geschafft} ${geschafft === 1 ? 'Frage' : 'Fragen'} richtig wiederholt.`
            : 'Wenn du in einem Quiz etwas falsch beantwortest, merkt sich dein Handy die Frage hier zum Üben.'}
        </p>
      </section>
    )
  } else {
    inhalt = (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="shrink-0 text-base text-white/70">
          Noch {liste.length} {liste.length === 1 ? 'Frage' : 'Fragen'} · ohne Zeitdruck
        </p>
        <p className={`shrink-0 font-bold leading-snug ${aktuell.frage.text.length > 120 ? 'text-base' : aktuell.frage.text.length > 60 ? 'text-lg' : 'text-xl'}`}>
          {aktuell.frage.text}
        </p>
        <HandyEingabe key={`${aktuell.id}:${nr}`} frage={aktuell.frage} senden={antworten} />
      </div>
    )
  }

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col gap-3 overflow-y-auto px-4 py-3">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <Logo />
        <ZurueckLink />
      </header>
      <h1 className="shrink-0 text-2xl font-extrabold">🔁 Wiederholen</h1>
      {inhalt}
      {liste.length > 0 && !ergebnis && (
        <footer className="shrink-0 text-center text-sm text-white/60">
          Nur auf diesem Gerät gespeichert, höchstens 30 Tage.{' '}
          <button onClick={allesLoeschen} className="underline hover:text-white">
            Alle löschen
          </button>
        </footer>
      )}
    </main>
  )
}
