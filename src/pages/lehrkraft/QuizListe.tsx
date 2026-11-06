import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Knopf, LehrkraftKopf, Meldung } from '../../components.tsx'
import { ladeQuizze, loescheQuiz, type QuizUebersicht } from '../../lib/quizze.ts'
import { fehlerText } from '../../lib/supabase.ts'

const datumFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

export default function QuizListe() {
  const location = useLocation()
  const hinweis = (location.state as { hinweis?: string } | null)?.hinweis
  const [quizze, setQuizze] = useState<QuizUebersicht[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(() => {
    ladeQuizze()
      .then((q) => {
        setQuizze(q)
        setFehler(null)
      })
      .catch((err) => setFehler(fehlerText(err)))
  }, [])

  useEffect(laden, [laden])

  async function loeschen(q: QuizUebersicht) {
    if (!window.confirm(`Quiz „${q.titel}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return
    try {
      await loescheQuiz(q.id)
      laden()
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  return (
    <main className="flex min-h-dvh flex-col gap-8 px-8 py-6 lg:px-12">
      <LehrkraftKopf />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-5xl font-extrabold">Meine Quizze</h2>
        <Link
          to="/leiten/quiz/neu"
          className="rounded-2xl bg-quizzo-yellow px-7 py-4 text-2xl font-extrabold text-quizzo-navy shadow-[0_5px_0_var(--color-quizzo-yellow-dark)] transition hover:brightness-105 active:translate-y-1 active:shadow-none"
        >
          + Neues Quiz
        </Link>
      </div>

      {hinweis && <Meldung art="erfolg">{hinweis}</Meldung>}
      {fehler && <Meldung art="fehler">{fehler}</Meldung>}

      {quizze === null && !fehler && <p className="text-2xl text-white/70">Quizze werden geladen …</p>}

      {quizze?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-3 border-dashed border-white/25 px-6 py-16 text-center">
          <p className="text-3xl font-bold">Noch keine Quizze</p>
          <p className="text-xl text-white/70">Lege mit „+ Neues Quiz“ dein erstes Quiz an.</p>
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
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
