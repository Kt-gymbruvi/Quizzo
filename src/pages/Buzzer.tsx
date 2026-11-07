import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Knopf, Logo, ZurueckLink } from '../components.tsx'
import { istBuzzerPin, useBuzzerTeam } from '../lib/buzzer.ts'
import { TEAMS } from '../lib/teams.ts'

// Buzzer fürs Klassen-Duell (Handy, ein Gerät pro Team). Kein Konto, kein Name – nur Team wählen und drücken.
// Es wird nichts gespeichert außer der Teamwahl in diesem Browser-Tab.

const teamStil = (i: number) => TEAMS[i % TEAMS.length]

export default function Buzzer() {
  const [params, setParams] = useSearchParams()
  const pin = params.get('pin') ?? ''
  if (!istBuzzerPin(pin)) return <PinEingabe weiter={(p) => setParams({ pin: p })} />
  return <TeamBuzzer pin={pin} />
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col gap-4 overflow-hidden px-5 py-4">
      <header className="flex shrink-0 items-center justify-between">
        <Logo />
        <ZurueckLink zu="/mitspielen" text="← Mitspielen" />
      </header>
      {children}
    </main>
  )
}

function PinEingabe({ weiter }: { weiter: (pin: string) => void }) {
  const [pin, setPin] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  function absenden(e: FormEvent) {
    e.preventDefault()
    if (!istBuzzerPin(pin)) return setFehler('Die Buzzer-PIN hat 6 Ziffern.')
    weiter(pin)
  }
  return (
    <Rahmen>
      <form onSubmit={absenden} className="flex flex-1 flex-col justify-center gap-5">
        <h2 className="text-center text-3xl font-extrabold">🔔 Buzzer fürs Klassen-Duell</h2>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          Buzzer-PIN (steht am Beamer)
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="123456"
            className="rounded-2xl bg-white px-4 py-4 text-center text-4xl font-black tracking-[0.2em] text-quizzo-navy placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
          />
        </label>
        {fehler && (
          <p role="alert" className="text-center text-lg font-bold text-red-300">
            {fehler}
          </p>
        )}
        <Knopf type="submit" className="!py-5 !text-2xl">
          Weiter
        </Knopf>
      </form>
    </Rahmen>
  )
}

function TeamBuzzer({ pin }: { pin: string }) {
  const speicher = `quizzo-buzzer-team-${pin}`
  const [team, setTeam] = useState<number | null>(() => {
    try {
      const t = Number(sessionStorage.getItem(speicher))
      return sessionStorage.getItem(speicher) !== null && Number.isInteger(t) ? t : null
    } catch {
      return null
    }
  })
  const { zustand, verbunden, buzz } = useBuzzerTeam(pin, team)

  useEffect(() => {
    try {
      if (team === null) sessionStorage.removeItem(speicher)
      else sessionStorage.setItem(speicher, String(team))
    } catch {
      /* egal */
    }
  }, [team, speicher])

  // Noch nichts vom Beamer gehört
  if (!zustand) {
    return (
      <Rahmen>
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-3xl font-black">Verbinde mit dem Duell …</p>
          <p className="text-lg text-white/70">PIN {pin}. Das Duell muss am Beamer geöffnet sein.</p>
        </section>
      </Rahmen>
    )
  }

  // Team wählen
  if (team === null || team >= zustand.teams.length) {
    return (
      <Rahmen>
        <h2 className="shrink-0 text-center text-3xl font-extrabold">Welches Team seid ihr?</h2>
        <div className="grid flex-1 gap-3" style={{ gridTemplateRows: `repeat(${zustand.teams.length}, minmax(0, 1fr))` }}>
          {zustand.teams.map((t, i) => (
            <button key={i} type="button" onClick={() => setTeam(i)} className={`rounded-3xl text-3xl font-black text-white ${teamStil(i).farbe}`}>
              {teamStil(i).zeichen} {t.name}
            </button>
          ))}
        </div>
      </Rahmen>
    )
  }

  const ich = zustand.teams[team]
  const gesperrt = zustand.gesperrt.includes(team)
  const darf = zustand.offen && zustand.dran === null && !gesperrt
  let text: string
  if (!verbunden) text = 'Keine Verbindung zum Beamer …'
  else if (zustand.dran === team) text = 'Ihr seid dran! Antwortet laut.'
  else if (zustand.dran !== null) text = `${zustand.teams[zustand.dran].name} ist dran.`
  else if (gesperrt) text = 'Bei dieser Frage seid ihr schon dran gewesen.'
  else if (zustand.offen) text = 'Wisst ihr es? Schnell drücken!'
  else text = 'Warten auf die nächste Frage …'

  return (
    <Rahmen>
      <div className={`flex shrink-0 items-center justify-between rounded-2xl px-4 py-2 text-xl font-extrabold text-white ${teamStil(team).farbe}`}>
        <span>
          {teamStil(team).zeichen} {ich.name}
        </span>
        <span className="tabular-nums">{ich.punkte} Punkte</span>
      </div>
      {zustand.frage && <p className="shrink-0 text-center text-lg text-white/75">{zustand.frage}</p>}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={buzz}
          disabled={!darf || !verbunden}
          aria-label="Buzzer"
          className={`aspect-square w-[min(80vw,22rem)] rounded-full text-6xl font-black text-white shadow-[0_12px_0_rgba(0,0,0,0.35)] transition active:translate-y-2 active:shadow-none disabled:shadow-none ${
            zustand.dran === team ? `${teamStil(team).farbe} ring-8 ring-white` : darf && verbunden ? 'bg-red-600' : 'bg-white/10 text-white/40'
          }`}
        >
          {zustand.dran === team ? '✓' : 'BUZZ!'}
        </button>
      </div>
      <p className="shrink-0 text-center text-2xl font-bold" role="status" aria-live="polite">
        {text}
      </p>
      <button type="button" onClick={() => setTeam(null)} className="shrink-0 text-center text-base text-white/50 underline">
        Anderes Team wählen
      </button>
    </Rahmen>
  )
}
