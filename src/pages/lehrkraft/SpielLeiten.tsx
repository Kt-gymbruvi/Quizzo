import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Knopf, Meldung } from '../../components.tsx'
import { ANTWORT_STIL } from '../../lib/antwortStil.ts'
import {
  entferneSpieler,
  ladeLehrkraftZustand,
  loescheSpiel,
  mitspielLink,
  steuereSpiel,
  useCountdown,
  useRegelmaessig,
  useSpielKanal,
  type LehrkraftZustand,
} from '../../lib/spiel.ts'
import { fehlerText } from '../../lib/supabase.ts'

// Beamer-Ansicht (iPad quer): alles groß und kontrastreich
export default function SpielLeiten() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [z, setZ] = useState<LehrkraftZustand | null | undefined>(undefined)
  const [fehler, setFehler] = useState<string | null>(null)
  const [beschaeftigt, setBeschaeftigt] = useState(false)

  const laden = useCallback(async () => {
    if (!id) return
    try {
      setZ(await ladeLehrkraftZustand(id))
      setFehler(null)
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }, [id])

  const signal = useSpielKanal(id, laden)
  useRegelmaessig(laden, 1500)
  const sekunden = useCountdown(z?.restzeit_ms, `${z?.status}-${z?.frage_nr}`)

  const steuern = useCallback(
    async (aktion: 'weiter' | 'aufloesen') => {
      if (!id) return
      setBeschaeftigt(true)
      try {
        await steuereSpiel(id, aktion)
        await laden()
        signal()
      } catch (err) {
        setFehler(fehlerText(err))
      } finally {
        setBeschaeftigt(false)
      }
    },
    [id, laden, signal],
  )

  // Frage automatisch auflösen, wenn die Zeit um ist oder alle geantwortet haben
  const aufgeloest = useRef(-1)
  useEffect(() => {
    if (z?.status !== 'frage') return
    const alleFertig = z.spieler.length > 0 && z.beantwortet >= z.spieler.length
    if ((sekunden === 0 || alleFertig) && aufgeloest.current !== z.frage_nr) {
      aufgeloest.current = z.frage_nr
      steuern('aufloesen')
    }
  }, [z, sekunden, steuern])

  async function beenden(nachfragen: boolean) {
    if (!id) return
    if (nachfragen && !window.confirm('Spiel beenden? Alle Spitznamen, Antworten und Punkte werden gelöscht.')) return
    try {
      await loescheSpiel(id)
      signal()
      navigate('/leiten', { replace: true, state: { hinweis: 'Spiel beendet. Alle Spieldaten wurden gelöscht.' } })
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  async function entfernen(spielerId: string, name: string) {
    if (!window.confirm(`„${name}“ aus dem Spiel entfernen?`)) return
    try {
      await entferneSpieler(spielerId)
      await laden()
      signal()
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  if (z === undefined) {
    return <Rahmen>{fehler ? <Meldung art="fehler">{fehler}</Meldung> : <p className="text-3xl text-white/70">Spiel wird geladen …</p>}</Rahmen>
  }
  if (z === null) {
    return (
      <Rahmen>
        <p className="text-4xl font-bold">Dieses Spiel gibt es nicht mehr.</p>
        <Link to="/leiten" className="text-2xl text-quizzo-yellow underline">
          Zu meinen Quizzen
        </Link>
      </Rahmen>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 px-8 py-6 lg:px-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-5">
          <span className="text-4xl font-black text-quizzo-yellow">Quizzo</span>
          <span className="text-2xl text-white/70">{z.quiz_titel}</span>
        </div>
        <div className="flex items-center gap-5 text-2xl">
          {z.status !== 'lobby' && (
            <span className="rounded-xl bg-white/10 px-4 py-2 font-bold">PIN {z.pin}</span>
          )}
          <Knopf art="leise" className="!text-lg" onClick={() => beenden(true)}>
            {z.status === 'lobby' ? 'Abbrechen' : 'Spiel beenden'}
          </Knopf>
        </div>
      </header>

      {fehler && <Meldung art="fehler">{fehler}</Meldung>}

      {z.status === 'lobby' && <Lobby z={z} beschaeftigt={beschaeftigt} starten={() => steuern('weiter')} entfernen={entfernen} />}
      {z.status === 'frage' && <FrageAnsicht z={z} sekunden={sekunden} beschaeftigt={beschaeftigt} aufloesen={() => steuern('aufloesen')} />}
      {z.status === 'auswertung' && <Auswertung z={z} beschaeftigt={beschaeftigt} weiter={() => steuern('weiter')} />}
      {z.status === 'ende' && <Endstand z={z} beenden={() => beenden(true)} />}
    </main>
  )
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center">{children}</main>
}

function Lobby({
  z,
  beschaeftigt,
  starten,
  entfernen,
}: {
  z: LehrkraftZustand
  beschaeftigt: boolean
  starten: () => void
  entfernen: (id: string, name: string) => void
}) {
  const link = mitspielLink(z.pin)
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: '#0b1f4d', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [link])
  const adresse = `${window.location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, '')

  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[auto_1fr]">
      <section className="flex flex-col items-center gap-5 rounded-3xl bg-white p-8 text-quizzo-navy">
        <p className="text-2xl font-semibold">
          Mitmachen auf <span className="font-black">{adresse}</span>
        </p>
        <p className="text-xl">Spiel-PIN:</p>
        <p className="text-8xl font-black tracking-[0.15em] tabular-nums" aria-label="Spiel-PIN">
          {z.pin}
        </p>
        {qr && <img src={qr} alt="QR-Code zum Mitspielen" className="h-56 w-56" />}
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-4xl font-extrabold">
            {z.spieler.length} {z.spieler.length === 1 ? 'Spieler' : 'Spieler'} dabei
          </h2>
          <Knopf onClick={starten} disabled={beschaeftigt || z.spieler.length === 0} className="!px-10 !py-5 !text-3xl">
            Spiel starten
          </Knopf>
        </div>
        {z.spieler.length === 0 ? (
          <p className="text-2xl text-white/70">Warte auf Mitspielende … Zum Entfernen später einfach auf einen Namen tippen.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {z.spieler.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => entfernen(s.id, s.spitzname)}
                  title="Antippen zum Entfernen"
                  className="rounded-2xl bg-quizzo-navy-light px-5 py-3 text-2xl font-bold ring-1 ring-white/15 transition hover:bg-red-500/60"
                >
                  {s.spitzname}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function FrageKopf({ z, rechts }: { z: LehrkraftZustand; rechts: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <p className="text-2xl font-bold text-white/70">
        Frage {z.frage_nr + 1} von {z.anzahl_fragen}
      </p>
      {rechts}
    </div>
  )
}

function FrageAnsicht({
  z,
  sekunden,
  beschaeftigt,
  aufloesen,
}: {
  z: LehrkraftZustand
  sekunden: number | null
  beschaeftigt: boolean
  aufloesen: () => void
}) {
  if (!z.frage) return null
  return (
    <div className="flex flex-1 flex-col gap-6">
      <FrageKopf
        z={z}
        rechts={
          <div className="flex items-center gap-6">
            <span className="text-2xl">
              <b className="text-4xl">{z.beantwortet}</b> / {z.spieler.length} Antworten
            </span>
            <span
              className="flex h-24 w-24 items-center justify-center rounded-full bg-quizzo-yellow text-5xl font-black text-quizzo-navy tabular-nums"
              aria-label="Verbleibende Sekunden"
            >
              {sekunden ?? ''}
            </span>
            <Knopf art="rahmen" onClick={aufloesen} disabled={beschaeftigt}>
              Auflösen
            </Knopf>
          </div>
        }
      />
      <h2 className="rounded-3xl bg-white px-8 py-10 text-center text-5xl font-extrabold leading-tight text-quizzo-navy">{z.frage.text}</h2>
      <ul className="grid flex-1 grid-cols-2 gap-5">
        {z.frage.antworten.map((a, i) => (
          <li key={i} className={`flex items-center gap-5 rounded-3xl px-6 py-6 text-4xl font-bold text-white ${ANTWORT_STIL[i].farbe}`}>
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-4xl font-black">{ANTWORT_STIL[i].buchstabe}</span>
            {a}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Rangliste({ z, anzahl }: { z: LehrkraftZustand; anzahl: number }) {
  return (
    <ol className="flex flex-col gap-3">
      {z.spieler.slice(0, anzahl).map((s, i) => (
        <li key={s.id} className="flex items-center justify-between gap-4 rounded-2xl bg-quizzo-navy-light px-5 py-3 text-2xl font-bold">
          <span>
            <span className="mr-3 text-quizzo-yellow">{i + 1}.</span>
            {s.spitzname}
          </span>
          <span className="tabular-nums">{s.punkte}</span>
        </li>
      ))}
    </ol>
  )
}

function Auswertung({ z, beschaeftigt, weiter }: { z: LehrkraftZustand; beschaeftigt: boolean; weiter: () => void }) {
  if (!z.frage) return null
  const max = Math.max(1, ...z.verteilung)
  const letzte = z.frage_nr + 1 >= z.anzahl_fragen
  return (
    <div className="flex flex-1 flex-col gap-6">
      <FrageKopf
        z={z}
        rechts={
          <Knopf onClick={weiter} disabled={beschaeftigt} className="!px-10 !py-5 !text-3xl">
            {letzte ? 'Endergebnis zeigen' : 'Nächste Frage'}
          </Knopf>
        }
      />
      <h2 className="text-4xl font-extrabold leading-tight">{z.frage.text}</h2>
      <div className="grid flex-1 gap-8 lg:grid-cols-[3fr_2fr]">
        <ul className="flex flex-col gap-4">
          {z.frage.antworten.map((a, i) => {
            const richtig = i === z.frage!.richtig
            const anzahl = z.verteilung[i] ?? 0
            return (
              <li key={i} className={`flex flex-col gap-2 rounded-3xl p-4 transition ${richtig ? 'bg-green-500/25 ring-4 ring-green-400' : 'opacity-60'}`}>
                <div className="flex items-center justify-between gap-4 text-3xl font-bold">
                  <span className="flex items-center gap-4">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl font-black ${ANTWORT_STIL[i].farbe}`}>{ANTWORT_STIL[i].buchstabe}</span>
                    {a}
                    {richtig && <span aria-label="richtige Antwort"> ✓</span>}
                  </span>
                  <span className="tabular-nums">{anzahl}</span>
                </div>
                <div className="h-4 rounded-full bg-white/10">
                  <div className={`h-4 rounded-full ${ANTWORT_STIL[i].farbe}`} style={{ width: `${(anzahl / max) * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        <section className="flex flex-col gap-4">
          <h3 className="text-3xl font-extrabold text-quizzo-yellow">Bestenliste</h3>
          <Rangliste z={z} anzahl={5} />
        </section>
      </div>
    </div>
  )
}

function Endstand({ z, beenden }: { z: LehrkraftZustand; beenden: () => void }) {
  const [erster, zweiter, dritter] = z.spieler
  const stufe = (s: (typeof z.spieler)[number] | undefined, platz: number, hoehe: string) =>
    s && (
      <div className="flex w-56 flex-col items-center gap-3">
        <span className="text-center text-3xl font-extrabold break-words">{s.spitzname}</span>
        <span className="text-2xl tabular-nums text-white/80">{s.punkte} Punkte</span>
        <div className={`flex w-full items-start justify-center rounded-t-3xl bg-quizzo-yellow pt-4 text-6xl font-black text-quizzo-navy ${hoehe}`}>{platz}</div>
      </div>
    )
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <h2 className="text-6xl font-black text-quizzo-yellow">Endstand</h2>
      <div className="flex items-end justify-center gap-6">
        {stufe(zweiter, 2, 'h-40')}
        {stufe(erster, 1, 'h-56')}
        {stufe(dritter, 3, 'h-28')}
      </div>
      {z.spieler.length > 3 && (
        <div className="w-full max-w-2xl">
          <ol start={4} className="flex flex-col gap-2">
            {z.spieler.slice(3, 10).map((s, i) => (
              <li key={s.id} className="flex justify-between rounded-xl bg-quizzo-navy-light px-5 py-2 text-xl font-bold">
                <span>
                  {i + 4}. {s.spitzname}
                </span>
                <span className="tabular-nums">{s.punkte}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <Knopf onClick={beenden} className="!px-10 !py-5 !text-2xl">
        Spiel beenden und Daten löschen
      </Knopf>
    </div>
  )
}
