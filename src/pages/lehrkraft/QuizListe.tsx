import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Knopf, LehrkraftKopf, Meldung } from '../../components.tsx'
import { exportiereQuiz, importiereQuiz, pruefeQuiz } from '../../lib/fragetypen.ts'
import {
  aendereOrdner,
  ladeQuiz,
  ladeQuizze,
  loescheQuiz,
  merkeBenutzt,
  pruefeOrdner,
  speichereQuiz,
  verschiebeQuiz,
  type QuizUebersicht,
} from '../../lib/quizze.ts'
import { erstelleSpiel, type Spielmodus } from '../../lib/spiel.ts'
import { SpielStarten } from './SpielStarten.tsx'
import { AufgabeErstellen } from './AufgabeErstellen.tsx'
import { AufgabenUebersicht } from './AufgabenUebersicht.tsx'
import { erstelleAufgabe, type Aufgabenmodus } from '../../lib/aufgaben.ts'
import { fehlerText } from '../../lib/supabase.ts'
import { MAX_LAENGE, TRENNER, alleOrdner, elternOrdner, liegtIn, ordnerAnzeige, ordnerName, ordnerPfad, ordnerTeile, umbenannt, unterordner } from '../../lib/ordner.ts'

const datumFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })

function dateiName(titel: string) {
  return (titel.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-') || 'quiz') + '.quizzo.json'
}

type Sortierung = 'geaendert' | 'benutzt' | 'name'
const SORTIERUNGEN: { wert: Sortierung; text: string }[] = [
  { wert: 'geaendert', text: 'Zuletzt bearbeitet' },
  { wert: 'benutzt', text: 'Zuletzt gespielt/verteilt' },
  { wert: 'name', text: 'Name (A–Z)' },
]

/** Ordner-Auswahl: null = alle Quizze, '' = ohne Ordner, sonst der Ordnerpfad (z. B. „Oberstufe/Evolution“) */
type OrdnerWahl = string | null

// Gewählter Ordner und Sortierung bleiben auf diesem Gerät gemerkt (nur Bequemlichkeit)
const SPEICHER = 'quizzo-quizliste'
function gemerkt(): { ordner: OrdnerWahl; sortierung: Sortierung; leer: string[] } {
  try {
    const g = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}')
    return {
      ordner: typeof g.ordner === 'string' ? g.ordner : null,
      sortierung: SORTIERUNGEN.some((s) => s.wert === g.sortierung) ? g.sortierung : 'geaendert',
      leer: Array.isArray(g.leer) ? g.leer.filter((x: unknown) => typeof x === 'string').slice(0, 50) : [],
    }
  } catch {
    return { ordner: null, sortierung: 'geaendert', leer: [] }
  }
}

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

