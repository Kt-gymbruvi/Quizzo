import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Knopf, LehrkraftKopf, Meldung } from '../../components.tsx'
import { exportiereQuiz, importiereQuiz, pruefeQuiz } from '../../lib/fragetypen.ts'
import { ladeQuiz, ladeQuizze, loescheQuiz, speichereQuiz, type QuizUebersicht } from '../../lib/quizze.ts'
import { erstelleSpiel, type Spielmodus } from '../../lib/spiel.ts'
import { SpielStarten } from './SpielStarten.tsx'
import { AufgabeErstellen } from './AufgabeErstellen.tsx'
import { AufgabenUebersicht } from './AufgabenUebersicht.tsx'
import { erstelleAufgabe, type Aufgabenmodus } from '../../lib/aufgaben.ts'
import { fehlerText } from '../../lib/supabase.ts'

const datumFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

function dateiName(titel: string) {
  return (titel.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-') || 'quiz') + '.quizzo.json'
}

export default function QuizListe() {
  const location = useLocation()
  const [hinweis, setHinweis] = useState<string | null>((location.state as { hinweis?: string } | null)?.hinweis ?? null)
  const [quizze, setQuizze] = useState<QuizUebersicht[] | null>(null)
  const [fehler, setFehler] = useState<string[]>([])
  const [startet, setStartet] = useState<string | null>(null)
  const [startDialog, setStartDialog] = useState<QuizUebersicht | null>(null)
  const [aufgabeDialog, setAufgabeDialog] = useState<{ quiz: QuizUebersicht; medien: boolean } | null>(null)
  const [aufgabeLaeuft, setAufgabeLaeuft] = useState(false)
  const [aufgabenStand, setAufgabenStand] = useState(0)
  const navigate = useNavigate()
  const dateiWahl = useRef<HTMLInputElement>(null)

  const laden = useCallback(() => {
    ladeQuizze()
      .then((q) => {
        setQuizze(q)
        setFehler([])
      })
      .catch((err) => setFehler([fehlerText(err)]))
  }, [])

  useEffect(laden, [laden])

  function melde(text: string) {
    setFehler([])
    setHinweis(text)
  }

  async function spielen(q: QuizUebersicht, modus: Spielmodus, teams: number | null) {
    setStartet(q.id)
    try {
      const spiel = await erstelleSpiel(q.id, modus, teams)
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

  async function aufgabeErstellen(q: QuizUebersicht, modus: Aufgabenmodus, frist: Date | null, codes: number | null) {
    setAufgabeLaeuft(true)
    try {
      const a = await erstelleAufgabe(q.id, modus, frist, codes)
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
      await speichereQuiz(null, `${quiz.titel} (Kopie)`.slice(0, 200), quiz.fragen)
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
      await speichereQuiz(null, titel, ergebnis.fragen)
      melde(`„${titel}“ wurde importiert (${ergebnis.fragen.length} Fragen).`)
      laden()
    } catch (err) {
      setFehler([err instanceof Error && !('code' in err) ? err.message : fehlerText(err)])
    }
  }

  return (
    <main className="flex min-h-dvh flex-col gap-8 px-8 py-6 lg:px-12">
      <LehrkraftKopf />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-5xl font-extrabold">Meine Quizze</h2>
        <div className="flex flex-wrap gap-3">
          <Knopf art="rahmen" onClick={() => dateiWahl.current?.click()} className="!py-4">
            Importieren
          </Knopf>
          <input ref={dateiWahl} type="file" accept=".json,application/json" className="hidden" onChange={importieren} aria-label="Quiz-Datei importieren" />
          <Link
            to="/leiten/quiz/neu"
            className="rounded-2xl bg-quizzo-yellow px-7 py-4 text-2xl font-extrabold text-quizzo-navy shadow-[0_5px_0_var(--color-quizzo-yellow-dark)] transition hover:brightness-105 active:translate-y-1 active:shadow-none"
          >
            + Neues Quiz
          </Link>
        </div>
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

      {quizze === null && fehler.length === 0 && <p className="text-2xl text-white/70">Quizze werden geladen …</p>}

      {quizze?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-3 border-dashed border-white/25 px-6 py-16 text-center">
          <p className="text-3xl font-bold">Noch keine Quizze</p>
          <p className="text-xl text-white/70">Lege mit „+ Neues Quiz“ dein erstes Quiz an oder importiere eine Quiz-Datei.</p>
        </div>
      )}

      {quizze && quizze.length > 0 && (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {quizze.map((q) => (
            <li key={q.id} className="flex flex-col gap-4 rounded-3xl bg-quizzo-navy-light/70 p-6 ring-1 ring-white/10">
              <div className="flex-1">
                <h3 className="text-3xl font-extrabold leading-tight break-words">{q.titel}</h3>
                <p className="mt-2 text-lg text-white/70">
                  {q.anzahlFragen} {q.anzahlFragen === 1 ? 'Frage' : 'Fragen'} · geändert {datumFormat.format(new Date(q.geaendert_am))}
                </p>
              </div>
              <Knopf onClick={() => setStartDialog(q)} disabled={q.anzahlFragen === 0 || startet !== null} className="!py-4 !text-2xl" aria-label={`${q.titel} spielen`}>
                {startet === q.id ? 'Spiel wird erstellt …' : '▶ Spielen'}
              </Knopf>
              <Knopf art="rahmen" onClick={() => aufgabeOeffnen(q)} disabled={q.anzahlFragen === 0} className="!py-3" aria-label={`${q.titel} als Aufgabe verteilen`}>
                📝 Als Aufgabe verteilen
              </Knopf>
              <div className="flex gap-3">
                <Link
                  to={`/leiten/quiz/${q.id}`}
                  className="flex-1 rounded-2xl border-3 border-quizzo-yellow px-4 py-3 text-center text-xl font-extrabold text-quizzo-yellow transition hover:bg-quizzo-yellow hover:text-quizzo-navy"
                >
                  Bearbeiten
                </Link>
                <Knopf art="leise" onClick={() => loeschen(q)} aria-label={`${q.titel} löschen`}>
                  Löschen
                </Knopf>
              </div>
              <div className="flex gap-3 text-base">
                <button className="flex-1 rounded-xl bg-white/5 py-2 font-semibold text-white/80 hover:bg-white/15" onClick={() => kopieren(q)} aria-label={`${q.titel} kopieren`}>
                  ⧉ Kopieren
                </button>
                <button className="flex-1 rounded-xl bg-white/5 py-2 font-semibold text-white/80 hover:bg-white/15" onClick={() => exportieren(q)} aria-label={`${q.titel} exportieren`}>
                  ⤓ Exportieren
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AufgabenUebersicht neuLaden={aufgabenStand} />

      {aufgabeDialog && (
        <AufgabeErstellen
          titel={aufgabeDialog.quiz.titel}
          medienHinweis={aufgabeDialog.medien}
          laeuft={aufgabeLaeuft}
          erstellen={(modus, frist, codes) => aufgabeErstellen(aufgabeDialog.quiz, modus, frist, codes)}
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
