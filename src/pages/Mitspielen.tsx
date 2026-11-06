import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Knopf, Logo, Meldung, ZurueckLink } from '../components.tsx'
import { HandyAuswertung, HandyEingabe } from '../spiel/Handy.tsx'
import {
  antworte,
  gemerkteTeilnahme,
  ladeSchuelerZustand,
  merkeTeilnahme,
  trittBei,
  useCountdown,
  useRegelmaessig,
  useSpielKanal,
  type SchuelerZustand,
  type Teilnahme,
} from '../lib/spiel.ts'
import { fehlerText } from '../lib/supabase.ts'

// Schüleransicht: fürs Handy optimiert. Kein Konto, nur PIN und Spitzname.
export default function Mitspielen() {
  const [teilnahme, setTeilnahme] = useState<Teilnahme | null>(() => gemerkteTeilnahme())

  function verlassen() {
    merkeTeilnahme(null)
    setTeilnahme(null)
  }

  if (!teilnahme) {
    return (
      <Beitreten
        beigetreten={(t) => {
          merkeTeilnahme(t)
          setTeilnahme(t)
        }}
      />
    )
  }
  return <SchuelerSpiel teilnahme={teilnahme} verlassen={verlassen} />
}

function Beitreten({ beigetreten }: { beigetreten: (t: Teilnahme) => void }) {
  const [params] = useSearchParams()
  const [pin, setPin] = useState(() => (params.get('pin') ?? '').replace(/\D/g, '').slice(0, 6))
  const [name, setName] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (!/^\d{6}$/.test(pin)) {
      setFehler('Die Spiel-PIN hat 6 Ziffern.')
      return
    }
    if (!name.trim()) {
      setFehler('Bitte gib einen Spitznamen ein.')
      return
    }
    setLaeuft(true)
    try {
      beigetreten(await trittBei(pin, name))
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-5 py-6">
      <header className="flex items-center justify-between">
        <Logo />
        <ZurueckLink />
      </header>
      <form onSubmit={absenden} className="flex flex-1 flex-col justify-center gap-5">
        <h2 className="text-center text-3xl font-extrabold">Mitspielen</h2>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          Spiel-PIN
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="123456"
            className="rounded-2xl bg-white px-4 py-4 text-center text-4xl font-black tracking-[0.2em] text-quizzo-navy placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
          />
        </label>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          Spitzname
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            autoCapitalize="words"
            placeholder="z. B. Schlauer Fuchs"
            className="rounded-2xl bg-white px-4 py-4 text-center text-2xl font-bold text-quizzo-navy placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
          />
        </label>
        <p className="text-center text-base text-white/75">Bitte nicht deinen echten Namen verwenden. Du brauchst kein Konto.</p>
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        <Knopf type="submit" disabled={laeuft} className="!py-5 !text-2xl">
          {laeuft ? 'Einen Moment …' : 'Los geht’s!'}
        </Knopf>
      </form>
    </main>
  )
}

