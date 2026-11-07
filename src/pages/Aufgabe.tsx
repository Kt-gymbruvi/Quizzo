import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Knopf, Logo, Meldung, ZurueckLink } from '../components.tsx'
import { Einpassen } from '../einpassen.tsx'
import { HandyEingabe, loesungText } from '../spiel/Handy.tsx'
import {
  beantworte,
  codeNormal,
  gemerkteAufgabe,
  ladeAufgabeZustand,
  merkeAufgabe,
  oeffneAufgabe,
  oeffneFrage,
  trittAufgabeBei,
  MODUS_INFO,
  type AufgabeInfo,
  type AufgabenFrage,
  type AufgabeTeilnahme,
  type AufgabeZustand,
  type Aufgabenmodus,
} from '../lib/aufgaben.ts'
import { FRAGETYPEN } from '../lib/fragetypen.ts'
import { useCountdown, type SchuelerFrage } from '../lib/spiel.ts'
import { fehlerText } from '../lib/supabase.ts'
import { ladeUebungen, merkeErgebnis } from '../lib/wiederholung.ts'

// Schüler (Handy): Aufgabe ohne Live-Spiel – Selbstlernen, Hausaufgabe oder Prüfung, ohne Countdown.

const frist = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

function Rahmen({ titel, children }: { titel?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col gap-3 overflow-hidden px-4 py-3">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <Logo />
        <ZurueckLink />
      </header>
      {titel && <h1 className="shrink-0 text-xl font-extrabold break-words text-white/90">{titel}</h1>}
      {/* Zu viel Inhalt wird verkleinert statt abgeschnitten – kein Scrollen */}
      <Einpassen minimum={0.6}>
        <div className="flex flex-1 flex-col gap-3">{children}</div>
      </Einpassen>
    </main>
  )
}

export default function Aufgabe() {
  const { code } = useParams()
  if (!code) return <CodeEingabe />
  const c = codeNormal(code)
  return <AufgabeOeffnen key={c} code={c} />
}

function CodeEingabe() {
  const [code, setCode] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const navigate = useNavigate()
  function absenden(e: FormEvent) {
    e.preventDefault()
    const c = codeNormal(code)
    if (c.length !== 6) return setFehler('Der Aufgaben-Code hat 6 Zeichen.')
    navigate(`/aufgabe/${c}`)
  }
  return (
    <Rahmen>
      <form onSubmit={absenden} className="flex flex-1 flex-col justify-center gap-5">
        <h2 className="text-center text-3xl font-extrabold">Aufgabe öffnen</h2>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          Aufgaben-Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="ABC234"
            className="rounded-2xl bg-white px-4 py-4 text-center text-4xl font-black tracking-[0.2em] text-quizzo-navy placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
          />
        </label>
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        <Knopf type="submit" className="!py-5 !text-2xl">
          Öffnen
        </Knopf>
        <Link to="/mitspielen" className="text-center text-lg text-white/75 underline underline-offset-4">
          Du hast eine Spiel-PIN (nur Ziffern)? Hier mitspielen
        </Link>
      </form>
    </Rahmen>
  )
}

