import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Knopf, Meldung } from '../../components.tsx'
import { Einpassen } from '../../einpassen.tsx'
import { BeamerFrage, BeamerMedium } from '../../spiel/Beamer.tsx'
import {
  alleErledigt,
  alsBeamerFrage,
  ausAdresse,
  feldSchluessel,
  ladeStand,
  loesungZeilen,
  neuerStand,
  punkte,
  rangliste,
  schliesseFeld,
  speichereStand,
  waehleFragen,
  wertVon,
  type Kategorie,
  type Spielstand,
} from '../../lib/duell.ts'
import { ladeQuiz } from '../../lib/quizze.ts'
import { fehlerText } from '../../lib/supabase.ts'
import { TEAMS } from '../../lib/teams.ts'
import { buzzerLink, neuerBuzzerPin, useBuzzerLehrkraft, type BuzzerZustand } from '../../lib/buzzer.ts'

// Klassen-Duell (Jeopardy-Stil) am Beamer: Brett mit Kategorien und Punktefeldern, Teams ohne Handys.
// Der Spielstand bleibt nur auf diesem Gerät (localStorage); auf dem Server wird nichts gespeichert.

const teamStil = (i: number) => TEAMS[i % TEAMS.length]

export default function Duell() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const einstellung = useMemo(() => ausAdresse(params), [params])
  const schluessel = params.toString()
  const [kategorien, setKategorien] = useState<Kategorie[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [stand, setStandRoh] = useState<Spielstand | null>(null)
  const [verlauf, setVerlauf] = useState<Spielstand[]>([]) // für „Rückgängig“
  const [offen, setOffen] = useState<{ k: number; z: number } | null>(null)
  const [ende, setEnde] = useState(false)
  // Buzzer (nur wenn gewählt): wer gerade dran ist, wer bei dieser Frage schon falsch lag, Freigabe-Runde
  const [dran, setDran] = useState<number | null>(null)
  const [gesperrt, setGesperrt] = useState<number[]>([])
  const [runde, setRunde] = useState(0)

  // Quizze laden und Brett aufbauen (oder gespeicherten Stand fortsetzen)
  useEffect(() => {
    if (!einstellung) return
    let aktiv = true
    Promise.all(einstellung.quizIds.map(async (id) => ({ quizId: id, ...(await ladeQuiz(id)) })))
      .then((k) => {
        if (!aktiv) return
        setKategorien(k)
        const alt = ladeStand(schluessel)
        const passt = alt && alt.auswahl.length === k.length && alt.auswahl.every((a, i) => a.every((n) => n < k[i].fragen.length))
        setStandRoh(
          passt
            ? alt
            : neuerStand(
                schluessel,
                k.map((q) => waehleFragen(q.fragen, einstellung.zeilen, einstellung.zufall)),
                TEAMS.slice(0, einstellung.teams).map((t) => `Team ${t.name}`),
              ),
        )
      })
      .catch((e) => aktiv && setFehler(fehlerText(e)))
    return () => {
      aktiv = false
    }
  }, [einstellung, schluessel])

  useEffect(() => {
    if (stand) speichereStand(stand)
  }, [stand])

  const aendere = useCallback(
    (neu: Spielstand) => {
      if (stand) setVerlauf((v) => [...v.slice(-30), stand])
      setStandRoh(neu)
    },
    [stand],
  )

  // Buzzer-PIN einmal pro Duell anlegen (bleibt mit dem Spielstand auf dem Gerät)
  useEffect(() => {
    if (einstellung?.buzzer && stand && !stand.pin) setStandRoh({ ...stand, pin: neuerBuzzerPin() })
  }, [einstellung, stand])

  const buzzerZustand = useMemo<BuzzerZustand | null>(
    () =>
      stand && kategorien
        ? {
            offen: !!offen && dran === null,
            runde,
            // ohne offene Frage ist niemand dran und niemand gesperrt
            dran: offen ? dran : null,
            gesperrt: offen ? gesperrt : [],
            frage: offen ? `${kategorien[offen.k].titel} · ${wertVon(offen.z)}` : null,
            teams: stand.teams,
          }
        : null,
    [stand, kategorien, offen, dran, gesperrt, runde],
  )
  const { verbunden } = useBuzzerLehrkraft(einstellung?.buzzer ? (stand?.pin ?? null) : null, buzzerZustand, (team) => setDran(team))

  function feldOeffnen(k: number, z: number) {
    setDran(null)
    setGesperrt([])
    setRunde((x) => x + 1)
    setOffen({ k, z })
  }
  function buzzerFreigeben() {
    setDran(null)
    setRunde((x) => x + 1)
  }

  function rueckgaengig() {
    const letzter = verlauf[verlauf.length - 1]
    if (!letzter) return
    setVerlauf((v) => v.slice(0, -1))
    setStandRoh(letzter)
    setEnde(false)
  }

  function neueRunde() {
    if (!kategorien || !einstellung || !stand) return
    if (!window.confirm('Neues Duell mit denselben Kategorien und Teams starten? Die Punkte beginnen wieder bei 0.')) return
    aendere(
      neuerStand(
        schluessel,
        kategorien.map((q) => waehleFragen(q.fragen, einstellung.zeilen, einstellung.zufall)),
        stand.teams.map((t) => t.name),
      ),
    )
    if (stand.pin) setStandRoh((s2) => (s2 ? { ...s2, pin: stand.pin } : s2))
    setEnde(false)
    setOffen(null)
  }

  function umbenennen(i: number) {
    if (!stand) return
    const name = window.prompt('Neuer Name für das Team:', stand.teams[i].name)?.trim().slice(0, 30)
    if (name) aendere({ ...stand, teams: stand.teams.map((t, j) => (j === i ? { ...t, name } : t)) })
  }

  if (!einstellung) {
    return (
      <Rahmen>
        <Meldung art="fehler">Dieses Duell ist unvollständig. Bitte wähle unter „Meine Quizze“ 2 bis 6 Quizze aus.</Meldung>
        <Link to="/leiten" className="text-2xl text-quizzo-yellow underline">
          Zu meinen Quizzen
        </Link>
      </Rahmen>
    )
  }
  if (fehler) {
    return (
      <Rahmen>
        <Meldung art="fehler">{fehler}</Meldung>
        <Link to="/leiten" className="text-2xl text-quizzo-yellow underline">
          Zu meinen Quizzen
        </Link>
      </Rahmen>
    )
  }
  if (!kategorien || !stand) {
    return (
      <Rahmen>
        <p className="text-3xl text-white/70">Duell wird vorbereitet …</p>
      </Rahmen>
    )
  }

  const fertig = ende || (alleErledigt(stand) && !offen)
  const leereKategorien = kategorien.filter((_, i) => stand.auswahl[i].length === 0).map((k) => k.titel)

  return (
    <main className="flex h-dvh flex-col gap-4 overflow-hidden px-6 py-4 lg:px-10">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <span className="text-4xl font-black text-quizzo-yellow">Quizzo</span>
          <span className="text-2xl font-bold text-white/80">🏆 Klassen-Duell</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!offen && (
            <>
              <Knopf art="leise" className="!py-2 !text-lg" onClick={rueckgaengig} disabled={!verlauf.length}>
                ↶ Rückgängig
              </Knopf>
              {!fertig && (
                <Knopf art="leise" className="!py-2 !text-lg" onClick={() => setEnde(true)}>
                  Spiel beenden
                </Knopf>
              )}
            </>
          )}
          <Knopf art="leise" className="!py-2 !text-lg" onClick={() => navigate('/leiten')}>
            Zu meinen Quizzen
          </Knopf>
        </div>
      </header>

      <Punktestand stand={stand} umbenennen={offen ? undefined : umbenennen} handys={einstellung.buzzer ? verbunden : undefined} />

      <Einpassen key={offen ? `f-${offen.k}-${offen.z}` : fertig ? 'ende' : 'brett'}>
        {fertig ? (
          <Endstand stand={stand} neueRunde={neueRunde} weiter={!alleErledigt(stand) ? () => setEnde(false) : undefined} />
        ) : offen ? (
          <FrageFeld
            kategorie={kategorien[offen.k]}
            frage={kategorien[offen.k].fragen[stand.auswahl[offen.k][offen.z]]}
            wert={wertVon(offen.z)}
            stand={stand}
            abzug={einstellung.abzug}
            buzzer={einstellung.buzzer ? { dran, freigeben: buzzerFreigeben } : undefined}
            gesperrt={gesperrt}
            zurueck={() => setOffen(null)}
            richtig={(team) => {
              aendere(schliesseFeld(punkte(stand, team, wertVon(offen.z)), feldSchluessel(offen.k, offen.z), team))
              setOffen(null)
            }}
            falsch={(team) => {
              aendere(punkte(stand, team, -wertVon(offen.z)))
              setGesperrt((g) => [...g, team])
              buzzerFreigeben() // ein anderes Team darf buzzern
            }}
            niemand={() => {
              aendere(schliesseFeld(stand, feldSchluessel(offen.k, offen.z), null))
              setOffen(null)
            }}
          />
        ) : (
          <Brett
            kategorien={kategorien}
            stand={stand}
            oeffnen={feldOeffnen}
            hinweis={leereKategorien}
            buzzer={einstellung.buzzer && stand.pin ? <BuzzerHinweis pin={stand.pin} verbunden={verbunden.length} teams={stand.teams.length} /> : undefined}
          />
        )}
      </Einpassen>
    </main>
  )
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center">{children}</main>
}

