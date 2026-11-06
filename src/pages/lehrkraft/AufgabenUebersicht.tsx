import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MODUS_INFO, ladeAufgaben, type AufgabeUebersicht } from '../../lib/aufgaben.ts'
import { fehlerText } from '../../lib/supabase.ts'

const datum = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const tag = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })

/** Liste der verteilten Aufgaben unter „Meine Quizze“. */
export function AufgabenUebersicht({ neuLaden }: { neuLaden: number }) {
  const [liste, setListe] = useState<AufgabeUebersicht[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    ladeAufgaben()
      .then((l) => {
        setListe(Array.isArray(l) ? l : [])
        setFehler(null)
      })
      .catch((e) => setFehler(fehlerText(e)))
  }, [neuLaden])

  if (fehler) return <p className="text-lg text-white/60">Aufgaben konnten nicht geladen werden: {fehler}</p>
  if (!liste?.length) return null

  return (
    <section className="flex flex-col gap-4" aria-labelledby="aufgaben-titel">
      <h2 id="aufgaben-titel" className="text-4xl font-extrabold">
        Verteilte Aufgaben
      </h2>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {liste.map((a) => {
          const info = MODUS_INFO[a.modus]
          return (
            <li key={a.id}>
              <Link
                to={`/leiten/aufgabe/${a.id}`}
                className="flex h-full flex-col gap-2 rounded-3xl bg-quizzo-navy-light/70 p-5 ring-1 ring-white/10 transition hover:ring-quizzo-yellow"
              >
                <span className="flex items-center justify-between gap-3 text-lg font-bold text-quizzo-yellow">
                  <span>
                    <span aria-hidden="true">{info.symbol}</span> {info.name}
                  </span>
                  <span className={`rounded-full px-3 py-0.5 text-base ${a.offen ? 'bg-green-600 text-white' : 'bg-white/15 text-white/80'}`}>
                    {a.offen ? 'läuft' : 'beendet'}
                  </span>
                </span>
                <span className="text-2xl font-extrabold break-words">{a.titel}</span>
                <span className="text-lg text-white/75">
                  {a.modus === 'selbstlernen'
                    ? `${a.versuche} ${a.versuche === 1 ? 'Antwort' : 'Antworten'} (anonym)`
                    : `${a.abgegeben} von ${a.teilnehmer} abgegeben`}
                  {a.frist && ` · bis ${datum.format(new Date(a.frist))}`}
                </span>
                {a.loeschen_am && <span className="text-base text-white/55">wird am {tag.format(new Date(a.loeschen_am))} automatisch gelöscht</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