function AufgabeOeffnen({ code }: { code: string }) {
  const [info, setInfo] = useState<AufgabeInfo | null>(null)
  const [teilnahme, setTeilnahme] = useState<AufgabeTeilnahme | null>(() => gemerkteAufgabe(code))
  const [zustand, setZustand] = useState<AufgabeZustand | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    oeffneAufgabe(code)
      .then(setInfo)
      .catch((e) => setFehler(fehlerText(e)))
  }, [code])

  const zustandLaden = useCallback(
    (t: AufgabeTeilnahme) =>
      ladeAufgabeZustand(t)
        .then((z) => {
          if (z) return setZustand(z)
          // Anmeldung gilt nicht mehr (z. B. Code freigegeben): vergessen
          merkeAufgabe(code, null)
          setTeilnahme(null)
        })
        .catch((e) => setFehler(fehlerText(e))),
    [code],
  )

  useEffect(() => {
    if (teilnahme && info && info.modus !== 'selbstlernen') zustandLaden(teilnahme)
  }, [teilnahme, info, zustandLaden])

  if (fehler && !info) {
    return (
      <Rahmen>
        <div className="flex flex-1 flex-col justify-center gap-5">
          <Meldung art="fehler">{fehler}</Meldung>
          <Link to="/aufgabe" className="text-center text-xl font-bold text-quizzo-yellow underline underline-offset-4">
            Anderen Code eingeben
          </Link>
        </div>
      </Rahmen>
    )
  }
  if (!info) return <Rahmen><p className="m-auto text-xl text-white/70">Aufgabe wird geladen …</p></Rahmen>

  const kopf = `${MODUS_INFO[info.modus].symbol} ${info.titel}`

  if (info.modus === 'selbstlernen') {
    if (!info.offen || !info.fragen) return <Rahmen titel={kopf}><Beendet /></Rahmen>
    return <Bearbeiten code={code} modus="selbstlernen" titel={kopf} fragen={info.fragen} teilnahme={null} start={null} />
  }

  if (!teilnahme) {
    if (!info.offen) return <Rahmen titel={kopf}><Beendet /></Rahmen>
    return (
      <Anmelden
        info={info}
        titel={kopf}
        angemeldet={(t) => {
          merkeAufgabe(code, t)
          setTeilnahme(t)
        }}
      />
    )
  }
  if (!zustand) {
    return (
      <Rahmen titel={kopf}>
        {fehler ? <Meldung art="fehler">{fehler}</Meldung> : <p className="m-auto text-xl text-white/70">Einen Moment …</p>}
      </Rahmen>
    )
  }
  return <Bearbeiten code={code} modus={info.modus} titel={kopf} fragen={zustand.fragen} teilnahme={teilnahme} start={zustand} />
}

function Beendet({ text }: { text?: string }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl" aria-hidden="true">
        ⏰
      </p>
      <p className="text-3xl font-black">Diese Aufgabe ist beendet.</p>
      <p className="text-xl text-white/80">{text ?? 'Antworten sind nicht mehr möglich.'}</p>
    </section>
  )
}

function Anmelden({ info, titel, angemeldet }: { info: AufgabeInfo; titel: string; angemeldet: (t: AufgabeTeilnahme) => void }) {
  const pruefung = info.modus === 'pruefung'
  const [name, setName] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (!name.trim()) return setFehler(pruefung ? 'Bitte gib deinen Prüfungscode ein.' : 'Bitte gib einen Spitznamen ein.')
    setLaeuft(true)
    try {
      angemeldet(await trittAufgabeBei(info.code, name))
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Rahmen titel={titel}>
      <form onSubmit={absenden} className="flex flex-1 flex-col justify-center gap-5">
        <p className="text-center text-xl text-white/85">
          {MODUS_INFO[info.modus].name} · {info.anzahl_fragen} {info.anzahl_fragen === 1 ? 'Frage' : 'Fragen'}
          {info.frist && (
            <>
              <br />
              {pruefung ? 'Ende' : 'Abgabe bis'}: <b>{frist.format(new Date(info.frist))}</b>
            </>
          )}
        </p>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          {pruefung ? 'Dein Prüfungscode (vom Zettel)' : 'Spitzname'}
          <input
            value={name}
            onChange={(e) => setName(pruefung ? e.target.value.toUpperCase().slice(0, 8) : e.target.value)}
            maxLength={pruefung ? 8 : 20}
            autoComplete="off"
            autoCapitalize={pruefung ? 'characters' : 'words'}
            placeholder={pruefung ? 'K7F-2QM' : 'z. B. Schlauer Fuchs'}
            className="rounded-2xl bg-white px-4 py-4 text-center text-3xl font-bold text-quizzo-navy placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
          />
        </label>
        <p className="text-center text-base text-white/75">
          {pruefung
            ? 'Gib nicht deinen Namen ein – nur den Code. Jede Frage kann nur einmal beantwortet werden.'
            : 'Bitte nicht deinen echten Namen verwenden. Deine Lehrkraft sieht Spitzname und Punkte. Jede Frage kann nur einmal beantwortet werden.'}
        </p>
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        <Knopf type="submit" disabled={laeuft} className="!py-5 !text-2xl">
          {laeuft ? 'Einen Moment …' : 'Los geht’s!'}
        </Knopf>
      </form>
    </Rahmen>
  )
}

type Rueckmeldung = { frage: SchuelerFrage; anteil: number; punkte?: number; loesung: unknown; zuSpaet?: boolean }