export default function QuizListe() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const ansicht = params.get('ansicht') === 'aufgaben' ? 'aufgaben' : 'quizze'
  const [hinweis, setHinweis] = useState<string | null>((location.state as { hinweis?: string } | null)?.hinweis ?? null)
  const [quizze, setQuizze] = useState<QuizUebersicht[] | null>(null)
  const [fehler, setFehler] = useState<string[]>([])
  const [startet, setStartet] = useState<string | null>(null)
  const [startDialog, setStartDialog] = useState<QuizUebersicht | null>(null)
  const [aufgabeDialog, setAufgabeDialog] = useState<{ quiz: QuizUebersicht; medien: boolean } | null>(null)
  const [aufgabeLaeuft, setAufgabeLaeuft] = useState(false)
  const [aufgabenStand, setAufgabenStand] = useState(0)
  const [verschieben, setVerschieben] = useState<QuizUebersicht | null>(null)
  const [ordnerZiel, setOrdnerZiel] = useState<string | null>(null)
  const [ordner, setOrdner] = useState<OrdnerWahl>(() => gemerkt().ordner)
  // Neu angelegte, noch leere Ordner merkt sich nur dieses Gerät – bis ein Quiz darin liegt
  const [leereOrdner, setLeereOrdner] = useState<string[]>(() => gemerkt().leer)
  const [sortierung, setSortierung] = useState<Sortierung>(() => gemerkt().sortierung)
  const [suche, setSuche] = useState('')
  const navigate = useNavigate()
  const dateiWahl = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify({ ordner, sortierung, leer: leereOrdner }))
    } catch {
      /* egal */
    }
  }, [ordner, sortierung, leereOrdner])

  const laden = useCallback(() => {
    ladeQuizze()
      .then((q) => {
        setQuizze(q)
        setFehler([])
      })
      .catch((err) => setFehler([fehlerText(err)]))
  }, [])

  useEffect(laden, [laden])

  // Alle Ordner samt übergeordneten, als Baum sortiert; Anzahl zählt Unterordner mit
  const ordnerListe = useMemo(() => alleOrdner([...(quizze ?? []).map((q) => q.ordner), ...leereOrdner]), [quizze, leereOrdner])
  const anzahlIn = (o: string) => (quizze ?? []).filter((q) => liegtIn(q.ordner, o)).length
  const ohneOrdner = (quizze ?? []).filter((q) => !q.ordner).length

  // Gemerkter Ordner gibt es nicht mehr (z. B. aufgelöst): zum nächsten vorhandenen übergeordneten
  useEffect(() => {
    if (!quizze || !ordner || ordnerListe.includes(ordner)) return
    let o: string | null = elternOrdner(ordner)
    while (o && !ordnerListe.includes(o)) o = elternOrdner(o)
    setOrdner(o)
  }, [quizze, ordner, ordnerListe])

  const unterordnerHier = ordner ? unterordner(ordnerListe, ordner) : []
  const sichtbar = useMemo(() => {
    const s = suche.trim().toLocaleLowerCase('de')
    const liste = (quizze ?? []).filter((q) => {
      // Im Ordner: nur was direkt darin liegt (Unterordner stehen als Kacheln darüber) – beim Suchen auch in Unterordnern
      const passtOrdner = ordner === null || (ordner === '' ? !q.ordner : s ? liegtIn(q.ordner, ordner) : q.ordner === ordner)
      return passtOrdner && (!s || q.titel.toLocaleLowerCase('de').includes(s) || q.ordner?.toLocaleLowerCase('de').includes(s))
    })
    const zeit = (d: string | null) => (d ? new Date(d).getTime() : 0)
    return liste.sort((a, b) =>
      sortierung === 'name'
        ? vergleich.compare(a.titel, b.titel)
        : sortierung === 'benutzt'
          ? zeit(b.zuletztBenutzt) - zeit(a.zuletztBenutzt) || zeit(b.geaendert_am) - zeit(a.geaendert_am)
          : zeit(b.geaendert_am) - zeit(a.geaendert_am),
    )
  }, [quizze, ordner, suche, sortierung])

  function melde(text: string) {
    setFehler([])
    setHinweis(text)
  }

  async function spielen(q: QuizUebersicht, modus: Spielmodus, teams: number | null) {
    setStartet(q.id)
    try {
      const spiel = await erstelleSpiel(q.id, modus, teams)
      await merkeBenutzt(q.id)
      navigate(`/leiten/spiel/${spiel.id}`)
    } catch (err) {
      setFehler([fehlerText(err)])
      setStartet(null)
      setStartDialog(null)
    }
  }

  async function aufgabeOeffnen(q: QuizUebersicht) {
    setAufgabeDialog({ quiz: q, medien: false })
    try {
      const quiz = await ladeQuiz(q.id)
      if (quiz.fragen.some((f) => f.medium)) setAufgabeDialog((d) => (d?.quiz.id === q.id ? { ...d, medien: true } : d))
    } catch {
      /* Hinweis ist nur eine Zugabe */
    }
  }

  async function aufgabeErstellen(q: QuizUebersicht, modus: Aufgabenmodus, frist: Date | null, codes: number | null, zeit: number | null) {
    setAufgabeLaeuft(true)
    try {
      const a = await erstelleAufgabe(q.id, modus, frist, codes, zeit)
      navigate(`/leiten/aufgabe/${a.id}`)
    } catch (err) {
      setFehler([fehlerText(err)])
      setAufgabeDialog(null)
      setAufgabeLaeuft(false)
      setAufgabenStand((n) => n + 1)
    }
  }

  async function loeschen(q: QuizUebersicht) {
    if (!window.confirm(`Quiz „${q.titel}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return
    try {
      await loescheQuiz(q.id)
      laden()
    } catch (err) {
      setFehler([fehlerText(err)])
    }
  }

  async function kopieren(q: QuizUebersicht) {
    try {
      const quiz = await ladeQuiz(q.id)
      const neu = await speichereQuiz(null, `${quiz.titel} (Kopie)`.slice(0, 200), quiz.fragen)
      if (q.ordner && typeof neu === 'string') await verschiebeQuiz(neu, q.ordner).catch(() => undefined)
      melde(`„${q.titel}“ wurde kopiert.`)
      laden()
    } catch (err) {
      setFehler([fehlerText(err)])
    }
  }

  async function exportieren(q: QuizUebersicht) {
    try {
      const quiz = await ladeQuiz(q.id)
      const blob = new Blob([JSON.stringify(exportiereQuiz(quiz.titel, quiz.fragen), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = dateiName(quiz.titel)
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setFehler([fehlerText(err)])
    }
  }

  async function importieren(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0]
    e.target.value = ''
    if (!datei) return
    setHinweis(null)
    try {
      if (datei.size > 2_000_000) throw new Error('Die Datei ist zu groß (höchstens 2 MB).')
      const ergebnis = importiereQuiz(await datei.text())
      const titel = ergebnis.titel || datei.name.replace(/(\.quizzo)?\.json$/i, '')
      const probleme = pruefeQuiz(titel, ergebnis.fragen)
      if (probleme.length) {
        setFehler([`Die Datei „${datei.name}“ wurde nicht importiert:`, ...probleme])
        return
      }
      const neu = await speichereQuiz(null, titel, ergebnis.fragen)
      // Import landet im gerade geöffneten Ordner
      if (ordner && typeof neu === 'string') await verschiebeQuiz(neu, ordner).catch(() => undefined)
      melde(`„${titel}“ wurde importiert (${ergebnis.fragen.length} Fragen).`)
      laden()
    } catch (err) {
      setFehler([err instanceof Error && !('code' in err) ? err.message : fehlerText(err)])
    }
  }

  const fehlerMeldung = (err: unknown) => setFehler([err instanceof Error && !('code' in err) ? err.message : fehlerText(err)])

  async function nachOrdner(q: QuizUebersicht, ziel: string | null) {
    try {
      const pfad = pruefeOrdner(ziel)
      setVerschieben(null)
      await verschiebeQuiz(q.id, pfad)
      melde(pfad ? `„${q.titel}“ liegt jetzt im Ordner „${ordnerAnzeige(pfad)}“.` : `„${q.titel}“ liegt jetzt in keinem Ordner.`)
      laden()
    } catch (err) {
      fehlerMeldung(err)
    }
  }

  /** Leere Ordner wandern beim Umbenennen/Verschieben mit; beim Auflösen verschwindet der Ordner selbst */
  function leereMitnehmen(alt: string, neu: string | null, aufloesen = false) {
    setLeereOrdner((l) => [
      ...new Set(
        l.flatMap((o) => {
          if (!liegtIn(o, alt)) return [o]
          if (aufloesen && o === alt) return []
          const n = umbenannt(o, alt, neu)
          return n ? [n] : []
        }),
      ),
    ])
  }

  function unterordnerAnlegen(eltern: string | null) {
    const eingabe = window.prompt(eltern ? `Name des neuen Unterordners in „${ordnerName(eltern)}“:` : 'Name des neuen Ordners:')
    const name = ordnerPfad(eingabe?.replaceAll(TRENNER, ' ') ?? '')
    if (!name) return
    const pfad = eltern ? `${eltern}${TRENNER}${name}` : name
    try {
      pruefeOrdner(pfad)
    } catch (err) {
      return fehlerMeldung(err)
    }
    if (!ordnerListe.includes(pfad)) setLeereOrdner((l) => [...l, pfad])
    setOrdner(pfad)
    melde(`Ordner „${name}“ angelegt. Lege Quizze über „⋯ → In Ordner legen“ hinein – leere Ordner merkt sich nur dieses Gerät.`)
  }

  async function ordnerUmbenennen(alt: string) {
    const eltern = elternOrdner(alt)
    const eingabe = window.prompt(`Neuer Name für den Ordner „${ordnerName(alt)}“:`, ordnerName(alt))
    const name = ordnerPfad(eingabe?.replaceAll(TRENNER, ' ') ?? '')
    if (!name || name === ordnerName(alt)) return
    const neu = eltern ? `${eltern}${TRENNER}${name}` : name
    try {
      await aendereOrdner(quizze ?? [], alt, neu)
      leereMitnehmen(alt, neu)
      setOrdner(neu)
      melde(`Der Ordner heißt jetzt „${name}“.`)
      laden()
    } catch (err) {
      fehlerMeldung(err)
    }
  }

  async function ordnerAufloesen(pfad: string) {
    const eltern = elternOrdner(pfad)
    const wohin = eltern ? `in „${ordnerName(eltern)}“` : 'ohne Ordner'
    if (!window.confirm(`Ordner „${ordnerName(pfad)}“ auflösen? Die Quizze und Unterordner darin bleiben erhalten und liegen danach ${wohin}.`)) return
    try {
      await aendereOrdner(quizze ?? [], pfad, eltern)
      leereMitnehmen(pfad, eltern, true)
      setOrdner(eltern)
      melde(`Der Ordner „${ordnerName(pfad)}“ wurde aufgelöst.`)
      laden()
    } catch (err) {
      fehlerMeldung(err)
    }
  }

  async function ordnerVerschieben(pfad: string, ziel: string | null) {
    setOrdnerZiel(null)
    const neu = ziel ? `${ziel}${TRENNER}${ordnerName(pfad)}` : ordnerName(pfad)
    try {
      await aendereOrdner(quizze ?? [], pfad, neu)
      leereMitnehmen(pfad, neu)
      setOrdner(neu)
      melde(`Der Ordner „${ordnerName(pfad)}“ liegt jetzt ${ziel ? `in „${ordnerAnzeige(ziel)}“` : 'auf der obersten Ebene'}.`)
      laden()
    } catch (err) {
      fehlerMeldung(err)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 px-6 py-5 lg:px-10">
      <LehrkraftKopf />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex gap-2 rounded-2xl bg-white/5 p-1.5" aria-label="Ansicht">
          <Reiter aktiv={ansicht === 'quizze'} onClick={() => setParams({}, { replace: true })}>
            📚 Meine Quizze {quizze && <span className="opacity-60">({quizze.length})</span>}
          </Reiter>
          <Reiter aktiv={ansicht === 'aufgaben'} onClick={() => setParams({ ansicht: 'aufgaben' }, { replace: true })}>
            📝 Verteilte Aufgaben
          </Reiter>
        </nav>
        {ansicht === 'quizze' && (
          <div className="flex flex-wrap gap-3">
            <Knopf art="rahmen" onClick={() => dateiWahl.current?.click()} className="!py-3">
              Importieren
            </Knopf>
            <input ref={dateiWahl} type="file" accept=".json,application/json" className="hidden" onChange={importieren} aria-label="Quiz-Datei importieren" />
            <Link
              to="/leiten/quiz/neu"
              className="rounded-2xl bg-quizzo-yellow px-6 py-3 text-xl font-extrabold text-quizzo-navy shadow-[0_5px_0_var(--color-quizzo-yellow-dark)] transition hover:brightness-105 active:translate-y-1 active:shadow-none"
            >
              + Neues Quiz
            </Link>
          </div>
        )}
      </div>

      {hinweis && <Meldung art="erfolg">{hinweis}</Meldung>}
      {fehler.length === 1 && <Meldung art="fehler">{fehler[0]}</Meldung>}
      {fehler.length > 1 && (
        <div role="alert" className="rounded-2xl bg-red-500/20 px-5 py-4 text-lg font-semibold text-red-100 ring-2 ring-red-400/60">
          <p>{fehler[0]}</p>
          <ul className="mt-1 list-disc pl-6">
            {fehler.slice(1).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {ansicht === 'aufgaben' ? (
        <AufgabenUebersicht neuLaden={aufgabenStand} leerHinweis />
      ) : (
        <>
          {quizze === null && fehler.length === 0 && <p className="text-2xl text-white/70">Quizze werden geladen …</p>}

          {quizze?.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-3xl border-3 border-dashed border-white/25 px-6 py-16 text-center">
              <p className="text-3xl font-bold">Noch keine Quizze</p>
              <p className="text-xl text-white/70">Lege mit „+ Neues Quiz“ dein erstes Quiz an oder importiere eine Quiz-Datei.</p>
            </div>
          )}

          {quizze && quizze.length > 0 && (
            <div className="grid items-start gap-6 lg:grid-cols-[15rem_1fr]">
              {/* Ordner: am iPad quer als Spalte links, schmaler als Leiste zum Wischen */}
              <nav aria-label="Ordner" className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible">
                <OrdnerKnopf aktiv={ordner === null} onClick={() => setOrdner(null)} symbol="📚" name="Alle Quizze" anzahl={quizze.length} />
                {/* Baum: oberste Ebene immer, Unterordner nur entlang des gewählten Ordners aufgeklappt */}
                {ordnerListe
                  .filter((o) => {
                    const e = elternOrdner(o)
                    return e === null || (!!ordner && liegtIn(ordner, e))
                  })
                  .map((o) => (
                    <OrdnerKnopf
                      key={o}
                      aktiv={ordner === o}
                      onClick={() => setOrdner(o)}
                      symbol={ordner && liegtIn(ordner, o) && unterordner(ordnerListe, o).length ? '📂' : '📁'}
                      name={ordnerName(o)}
                      anzahl={anzahlIn(o)}
                      tiefe={ordnerTeile(o).length - 1}
                      titel={ordnerAnzeige(o)}
                    />
                  ))}
                {ordnerListe.length > 0 && ohneOrdner > 0 && (
                  <OrdnerKnopf aktiv={ordner === ''} onClick={() => setOrdner('')} symbol="📄" name="Ohne Ordner" anzahl={ohneOrdner} />
                )}
                <button onClick={() => unterordnerAnlegen(null)} className="shrink-0 rounded-2xl px-4 py-2.5 text-left text-base font-semibold text-white/70 hover:bg-white/10 hover:text-white lg:w-full">
                  + Neuer Ordner
                </button>
              </nav>

              <section className="flex min-w-0 flex-col gap-4" aria-labelledby="ordner-titel">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="mr-auto min-w-0">
                    {ordner && (
                      <nav aria-label="Ordnerpfad" className="flex flex-wrap items-center gap-1 text-lg text-white/65">
                        <button onClick={() => setOrdner(null)} className="hover:text-quizzo-yellow hover:underline">
                          Alle Quizze
                        </button>
                        {ordnerTeile(ordner)
                          .slice(0, -1)
                          .map((teil, i) => {
                            const pfad = ordnerTeile(ordner).slice(0, i + 1).join(TRENNER)
                            return (
                              <span key={pfad} className="flex items-center gap-1">
                                <span aria-hidden="true">›</span>
                                <button onClick={() => setOrdner(pfad)} className="hover:text-quizzo-yellow hover:underline">
                                  {teil}
                                </button>
                              </span>
                            )
                          })}
                      </nav>
                    )}
                    <h2 id="ordner-titel" className="text-3xl font-extrabold break-words">
                      {ordner === null ? 'Alle Quizze' : ordner === '' ? 'Ohne Ordner' : ordnerName(ordner)}
                    </h2>
                  </div>
                  {ordner && (
                    <div className="flex flex-wrap gap-2">
                      <OrdnerAktion onClick={() => unterordnerAnlegen(ordner)}>+ Unterordner</OrdnerAktion>
                      <OrdnerAktion onClick={() => ordnerUmbenennen(ordner)}>✎ Umbenennen</OrdnerAktion>
                      <OrdnerAktion onClick={() => setOrdnerZiel(ordner)}>↪ Verschieben</OrdnerAktion>
                      <OrdnerAktion onClick={() => ordnerAufloesen(ordner)}>Auflösen</OrdnerAktion>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <input
                    type="search"
                    value={suche}
                    onChange={(e) => setSuche(e.target.value)}
                    placeholder="Quiz suchen …"
                    aria-label="Quiz suchen"
                    className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-lg text-quizzo-navy placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
                  />
                  <select
                    value={sortierung}
                    onChange={(e) => setSortierung(e.target.value as Sortierung)}
                    aria-label="Sortieren"
                    className="rounded-2xl bg-white/10 px-4 py-3 text-lg font-semibold text-white focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
                  >
                    {SORTIERUNGEN.map((s) => (
                      <option key={s.wert} value={s.wert} className="text-quizzo-navy">
                        {s.text}
                      </option>
                    ))}
                  </select>
                </div>

                {!suche && unterordnerHier.length > 0 && (
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Unterordner">
                    {unterordnerHier.map((o) => (
                      <li key={o}>
                        <button
                          onClick={() => setOrdner(o)}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white/10 px-5 py-4 text-left ring-1 ring-white/10 transition hover:bg-white/15 hover:ring-quizzo-yellow"
                        >
                          <span className="text-3xl" aria-hidden="true">
                            📁
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xl font-extrabold">{ordnerName(o)}</span>
                            <span className="text-base text-white/60">
                              {anzahlIn(o)} {anzahlIn(o) === 1 ? 'Quiz' : 'Quizze'}
                              {unterordner(ordnerListe, o).length > 0 && ` · ${unterordner(ordnerListe, o).length} Unterordner`}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {sichtbar.length === 0 ? (
                  !(!suche && unterordnerHier.length > 0) && (
                    <p className="rounded-2xl bg-white/5 px-5 py-8 text-center text-xl text-white/70">
                      {suche ? 'Kein Quiz gefunden.' : 'In diesem Ordner liegt noch kein Quiz. Lege eines über „⋯ → In Ordner legen“ hinein.'}
                    </p>
                  )
                ) : (
                  <ul className="flex flex-col gap-3">
                    {sichtbar.map((q) => (
                      <QuizZeile
                        key={q.id}
                        q={q}
                        ordnerZeigen={ordner === null || (!!suche && ordner !== '')}
                        startet={startet}
                        spielen={() => setStartDialog(q)}
                        verteilen={() => aufgabeOeffnen(q)}
                        verschieben={() => setVerschieben(q)}
                        kopieren={() => kopieren(q)}
                        exportieren={() => exportieren(q)}
                        loeschen={() => loeschen(q)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {verschieben && (
        <OrdnerDialog
          titel="In Ordner legen"
          untertitel={verschieben.titel}
          ordner={ordnerListe}
          aktuell={verschieben.ordner}
          startEltern={ordner || null}
          neuErlaubt
          obersteText="Aus dem Ordner nehmen"
          waehlen={(ziel) => nachOrdner(verschieben, ziel)}
          abbrechen={() => setVerschieben(null)}
        />
      )}
      {ordnerZiel && (
        <OrdnerDialog
          titel="Ordner verschieben"
          untertitel={`„${ordnerName(ordnerZiel)}“ samt Inhalt verschieben nach …`}
          ordner={ordnerListe.filter((o) => !liegtIn(o, ordnerZiel))}
          aktuell={elternOrdner(ordnerZiel)}
          obersteText="Auf die oberste Ebene"
          waehlen={(ziel) => ordnerVerschieben(ordnerZiel, ziel)}
          abbrechen={() => setOrdnerZiel(null)}
        />
      )}

      {aufgabeDialog && (
        <AufgabeErstellen
          titel={aufgabeDialog.quiz.titel}
          medienHinweis={aufgabeDialog.medien}
          laeuft={aufgabeLaeuft}
          erstellen={(modus: Aufgabenmodus, frist: Date | null, codes: number | null, zeit: number | null) => void aufgabeErstellen(aufgabeDialog.quiz, modus, frist, codes, zeit)}
          abbrechen={() => setAufgabeDialog(null)}
        />
      )}

      {startDialog && (
        <SpielStarten
          titel={startDialog.titel}
          laeuft={startet !== null}
          starten={(modus, teams) => spielen(startDialog, modus, teams)}
          abbrechen={() => setStartDialog(null)}
        />
      )}
    </main>
  )
}

function Reiter({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-current={aktiv ? 'page' : undefined}
      className={`rounded-xl px-5 py-2.5 text-xl font-extrabold transition ${aktiv ? 'bg-quizzo-yellow text-quizzo-navy' : 'text-white/80 hover:bg-white/10'}`}
    >
      {children}
    </button>
  )
}

function OrdnerAktion({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-xl bg-white/10 px-3 py-2 text-base font-semibold hover:bg-white/20">
      {children}
    </button>
  )
}

function OrdnerKnopf({
  aktiv,
  onClick,
  symbol,
  name,
  anzahl,
  tiefe = 0,
  titel,
}: {
  aktiv: boolean
  onClick: () => void
  symbol: string
  name: string
  anzahl: number
  /** Ebene im Baum (eingerückt) */
  tiefe?: number
  titel?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-current={aktiv ? 'true' : undefined}
      title={titel}
      style={{ ['--tiefe' as string]: `${tiefe * 1.1}rem` }}
      className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-left text-lg font-bold transition lg:ml-[var(--tiefe)] lg:w-[calc(100%-var(--tiefe))] ${
        aktiv ? 'bg-quizzo-yellow text-quizzo-navy' : 'bg-white/5 text-white/85 hover:bg-white/15'
      }`}
    >
      <span aria-hidden="true">{symbol}</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className={`rounded-full px-2 text-base tabular-nums ${aktiv ? 'bg-quizzo-navy/15' : 'bg-white/10'}`}>{anzahl}</span>
    </button>
  )
}