function SchuelerSpiel({ teilnahme, verlassen }: { teilnahme: Teilnahme; verlassen: () => void }) {
  const [z, setZ] = useState<SchuelerZustand | null | undefined>(undefined)
  const [letzterZustand, setLetzterZustand] = useState<SchuelerZustand | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gesendet, setGesendet] = useState<{ frageNr: number } | null>(null)

  const laden = useCallback(async () => {
    try {
      const neu = await ladeSchuelerZustand(teilnahme)
      setZ(neu)
      if (neu) setLetzterZustand(neu)
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }, [teilnahme])

  const signal = useSpielKanal(teilnahme.spiel_id, laden)
  useRegelmaessig(laden, 2000, z !== null)
  const sekunden = useCountdown(z?.restzeit_ms, `${z?.status}-${z?.frage_nr}`)

  // Fehlermeldung einer alten Frage nicht stehen lassen
  const letzteFrage = useRef<number | null>(null)
  useEffect(() => {
    if (z && z.frage_nr !== letzteFrage.current) {
      letzteFrage.current = z.frage_nr
      setFehler(null)
    }
  }, [z])

  async function waehlen(antwort: unknown) {
    if (!z) return
    setGesendet({ frageNr: z.frage_nr })
    try {
      await antworte(teilnahme, z.frage_nr, antwort)
      signal()
    } catch (err) {
      setFehler(fehlerText(err))
    }
    laden()
  }

  const kopf = (
    <header className="flex items-center justify-between gap-3">
      <span className="text-2xl font-black text-quizzo-yellow">Quizzo</span>
      <span className="truncate rounded-full bg-white/10 px-4 py-1 text-lg font-bold">{teilnahme.spitzname}</span>
    </header>
  )

  let inhalt
  if (z === undefined) {
    inhalt = <Mitte>{fehler ? <Meldung art="fehler">{fehler}</Meldung> : <p className="text-xl text-white/70">Verbinde …</p>}</Mitte>
  } else if (z === null) {
    inhalt = (
      <Mitte>
        {letzterZustand?.status === 'ende' ? (
          <Ergebnis z={letzterZustand} />
        ) : (
          <p className="text-2xl font-bold">Das Spiel ist beendet oder du wurdest entfernt.</p>
        )}
        <p className="text-lg text-white/70">Deine Spieldaten wurden gelöscht.</p>
        <Knopf onClick={verlassen}>Neues Spiel beitreten</Knopf>
      </Mitte>
    )
  } else if (z.status === 'lobby') {
    inhalt = (
      <Mitte>
        <p className="text-4xl font-black">Du bist dabei!</p>
        <p className="text-xl text-white/80">Schau nach vorne – gleich geht’s los.</p>
        <p className="text-lg text-white/60">{z.anzahl_spieler} Mitspielende</p>
      </Mitte>
    )
  } else if (z.status === 'frage' && z.frage) {
    const schonGesendet = z.meine_antwort !== null || gesendet?.frageNr === z.frage_nr
    if (schonGesendet) {
      inhalt = (
        <Mitte>
          <p className="text-3xl font-black">Antwort gesendet!</p>
          <p className="text-xl text-white/80">Warte auf die anderen …</p>
          {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        </Mitte>
      )
    } else if (sekunden === 0) {
      inhalt = (
        <Mitte>
          <p className="text-3xl font-black">Zeit abgelaufen</p>
        </Mitte>
      )
    } else {
      inhalt = (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg text-white/70">
              Frage {z.frage_nr + 1} von {z.anzahl_fragen}
            </span>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-quizzo-yellow text-2xl font-black text-quizzo-navy tabular-nums">
              {sekunden ?? ''}
            </span>
          </div>
          <p className="text-xl font-bold leading-snug">{z.frage.text}</p>
          {fehler && <Meldung art="fehler">{fehler}</Meldung>}
          {/* key: Eingaben (z. B. Sortierung) bei jeder neuen Frage zurücksetzen */}
          <HandyEingabe key={z.frage_nr} frage={z.frage} senden={waehlen} />
        </div>
      )
    }
  } else if (z.status === 'auswertung') {
    inhalt = <HandyAuswertung z={z} />
  } else if (z.status === 'ende') {
    inhalt = (
      <Mitte>
        <Ergebnis z={z} />
      </Mitte>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-4">
      {kopf}
      {inhalt}
    </main>
  )
}

function Mitte({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">{children}</section>
}

function Ergebnis({ z }: { z: SchuelerZustand }) {
  const medaille = ['🥇', '🥈', '🥉'][z.platz - 1]
  return (
    <>
      <p className="text-2xl font-bold text-white/80">Endstand</p>
      {medaille && <p className="text-7xl" aria-hidden="true">{medaille}</p>}
      <p className="text-5xl font-black text-quizzo-yellow">Platz {z.platz}</p>
      <p className="text-2xl">
        von {z.anzahl_spieler} · {z.punkte} Punkte
      </p>
      <p className="text-xl text-white/80">Danke fürs Mitspielen!</p>
    </>
  )
}