/** „90 Sekunden“, „1 Minute“, „2 Minuten“ */
const zeitText = (s: number) => (s < 60 || s % 60 ? `${s} Sekunden` : s === 60 ? '1 Minute' : `${s / 60} Minuten`)

function Bearbeiten({
  code,
  modus,
  titel,
  fragen,
  teilnahme,
  start,
}: {
  code: string
  modus: Aufgabenmodus
  titel: string
  fragen: AufgabenFrage[]
  teilnahme: AufgabeTeilnahme | null
  start: AufgabeZustand | null
}) {
  const einmalig = modus !== 'selbstlernen'
  // Zeitlimit: Fragen kommen erst beim Öffnen vom Server, die Zeit läuft dort mit
  const mitZeit = einmalig && !!start?.mit_zeit
  const [inhalte, setInhalte] = useState<Record<number, SchuelerFrage>>(() => Object.fromEntries(fragen.flatMap((f, n) => (f.verdeckt ? [] : [[n, f]]))))
  const [uhr, setUhr] = useState<{ nr: number; restzeit_ms: number } | null>(null)
  const [oeffnet, setOeffnet] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const sekunden = useCountdown(uhr?.restzeit_ms, `uhr-${uhr?.nr}`)
  const [erledigt, setErledigt] = useState<Set<number>>(() => new Set(start?.antworten.map((a) => a.frage_nr) ?? []))
  // erste noch offene Frage (Folien davor überspringen wir beim Weitermachen)
  const erste = () => {
    const i = fragen.findIndex((f, n) => f.typ !== 'folie' && !erledigt.has(n))
    return einmalig ? (i < 0 ? fragen.length : erledigt.size ? i : 0) : 0
  }
  const [nr, setNr] = useState(erste)
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null)
  const [ergebnisse, setErgebnisse] = useState<Record<number, number>>(() =>
    Object.fromEntries((start?.antworten ?? []).filter((a) => typeof a.anteil === 'number').map((a) => [a.frage_nr, a.anteil as number])),
  )
  const [punkte, setPunkte] = useState(start?.punkte ?? 0)
  const [fehler, setFehler] = useState<string | null>(null)
  const [beendet, setBeendet] = useState(start ? !start.offen : false)
  const [sendet, setSendet] = useState(false)

  const naechste = (ab: number) => {
    let i = ab + 1
    while (einmalig && i < fragen.length && erledigt.has(i)) i++
    return i
  }
  function weiter() {
    setRueck(null)
    setFehler(null)
    setNr((n) => naechste(n))
  }

  /** Fehler der Server-Funktionen einheitlich behandeln */
  function fehlerBehandeln(err: unknown) {
    const text = fehlerText(err)
    if (/schon beantwortet/.test(text)) {
      setErledigt((s) => new Set(s).add(nr))
      setUhr(null)
      setNr((n) => naechste(n))
    } else if (/beendet/.test(text)) {
      setBeendet(true)
    } else {
      setFehler(text)
    }
  }

  async function frageOeffnen(n: number) {
    if (!teilnahme || oeffnet) return
    setOeffnet(true)
    setFehler(null)
    setHinweis(null)
    try {
      const r = await oeffneFrage(teilnahme, n)
      setInhalte((i) => ({ ...i, [n]: r.frage }))
      setUhr({ nr: n, restzeit_ms: r.restzeit_ms ?? 0 })
    } catch (err) {
      fehlerBehandeln(err)
    } finally {
      setOeffnet(false)
    }
  }

  // Nach dem Neuladen: schon geöffnete Frage direkt weiterzeigen (die Zeit lief auf dem Server weiter)
  const fortgesetzt = useRef(false)
  useEffect(() => {
    if (fortgesetzt.current || !mitZeit) return
    fortgesetzt.current = true
    if (start?.geoeffnet?.some((g) => g.frage_nr === nr)) frageOeffnen(nr)
  }, [])

  async function senden(antwort: unknown) {
    if (sendet) return
    const frage = inhalte[nr] ?? fragen[nr]
    setSendet(true)
    setFehler(null)
    try {
      const r = await beantworte(code, teilnahme, nr, antwort)
      setUhr(null)
      setErledigt((s) => new Set(s).add(nr))
      const anteil = r.anteil ?? 0
      setErgebnisse((e) => ({ ...e, [nr]: anteil }))
      if (r.punkte) setPunkte((p) => p + (r.punkte ?? 0))
      if (modus === 'pruefung') {
        if (r.zu_spaet) setHinweis('Die Zeit für die letzte Frage war abgelaufen.')
        setNr((n) => naechste(n))
      } else {
        merkeErgebnis(frage, r.loesung, anteil)
        setRueck({ frage, anteil, punkte: r.punkte, loesung: r.loesung, zuSpaet: r.zu_spaet })
      }
    } catch (err) {
      fehlerBehandeln(err)
    } finally {
      setSendet(false)
    }
  }

  // Zeit abgelaufen: automatisch „keine Antwort“ schicken (einmal pro Frage)
  const abgelaufen = useRef(-1)
  useEffect(() => {
    if (uhr && uhr.nr === nr && sekunden === 0 && abgelaufen.current !== nr && !rueck) {
      abgelaufen.current = nr
      senden(null)
    }
  }, [sekunden, uhr, nr, rueck])

  const fertig = nr >= fragen.length
  const anzahl = fragen.filter((f) => f.typ !== 'folie').length
  let inhalt

  if (beendet && !fertig) {
    inhalt = <Beendet text={modus === 'hausaufgabe' ? `Bis dahin hast du ${punkte} Punkte gesammelt.` : undefined} />
  } else if (rueck) {
    inhalt = <RueckmeldungAnzeige r={rueck} modus={modus} weiter={weiter} letzte={naechste(nr) >= fragen.length} />
  } else if (fertig) {
    inhalt = <Fertig modus={modus} ergebnisse={ergebnisse} fragen={fragen} punkte={punkte} nochmal={() => { setErgebnisse({}); setNr(0) }} />
  } else if (mitZeit && fragen[nr].typ !== 'folie' && uhr?.nr !== nr) {
    // Zeitlimit: erst bestätigen, dann startet die Zeit
    const position = fragen.slice(0, nr + 1).filter((f) => f.typ !== 'folie').length
    inhalt = (
      <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <p className="text-6xl" aria-hidden="true">
          ⏱
        </p>
        <p className="text-3xl font-black">
          Frage {position} von {anzahl}
        </p>
        <p className="text-xl text-white/85">
          Du hast <b className="text-quizzo-yellow">{zeitText(fragen[nr].zeitlimit)}</b> Zeit. Sie startet, sobald du die Frage öffnest, und läuft weiter, auch wenn du die Seite verlässt.
        </p>
        {hinweis && <p className="rounded-2xl bg-red-600/80 px-4 py-2 text-lg font-bold">{hinweis}</p>}
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        <Knopf onClick={() => frageOeffnen(nr)} disabled={oeffnet} className="w-full !py-5 !text-2xl">
          {oeffnet ? 'Einen Moment …' : 'Frage öffnen'}
        </Knopf>
      </section>
    )
  } else {
    const frage = inhalte[nr] ?? fragen[nr]
    const position = fragen.slice(0, nr + 1).filter((f) => f.typ !== 'folie').length
    const laeuft = uhr?.nr === nr
    inhalt = (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-3 text-base text-white/70">
          <span>
            {frage.typ === 'folie' ? 'Info' : `Frage ${position} von ${anzahl}`}
            {!laeuft && ' · ohne Zeitdruck'}
            {modus === 'pruefung' && ' · keine Rückmeldung'}
          </span>
          {laeuft && sekunden !== null && (
            <span
              className={`flex h-12 min-w-12 shrink-0 items-center justify-center rounded-full px-2 text-2xl font-black tabular-nums ${sekunden <= 5 ? 'bg-red-500 text-white' : 'bg-quizzo-yellow text-quizzo-navy'}`}
              aria-label="Restzeit in Sekunden"
            >
              {sekunden}
            </span>
          )}
        </div>
        <p className={`shrink-0 font-bold leading-snug ${frage.text.length > 120 ? 'text-base' : frage.text.length > 60 ? 'text-lg' : 'text-xl'}`}>{frage.text}</p>
        {frage.typ === 'folie' ? (
          <div className="flex flex-1 flex-col justify-between gap-4">
            {frage.ansicht.text && <p className="text-lg whitespace-pre-wrap text-white/90">{frage.ansicht.text}</p>}
            <Knopf onClick={weiter} className="!py-4 !text-2xl">
              Weiter
            </Knopf>
          </div>
        ) : laeuft && sekunden === 0 ? (
          <p className="m-auto text-3xl font-black">⏱ Zeit abgelaufen</p>
        ) : (
          <HandyEingabe key={nr} frage={frage} senden={senden} />
        )}
        {sendet && <p className="shrink-0 text-center text-white/70">Wird gesendet …</p>}
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
      </div>
    )
  }

  return (
    <Rahmen titel={titel}>
      {start && (
        <p className="shrink-0 text-base text-white/70">
          {modus === 'pruefung' ? 'Code' : 'Als'} <b className="text-white">{start.name}</b>
          {modus === 'hausaufgabe' && ` · ${punkte} Punkte`}
          {start.frist && ` · bis ${frist.format(new Date(start.frist))}`}
        </p>
      )}
      {inhalt}
    </Rahmen>
  )
}