function QuizZeile({
  q,
  ordnerZeigen,
  startet,
  spielen,
  verteilen,
  verschieben,
  kopieren,
  exportieren,
  loeschen,
}: {
  q: QuizUebersicht
  ordnerZeigen: boolean
  startet: string | null
  spielen: () => void
  verteilen: () => void
  verschieben: () => void
  kopieren: () => void
  exportieren: () => void
  loeschen: () => void
}) {
  const leer = q.anzahlFragen === 0
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl bg-quizzo-navy-light/70 px-5 py-4 ring-1 ring-white/10">
      <Link to={`/leiten/quiz/${q.id}`} className="group min-w-56 flex-1" title="Bearbeiten">
        <h3 className="text-2xl font-extrabold leading-tight break-words group-hover:text-quizzo-yellow">{q.titel}</h3>
        <p className="mt-1 text-base text-white/65">
          {q.anzahlFragen} {q.anzahlFragen === 1 ? 'Frage' : 'Fragen'} · bearbeitet {datumFormat.format(new Date(q.geaendert_am))}
          {ordnerZeigen && q.ordner && <span className="ml-2 rounded-lg bg-white/10 px-2 py-0.5 text-white/80">📁 {q.ordner}</span>}
        </p>
      </Link>
      <div className="flex items-center gap-2">
        <Knopf onClick={spielen} disabled={leer || startet !== null} className="!px-5 !py-3 !text-xl" aria-label={`${q.titel} spielen`}>
          {startet === q.id ? 'Startet …' : '▶ Spielen'}
        </Knopf>
        <Knopf art="rahmen" onClick={verteilen} disabled={leer} className="!px-4 !py-3 !text-lg" aria-label={`${q.titel} als Aufgabe verteilen`}>
          📝 Verteilen
        </Knopf>
        <Mehr titel={q.titel}>
          {(schliessen) => (
            <>
              <MenuPunkt to={`/leiten/quiz/${q.id}`}>✎ Bearbeiten</MenuPunkt>
              <MenuPunkt onClick={() => (schliessen(), verschieben())} label={`${q.titel} in Ordner legen`}>
                📁 In Ordner legen …
              </MenuPunkt>
              <MenuPunkt onClick={() => (schliessen(), kopieren())} label={`${q.titel} kopieren`}>
                ⧉ Kopieren
              </MenuPunkt>
              <MenuPunkt onClick={() => (schliessen(), exportieren())} label={`${q.titel} exportieren`}>
                ⤓ Exportieren (Datei)
              </MenuPunkt>
              <MenuPunkt onClick={() => (schliessen(), loeschen())} label={`${q.titel} löschen`} gefahr>
                🗑 Löschen
              </MenuPunkt>
            </>
          )}
        </Mehr>
      </div>
    </li>
  )
}

