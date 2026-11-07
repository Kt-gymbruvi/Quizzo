import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Knopf, LehrkraftKopf, Meldung } from '../../components.tsx'
import { exportiereQuiz, importiereQuiz, pruefeQuiz } from '../../lib/fragetypen.ts'
import {
  benenneOrdnerUm,
  ladeQuiz,
  ladeQuizze,
  loescheQuiz,
  merkeBenutzt,
  ordnerName,
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

/** Ordner-Auswahl: null = alle Quizze, '' = ohne Ordner, sonst der Ordnername */
type OrdnerWahl = string | null

// Gewählter Ordner und Sortierung bleiben auf diesem Gerät gemerkt (nur Bequemlichkeit)
const SPEICHER = 'quizzo-quizliste'
function gemerkt(): { ordner: OrdnerWahl; sortierung: Sortierung } {
  try {
    const g = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}')
    return { ordner: typeof g.ordner === 'string' ? g.ordner : null, sortierung: SORTIERUNGEN.some((s) => s.wert === g.sortierung) ? g.sortierung : 'geaendert' }
  } catch {
    return { ordner: null, sortierung: 'geaendert' }
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
  const [ordner, setOrdner] = useState<OrdnerWahl>(() => gemerkt().ordner)
  const [sortierung, setSortierung] = useState<Sortierung>(() => gemerkt().sortierung)
  const [suche, setSuche] = useState('')
  const navigate = useNavigate()
  const dateiWahl = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify({ ordner, sortierung }))
    } catch {
      /* egal */
    }
  }, [ordner, sortierung])

  const laden = useCallback(() => {
    ladeQuizze()
      .then((q) => {
        setQuizze(q)
        setFehler([])
      })
      .catch((err) => setFehler([fehlerText(err)]))
  }, [])

  useEffect(laden, [laden])

  // Alle Ordner mit Anzahl, alphabetisch
  const ordnerListe = useMemo(() => {
    const z = new Map<string, number>()
    for (const q of quizze ?? []) if (q.ordner) z.set(q.ordner, (z.get(q.ordner) ?? 0) + 1)
    return [...z.entries()].sort(([a], [b]) => vergleich.compare(a, b))
  }, [quizze])
  const ohneOrdner = (quizze ?? []).filter((q) => !q.ordner).length

  // Gemerkter Ordner gibt es nicht mehr (z. B. aufgelöst): zurück zu „Alle“
  useEffect(() => {
    if (quizze && ordner && !ordnerListe.some(([n]) => n === ordner)) setOrdner(null)
  }, [quizze, ordner, ordnerListe])

  const sichtbar = useMemo(() => {
    const s = suche.trim().toLocaleLowerCase('de')
    const liste = (quizze ?? []).filter(
      (q) => (ordner === null || (ordner === '' ? !q.ordner : q.ordner === ordner)) && (!s || q.titel.toLocaleLowerCase('de').includes(s) || q.ordner?.toLocaleLowerCase('de').includes(s)),
    )
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

  async function nachOrdner(q: QuizUebersicht, ziel: string | null) {
    setVerschieben(null)
    try {
      await verschiebeQuiz(q.id, ziel)
      melde(ziel ? `„${q.titel}“ liegt jetzt im Ordner „${ordnerName(ziel)}“.` : `„${q.titel}“ liegt jetzt in keinem Ordner.`)
      laden()
    } catch (err) {
      setFehler([fehlerText(err)])
    }
  }

  async function ordnerUmbenennen(alt: string) {
    const neu = ordnerName(window.prompt(`Neuer Name für den Ordner „${alt}“:`, alt))
    if (!neu || neu === alt) return
    try {
      await benenneOrdnerUm(alt, neu)
      setOrdner(neu)
      melde(`Der Ordner heißt jetzt „${neu}“.`)
      laden()
    } catch (err) {
      setFehler([fehlerText(err)])
    }
  }

  async function ordnerAufloesen(name: string) {
    if (!window.confirm(`Ordner „${name}“ auflösen? Die Quizze darin bleiben erhalten und liegen danach ohne Ordner.`)) return
    try {
      await benenneOrdnerUm(name, null)
      setOrdner(null)
      melde(`Der Ordner „${name}“ wurde aufgelöst.`)
      laden()
    } catch (err) {
      setFehler([fehlerText(err)])
    }
  }

  const ordnerTitel = ordner === null ? 'Alle Quizze' : ordner === '' ? 'Ohne Ordner' : ordner

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
                {ordnerListe.map(([name, n]) => (
                  <OrdnerKnopf key={name} aktiv={ordner === name} onClick={() => setOrdner(name)} symbol="📁" name={name} anzahl={n} />
                ))}
                {ordnerListe.length > 0 && ohneOrdner > 0 && (
                  <OrdnerKnopf aktiv={ordner === ''} onClick={() => setOrdner('')} symbol="📄" name="Ohne Ordner" anzahl={ohneOrdner} />
                )}
                {ordnerListe.length === 0 && (
                  <p className="hidden px-3 pt-2 text-base text-white/55 lg:block">Ordner legst du an, indem du ein Quiz über „⋯ → In Ordner legen“ einsortierst.</p>
                )}
              </nav>

              <section className="flex min-w-0 flex-col gap-4" aria-labelledby="ordner-titel">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id="ordner-titel" className="mr-auto text-3xl font-extrabold break-words">
                    {ordnerTitel}
                  </h2>
                  {ordner && (
                    <>
                      <button onClick={() => ordnerUmbenennen(ordner)} className="rounded-xl bg-white/10 px-3 py-2 text-base font-semibold hover:bg-white/20">
                        ✎ Umbenennen
                      </button>
                      <button onClick={() => ordnerAufloesen(ordner)} className="rounded-xl bg-white/10 px-3 py-2 text-base font-semibold hover:bg-white/20">
                        Ordner auflösen
                      </button>
                    </>
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

                {sichtbar.length === 0 ? (
                  <p className="rounded-2xl bg-white/5 px-5 py-8 text-center text-xl text-white/70">{suche ? 'Kein Quiz gefunden.' : 'In diesem Ordner liegt kein Quiz.'}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {sichtbar.map((q) => (
                      <QuizZeile
                        key={q.id}
                        q={q}
                        ordnerZeigen={ordner === null}
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
          quiz={verschieben}
          ordner={ordnerListe.map(([n]) => n)}
          waehlen={(ziel) => nachOrdner(verschieben, ziel)}
          abbrechen={() => setVerschieben(null)}
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

function OrdnerKnopf({ aktiv, onClick, symbol, name, anzahl }: { aktiv: boolean; onClick: () => void; symbol: string; name: string; anzahl: number }) {
  return (
    <button
      onClick={onClick}
      aria-current={aktiv ? 'true' : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-left text-lg font-bold transition lg:w-full ${
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

/** Quiz in einen vorhandenen oder neuen Ordner legen */
function OrdnerDialog({ quiz, ordner, waehlen, abbrechen }: { quiz: QuizUebersicht; ordner: string[]; waehlen: (ziel: string | null) => void; abbrechen: () => void }) {
  const [neu, setNeu] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (!d || d.open) return
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
  }, [])
  return (
    <dialog
      ref={dialog}
      aria-labelledby="ordner-dialog-titel"
      onCancel={(e) => {
        e.preventDefault()
        abbrechen()
      }}
      className="fixed inset-0 z-50 m-auto w-[min(36rem,calc(100%-2rem))] rounded-3xl bg-quizzo-navy p-7 text-white shadow-2xl ring-2 ring-quizzo-yellow/60 backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-5">
        <div>
          <h2 id="ordner-dialog-titel" className="text-3xl font-extrabold">
            In Ordner legen
          </h2>
          <p className="mt-1 text-lg text-white/70 break-words">{quiz.titel}</p>
        </div>
        {ordner.length > 0 && (
          <ul className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
            {ordner.map((o) => (
              <li key={o}>
                <button
                  onClick={() => waehlen(o)}
                  disabled={o === quiz.ordner}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left text-xl font-bold hover:bg-quizzo-yellow hover:text-quizzo-navy disabled:opacity-50 disabled:hover:bg-white/10 disabled:hover:text-white"
                >
                  📁 <span className="min-w-0 flex-1 truncate">{o}</span>
                  {o === quiz.ordner && <span className="text-base font-semibold">(hier)</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (ordnerName(neu)) waehlen(neu)
          }}
        >
          <input
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            maxLength={60}
            placeholder="Neuer Ordner, z. B. Mathe 7b"
            aria-label="Name des neuen Ordners"
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-lg text-quizzo-navy placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
          />
          <Knopf type="submit" disabled={!ordnerName(neu)} className="!py-3 !text-lg">
            Anlegen
          </Knopf>
        </form>
        <div className="flex flex-wrap justify-between gap-3">
          {quiz.ordner ? (
            <Knopf art="leise" onClick={() => waehlen(null)} className="!text-lg">
              Aus dem Ordner nehmen
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