function RueckmeldungAnzeige({ r, modus, weiter, letzte }: { r: Rueckmeldung; modus: Aufgabenmodus; weiter: () => void; letzte: boolean }) {
  const bewertet = FRAGETYPEN[r.frage.typ].bewertet
  const richtig = r.anteil >= 1
  const loesung = bewertet && !richtig ? loesungText(r.frage, r.loesung) : null
  const farbe = r.zuSpaet ? 'bg-red-600' : !bewertet ? 'bg-quizzo-navy-light' : richtig ? 'bg-green-600' : r.anteil > 0 ? 'bg-amber-600' : 'bg-red-600'
  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl px-5 py-6 text-center ${farbe}`}>
      <p className="text-5xl font-black">{r.zuSpaet ? '⏱ Zeit abgelaufen' : !bewertet ? 'Danke!' : richtig ? 'Richtig!' : r.anteil > 0 ? 'Fast!' : 'Leider falsch'}</p>
      {modus === 'hausaufgabe' && bewertet && <p className="text-2xl font-bold">+{r.punkte ?? 0} Punkte</p>}
      {loesung && (
        <p className="text-xl">
          Richtig ist: <b>{loesung}</b>
        </p>
      )}
      {!bewertet && !r.zuSpaet && <p className="text-xl">Deine Antwort ist gespeichert.</p>}
      <Knopf onClick={weiter} className="mt-2 !py-4 !text-2xl">
        {letzte ? 'Fertig' : 'Nächste Frage'}
      </Knopf>
    </div>
  )
}

function Fertig({
  modus,
  ergebnisse,
  fragen,
  punkte,
  nochmal,
}: {
  modus: Aufgabenmodus
  ergebnisse: Record<number, number>
  fragen: SchuelerFrage[]
  punkte: number
  nochmal: () => void
}) {
  const [uebungen] = useState(() => ladeUebungen().length)
  const bewertet = fragen.map((f, n) => (FRAGETYPEN[f.typ].bewertet ? n : -1)).filter((n) => n >= 0 && n in ergebnisse)
  const richtig = bewertet.filter((n) => ergebnisse[n] >= 1).length
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl" aria-hidden="true">
        {modus === 'pruefung' ? '✅' : '🎉'}
      </p>
      {modus === 'pruefung' ? (
        <>
          <p className="text-3xl font-black">Abgegeben!</p>
          <p className="text-xl text-white/85">Alle Antworten sind gespeichert. Deine Lehrkraft sieht dein Ergebnis.</p>
        </>
      ) : modus === 'hausaufgabe' ? (
        <>
          <p className="text-3xl font-black">Abgegeben!</p>
          <p className="text-4xl font-black text-quizzo-yellow">{punkte} Punkte</p>
          {bewertet.length > 0 && <p className="text-xl text-white/85">{richtig} von {bewertet.length} Fragen richtig</p>}
        </>
      ) : (
        <>
          <p className="text-3xl font-black">Geschafft!</p>
          {bewertet.length > 0 && <p className="text-2xl text-quizzo-yellow">{richtig} von {bewertet.length} richtig</p>}
          <Knopf onClick={nochmal} className="!py-4 !text-2xl">
            Nochmal üben
          </Knopf>
        </>
      )}
      {modus !== 'pruefung' && uebungen > 0 && (
        <Link to="/wiederholen" className="rounded-2xl bg-white/15 px-5 py-3 text-xl font-bold text-quizzo-yellow underline-offset-4 hover:underline">
          🔁 {uebungen} {uebungen === 1 ? 'Frage' : 'Fragen'} zum Üben gemerkt
        </Link>
      )}
    </section>
  )
}