/** „⋯“-Menü mit weiteren Aktionen; schließt bei Klick daneben oder Escape */
function Mehr({ titel, children }: { titel: string; children: (schliessen: () => void) => ReactNode }) {
  const [offen, setOffen] = useState(false)
  const bereich = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!offen) return
    const zu = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !bereich.current?.contains(e.target as Node)) setOffen(false)
    }
    document.addEventListener('pointerdown', zu)
    document.addEventListener('keydown', zu)
    return () => {
      document.removeEventListener('pointerdown', zu)
      document.removeEventListener('keydown', zu)
    }
  }, [offen])
  return (
    <div ref={bereich} className="relative">
      <button
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        aria-label={`Weitere Aktionen für ${titel}`}
        className="flex h-13 w-13 items-center justify-center rounded-2xl bg-white/10 text-3xl leading-none font-black hover:bg-white/20"
      >
        ⋯
      </button>
      {offen && (
        <div role="menu" className="absolute right-0 z-20 mt-2 flex w-64 flex-col overflow-hidden rounded-2xl bg-white py-1 text-quizzo-navy shadow-2xl">
          {children(() => setOffen(false))}
        </div>
      )}
    </div>
  )
}

function MenuPunkt({ onClick, to, label, gefahr, children }: { onClick?: () => void; to?: string; label?: string; gefahr?: boolean; children: ReactNode }) {
  const klasse = `px-4 py-3 text-left text-lg font-semibold hover:bg-slate-100 ${gefahr ? 'text-red-700' : ''}`
  return to ? (
    <Link role="menuitem" to={to} className={klasse}>
      {children}
    </Link>
  ) : (
    <button role="menuitem" onClick={onClick} aria-label={label} className={klasse}>
      {children}
    </button>
  )
}