function Punktestand({ stand, umbenennen, handys }: { stand: Spielstand; umbenennen?: (i: number) => void; handys?: number[] }) {
  return (
    <ol className="flex shrink-0 flex-wrap justify-center gap-3" aria-label="Punktestand">
      {stand.teams.map((t, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => umbenennen?.(i)}
            disabled={!umbenennen}
            title={umbenennen ? 'Antippen zum Umbenennen' : undefined}
            className={`flex items-center gap-3 rounded-2xl px-5 py-2 text-2xl font-extrabold text-white ${teamStil(i).farbe} disabled:cursor-default`}
          >
            <span aria-hidden="true">{teamStil(i).zeichen}</span>
            <span>{t.name}</span>
            {handys && (
              <span className={handys.includes(i) ? '' : 'opacity-30'} aria-label={handys.includes(i) ? 'Buzzer-Handy verbunden' : 'kein Buzzer-Handy'} title={handys.includes(i) ? 'Buzzer-Handy verbunden' : 'kein Buzzer-Handy'}>
                📱
              </span>
            )}
            <span className="rounded-xl bg-black/25 px-3 py-0.5 tabular-nums">{t.punkte}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function Brett({
  kategorien,
  stand,
  oeffnen,
  hinweis,
  buzzer,
}: {
  kategorien: Kategorie[]
  stand: Spielstand
  oeffnen: (k: number, z: number) => void
  hinweis: string[]
  buzzer?: React.ReactNode
}) {
  const zeilen = Math.max(...stand.auswahl.map((a) => a.length), 0)
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="grid flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${kategorien.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${zeilen}, minmax(4.5rem, 1fr))` }}>
        {kategorien.map((k, i) => (
          <h2 key={i} className="flex items-center justify-center rounded-2xl bg-quizzo-yellow px-3 py-3 text-center text-2xl leading-tight font-black break-words text-quizzo-navy">
            {k.titel}
          </h2>
        ))}
        {Array.from({ length: zeilen }, (_, z) =>
          kategorien.map((k, i) => {
            if (stand.auswahl[i][z] === undefined) return <div key={`${i}-${z}`} />
            const sch = feldSchluessel(i, z)
            const erledigt = sch in stand.felder
            const gewinner = stand.felder[sch]
            if (erledigt)
              return (
                <div
                  key={sch}
                  aria-label={`${k.titel}, ${wertVon(z)}: ${gewinner == null ? 'niemand' : stand.teams[gewinner].name}`}
                  className={`flex items-center justify-center rounded-2xl text-3xl font-black ${gewinner == null ? 'bg-white/5 text-white/30' : `${teamStil(gewinner).farbe} text-white/90`}`}
                >
                  {gewinner == null ? '–' : teamStil(gewinner).zeichen}
                </div>
              )
            return (
              <button
                key={sch}
                type="button"
                onClick={() => oeffnen(i, z)}
                aria-label={`${k.titel} für ${wertVon(z)}`}
                className="rounded-2xl bg-quizzo-navy-light text-5xl font-black text-quizzo-yellow tabular-nums shadow-[0_6px_0_rgba(0,0,0,0.35)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-quizzo-yellow active:translate-y-1 active:shadow-none"
              >
                {wertVon(z)}
              </button>
            )
          }),
        )}
      </div>
      {buzzer}
      {hinweis.length > 0 && (
        <p className="text-center text-lg text-white/60">
          Keine passenden Fragen in: {hinweis.join(', ')} (nur Umfragen, Wortwolken, offene Fragen oder Folien).
        </p>
      )}
    </div>
  )
}

function FrageFeld({
  kategorie,
  frage,
  wert,
  stand,
  abzug,
  buzzer,
  gesperrt,
  zurueck,
  richtig,
  falsch,
  niemand,
}: {
  kategorie: Kategorie
  frage: Kategorie['fragen'][number]
  wert: number
  stand: Spielstand
  abzug: boolean
  /** Buzzer gewählt: wer zuerst gebuzzert hat; freigeben = wieder für alle (nicht gesperrten) Teams öffnen */
  buzzer?: { dran: number | null; freigeben: () => void }
  /** Teams, die bei dieser Frage schon falsch lagen */
  gesperrt: number[]
  zurueck: () => void
  richtig: (team: number) => void
  falsch: (team: number) => void
  niemand: () => void
}) {
  const beamer = useMemo(() => alsBeamerFrage(frage), [frage])
  const [loesung, setLoesung] = useState(false)
  const [rest, setRest] = useState<number | null>(null)

  useEffect(() => {
    if (rest === null || rest <= 0) return
    const t = setTimeout(() => setRest((r) => (r === null ? r : r - 1)), 1000)
    return () => clearTimeout(t)
  }, [rest])

  const medium = frage.medium
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-2xl font-bold text-white/80">
          {kategorie.titel} · <span className="text-quizzo-yellow">{wert} Punkte</span>
        </p>
        <div className="flex items-center gap-3">
          {rest === null ? (
            <Knopf art="leise" onClick={() => setRest(frage.zeitlimit)}>
              ⏱ Zeit starten ({frage.zeitlimit} s)
            </Knopf>
          ) : (
            <span
              className={`flex h-20 w-20 items-center justify-center rounded-full text-4xl font-black tabular-nums ${rest <= 5 ? 'bg-red-500 text-white' : 'bg-quizzo-yellow text-quizzo-navy'}`}
              aria-label="Verbleibende Sekunden"
            >
              {rest}
            </span>
          )}
          <Knopf art="leise" onClick={zurueck}>
            ← Zurück zum Brett
          </Knopf>
        </div>
      </div>

      <h2 className={`rounded-3xl bg-white px-8 text-center leading-tight font-extrabold text-quizzo-navy ${medium ? 'py-5 text-4xl' : 'py-8 text-5xl'}`}>{frage.text}</h2>
      {medium?.art === 'audio' && <BeamerMedium medium={medium} />}
      {medium && medium.art !== 'audio' ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 items-center gap-6">
          <div className="flex h-full min-h-0 items-center justify-center">
            <BeamerMedium medium={medium} />
          </div>
          <div className="flex h-full min-h-0 flex-col">
            <BeamerFrage frage={beamer} />
          </div>
        </div>
      ) : (
        <BeamerFrage frage={beamer} />
      )}

      {buzzer && (
        <div
          role="status"
          aria-live="assertive"
          className={`flex flex-wrap items-center justify-center gap-4 rounded-3xl px-6 py-4 text-center text-3xl font-black ${
            buzzer.dran === null ? 'bg-white/10 text-white/85' : `${teamStil(buzzer.dran).farbe} text-white`
          }`}
        >
          {buzzer.dran === null ? (
            <span>🔔 Buzzer sind offen – welches Team drückt zuerst?</span>
          ) : (
            <>
              <span>
                🔔 {teamStil(buzzer.dran).zeichen} {stand.teams[buzzer.dran].name} ist dran!
              </span>
              <Knopf art="leise" onClick={buzzer.freigeben} className="!py-2 !text-lg">
                Buzzer wieder freigeben
              </Knopf>
            </>
          )}
        </div>
      )}

      {loesung ? (
        <div className="rounded-3xl bg-green-600/25 px-6 py-4 ring-4 ring-green-400" aria-label="Lösung">
          <p className="text-xl font-bold text-green-200">Lösung</p>
          {loesungZeilen(frage).map((z, i) => (
            <p key={i} className="text-3xl font-extrabold">
              {z}
            </p>
          ))}
        </div>
      ) : (
        <Knopf art="rahmen" onClick={() => setLoesung(true)} className="self-center !px-10 !text-2xl">
          Lösung zeigen
        </Knopf>
      )}

      <section className="flex flex-wrap items-center justify-center gap-3" aria-label="Punkte vergeben">
        {stand.teams.map((t, i) => (
          <div key={i} className="flex overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => richtig(i)}
              disabled={gesperrt.includes(i)}
              className={`px-5 py-3 text-2xl font-extrabold text-white ${teamStil(i).farbe} disabled:opacity-30 ${buzzer?.dran === i ? 'ring-8 ring-white' : ''}`}
            >
              ✓ {t.name} +{wert}
            </button>
            {abzug && (
              <button
                type="button"
                onClick={() => falsch(i)}
                disabled={gesperrt.includes(i)}
                aria-label={`${t.name} falsch, minus ${wert}`}
                className="border-l-2 border-black/20 bg-black/40 px-4 py-3 text-2xl font-extrabold text-white disabled:opacity-30"
              >
                ✗ −{wert}
              </button>
            )}
          </div>
        ))}
        <Knopf art="leise" onClick={niemand} className="!py-3 !text-2xl">
          Niemand
        </Knopf>
      </section>
    </div>
  )
}

function Endstand({ stand, neueRunde, weiter }: { stand: Spielstand; neueRunde: () => void; weiter?: () => void }) {
  const liste = rangliste(stand)
  const sieger = liste.filter((t) => t.platz === 1)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <h2 className="text-center text-6xl font-black text-quizzo-yellow">
        {sieger.length === 1 ? `${sieger[0].name} gewinnt!` : 'Unentschieden!'}
      </h2>
      <ol className="flex w-full max-w-3xl flex-col gap-3">
        {liste.map((t) => (
          <li key={t.index} className={`flex items-center justify-between gap-4 rounded-3xl px-6 py-4 text-3xl font-extrabold text-white ${teamStil(t.index).farbe}`}>
            <span>
              <span className="mr-4">{t.platz}.</span>
              <span aria-hidden="true">{teamStil(t.index).zeichen}</span> {t.name}
            </span>
            <span className="tabular-nums">{t.punkte}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap justify-center gap-3">
        {weiter && (
          <Knopf art="rahmen" onClick={weiter} className="!px-8 !text-2xl">
            Weiterspielen
          </Knopf>
        )}
        <Knopf onClick={neueRunde} className="!px-8 !text-2xl">
          Neues Duell, gleiche Kategorien
        </Knopf>
      </div>
    </div>
  )
}

/** Unter dem Brett: so verbinden sich die Team-Handys */
function BuzzerHinweis({ pin, verbunden, teams }: { pin: string; verbunden: number; teams: number }) {
  const link = buzzerLink(pin)
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#0b1f4d', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [link])
  return (
    <section className="flex items-center justify-center gap-5 rounded-3xl bg-white/5 px-5 py-3" aria-label="Buzzer verbinden">
      {qr && <img src={qr} alt="QR-Code für die Buzzer-Handys" className="h-24 w-24 shrink-0 rounded-xl" />}
      <div className="text-xl">
        <p className="font-extrabold">📱 Ein Handy pro Team: QR-Code scannen, Team wählen</p>
        <p className="text-white/75">
          oder unter <b>Mitspielen → Buzzer</b> die PIN <b className="text-3xl tracking-widest text-quizzo-yellow tabular-nums">{pin}</b> eingeben · {verbunden} von {teams} Teams
          verbunden
        </p>
      </div>
    </section>
  )
}