/** Ordner auswählen (als Baum) – für „Quiz in Ordner legen“ und „Ordner verschieben“; optional neuen Ordner anlegen */
function OrdnerDialog({
  titel,
  untertitel,
  ordner,
  aktuell,
  startEltern = null,
  neuErlaubt = false,
  obersteText,
  waehlen,
  abbrechen,
}: {
  titel: string
  untertitel: string
  ordner: string[]
  /** wo es gerade liegt (null = oberste Ebene/ohne Ordner) */
  aktuell: string | null
  /** neuer Ordner wird standardmäßig hier angelegt */
  startEltern?: string | null
  neuErlaubt?: boolean
  obersteText: string
  waehlen: (ziel: string | null) => void
  abbrechen: () => void
}) {
  const [neu, setNeu] = useState('')
  const [eltern, setEltern] = useState(startEltern && ordner.includes(startEltern) ? startEltern : '')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (!d || d.open) return
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
  }, [])
  const name = ordnerPfad(neu.replaceAll(TRENNER, ' '))
  const zielNeu = name ? (eltern ? `${eltern}${TRENNER}${name}` : name) : null
  const zuLang = !!zielNeu && zielNeu.length > MAX_LAENGE
  return (
    <dialog
      ref={dialog}
      aria-labelledby="ordner-dialog-titel"
      onCancel={(e) => {
        e.preventDefault()
        abbrechen()
      }}
      className="fixed inset-0 z-50 m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100%-2rem))] overflow-y-auto rounded-3xl bg-quizzo-navy p-7 text-white shadow-2xl ring-2 ring-quizzo-yellow/60 backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-5">
        <div>
          <h2 id="ordner-dialog-titel" className="text-3xl font-extrabold">
            {titel}
          </h2>
          <p className="mt-1 text-lg text-white/70 break-words">{untertitel}</p>
        </div>
        {ordner.length > 0 && (
          <ul className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
            {ordner.map((o) => (
              <li key={o} style={{ paddingLeft: `${(ordnerTeile(o).length - 1) * 1.5}rem` }}>
                <button
                  onClick={() => waehlen(o)}
                  disabled={o === aktuell}
                  aria-label={ordnerAnzeige(o)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/10 px-4 py-2.5 text-left text-xl font-bold hover:bg-quizzo-yellow hover:text-quizzo-navy disabled:opacity-50 disabled:hover:bg-white/10 disabled:hover:text-white"
                >
                  {elternOrdner(o) ? '↳ 📁' : '📁'} <span className="min-w-0 flex-1 truncate">{ordnerName(o)}</span>
                  {o === aktuell && <span className="text-base font-semibold">(hier)</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {neuErlaubt && (
          <form
            className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (zielNeu && !zuLang) waehlen(zielNeu)
            }}
          >
            <p className="text-lg font-semibold">Neuer Ordner</p>
            <div className="flex flex-wrap gap-3">
              {ordner.length > 0 && (
                <select
                  value={eltern}
                  onChange={(e) => setEltern(e.target.value)}
                  aria-label="Neuen Ordner anlegen in"
                  className="max-w-full rounded-2xl bg-white px-3 py-3 text-lg text-quizzo-navy"
                >
                  <option value="">oberste Ebene</option>
                  {ordner.map((o) => (
                    <option key={o} value={o}>
                      in {ordnerAnzeige(o)}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={neu}
                onChange={(e) => setNeu(e.target.value)}
                maxLength={MAX_LAENGE}
                placeholder="z. B. Evolution"
                aria-label="Name des neuen Ordners"
                className="min-w-40 flex-1 rounded-2xl bg-white px-4 py-3 text-lg text-quizzo-navy placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
              />
              <Knopf type="submit" disabled={!zielNeu || zuLang} className="!py-3 !text-lg">
                Anlegen
              </Knopf>
            </div>
            {zuLang && <p className="text-base text-red-300">Zu lang: höchstens {MAX_LAENGE} Zeichen, übergeordnete Ordner mitgezählt.</p>}
          </form>
        )}
        <div className="flex flex-wrap justify-between gap-3">
          {aktuell ? (
            <Knopf art="leise" onClick={() => waehlen(null)} className="!text-lg">
              {obersteText}
            </Knopf>
          ) : (
            <span />
          )}
          <Knopf art="rahmen" onClick={abbrechen} className="!text-lg">
            Abbrechen
          </Knopf>
        </div>
      </div>
    </dialog>
  )
}
