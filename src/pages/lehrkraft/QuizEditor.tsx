import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Knopf, LehrkraftKopf, Meldung, ZurueckLink } from '../../components.tsx'
import { FRAGETYPEN, TYP_REIHENFOLGE, ZEITLIMITS, neueFrage, pruefeQuiz, wechsleTyp, type Frage, type FrageTyp, type Punkte } from '../../lib/fragetypen.ts'
import { ladeQuiz, speichereQuiz } from '../../lib/quizze.ts'
import { fehlerText } from '../../lib/supabase.ts'
import { FrageFelder } from './editor/FrageFelder.tsx'
import { MedienFeld } from './editor/MedienFeld.tsx'
import { pfadeIn, raeumeMedienAuf } from '../../lib/medien.ts'

const auswahlStil = 'rounded-lg bg-white px-3 py-2 text-lg font-semibold text-quizzo-navy'

export default function QuizEditor() {
  const { id } = useParams()
  const istNeu = id === 'neu' || !id
  const navigate = useNavigate()

  const [titel, setTitel] = useState('')
  const [fragen, setFragen] = useState<Frage[]>(istNeu ? [neueFrage()] : [])
  const [laedt, setLaedt] = useState(!istNeu)
  const [fehler, setFehler] = useState<string[]>([])
  const [gespeichert, setGespeichert] = useState(false)
  const [speichert, setSpeichert] = useState(false)
  // alle Mediendateien, die in diesem Editor vorkamen – nach dem Speichern werden unbenutzte gelöscht
  const gesehenePfade = useRef(new Set<string>())

  useEffect(() => {
    if (istNeu || !id) return
    ladeQuiz(id)
      .then((q) => {
        setTitel(q.titel)
        setFragen(q.fragen.length ? q.fragen : [neueFrage()])
        pfadeIn(q.fragen).forEach((p) => gesehenePfade.current.add(p))
      })
      .catch((err) => setFehler([fehlerText(err)]))
      .finally(() => setLaedt(false))
  }, [id, istNeu])

  function aendere(index: number, neu: Frage) {
    setGespeichert(false)
    setFragen((alt) => alt.map((f, i) => (i === index ? neu : f)))
  }

  function verschiebe(index: number, richtung: -1 | 1) {
    const ziel = index + richtung
    if (ziel < 0 || ziel >= fragen.length) return
    setGespeichert(false)
    setFragen((alt) => {
      const neu = [...alt]
      ;[neu[index], neu[ziel]] = [neu[ziel], neu[index]]
      return neu
    })
  }

  function entferne(index: number) {
    if (!window.confirm(`Frage ${index + 1} entfernen?`)) return
    setGespeichert(false)
    setFragen((alt) => alt.filter((_, i) => i !== index))
  }

  function dupliziere(index: number) {
    setGespeichert(false)
    setFragen((alt) => [...alt.slice(0, index + 1), structuredClone(alt[index]), ...alt.slice(index + 1)])
  }

  async function speichern() {
    const probleme = pruefeQuiz(titel, fragen)
    setFehler(probleme)
    setGespeichert(false)
    if (probleme.length) return
    setSpeichert(true)
    try {
      const neueId = await speichereQuiz(istNeu ? null : id!, titel, fragen)
      setGespeichert(true)
      void raeumeMedienAuf(gesehenePfade.current)
      if (istNeu) navigate(`/leiten/quiz/${neueId}`, { replace: true })
    } catch (err) {
      setFehler([fehlerText(err)])
    } finally {
      setSpeichert(false)
    }
  }

  if (laedt) {
    return (
      <main className="flex min-h-dvh flex-col gap-8 px-8 py-6">
        <LehrkraftKopf />
        <p className="text-2xl text-white/70">Quiz wird geladen …</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 px-8 py-6 lg:px-12">
      <LehrkraftKopf links={<ZurueckLink zu="/leiten" text="← Meine Quizze" />} />

      <div className="sticky top-0 z-10 -mx-8 flex flex-wrap items-end gap-4 bg-quizzo-navy/95 px-8 py-4 backdrop-blur lg:-mx-12 lg:px-12">
        <label className="flex min-w-72 flex-1 flex-col gap-1 text-lg font-semibold">
          Titel des Quiz
          <input
            value={titel}
            onChange={(e) => {
              setTitel(e.target.value)
              setGespeichert(false)
            }}
            placeholder="z. B. Bruchrechnung Klasse 6"
            maxLength={200}
            className="rounded-xl bg-white px-4 py-3 text-3xl font-bold text-quizzo-navy placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
          />
        </label>
        <Knopf onClick={speichern} disabled={speichert} className="!px-8 !py-4 !text-2xl">
          {speichert ? 'Speichert …' : 'Speichern'}
        </Knopf>
      </div>

      {fehler.length > 0 && (
        <div role="alert" className="rounded-2xl bg-red-500/20 px-5 py-4 text-lg font-semibold text-red-100 ring-2 ring-red-400/60">
          <p>Bitte noch korrigieren:</p>
          <ul className="mt-1 list-disc pl-6">
            {fehler.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {gespeichert && <Meldung art="erfolg">Gespeichert.</Meldung>}

      <ol className="flex flex-col gap-6">
        {fragen.map((f, fi) => {
          const info = FRAGETYPEN[f.typ]
          return (
            <li key={fi} className="flex flex-col gap-4 rounded-3xl bg-quizzo-navy-light/70 p-6 ring-1 ring-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-2xl font-extrabold text-quizzo-yellow">Frage {fi + 1}</h3>
                  <select
                    value={f.typ}
                    onChange={(e) => aendere(fi, wechsleTyp(f, e.target.value as FrageTyp))}
                    aria-label={`Fragetyp ${fi + 1}`}
                    className={auswahlStil}
                  >
                    {TYP_REIHENFOLGE.map((t) => (
                      <option key={t} value={t}>
                        {FRAGETYPEN[t].symbol} {FRAGETYPEN[t].name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {f.typ !== 'folie' && (
                    <label className="flex items-center gap-2 text-lg">
                      Zeit
                      <select value={f.zeitlimit} onChange={(e) => aendere(fi, { ...f, zeitlimit: Number(e.target.value) })} className={auswahlStil} aria-label={`Zeitlimit Frage ${fi + 1}`}>
                        {ZEITLIMITS.map((z) => (
                          <option key={z} value={z}>
                            {z < 60 ? `${z} s` : `${z / 60} min`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {info.bewertet && (
                    <label className="flex items-center gap-2 text-lg">
                      Punkte
                      <select value={f.punkte} onChange={(e) => aendere(fi, { ...f, punkte: Number(e.target.value) as Punkte })} className={auswahlStil} aria-label={`Punkte Frage ${fi + 1}`}>
                        <option value={1}>normal</option>
                        <option value={2}>doppelt</option>
                        <option value={0}>keine</option>
                      </select>
                    </label>
                  )}
                  <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => verschiebe(fi, -1)} disabled={fi === 0} aria-label={`Frage ${fi + 1} nach oben`}>
                    ↑
                  </Knopf>
                  <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => verschiebe(fi, 1)} disabled={fi === fragen.length - 1} aria-label={`Frage ${fi + 1} nach unten`}>
                    ↓
                  </Knopf>
                  <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => dupliziere(fi)} aria-label={`Frage ${fi + 1} kopieren`} title="Frage kopieren">
                    ⧉
                  </Knopf>
                  <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => entferne(fi)} aria-label={`Frage ${fi + 1} entfernen`}>
                    Entfernen
                  </Knopf>
                </div>
              </div>

              <textarea
                value={f.text}
                onChange={(e) => aendere(fi, { ...f, text: e.target.value })}
                placeholder={f.typ === 'folie' ? 'Überschrift der Folie' : f.typ === 'wahrfalsch' ? 'Aussage eingeben' : 'Fragetext eingeben'}
                maxLength={500}
                rows={2}
                aria-label={`Fragetext ${fi + 1}`}
                className="resize-y rounded-xl bg-white px-4 py-3 text-2xl font-semibold text-quizzo-navy placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
              />

              <MedienFeld medium={f.medium} nr={fi + 1} setze={(medium) => aendere(fi, { ...f, medium })} hochgeladen={(p) => gesehenePfade.current.add(p)} />

              <FrageFelder frage={f} nr={fi + 1} setzeInhalt={(inhalt) => aendere(fi, { ...f, inhalt } as Frage)} />
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg font-semibold text-white/80">Neue Frage:</span>
        {TYP_REIHENFOLGE.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setFragen((alt) => [...alt, neueFrage(t)])
              setGespeichert(false)
            }}
            title={FRAGETYPEN[t].beschreibung}
            className="rounded-xl border-2 border-quizzo-yellow/70 px-3 py-2 text-lg font-bold text-quizzo-yellow transition hover:bg-quizzo-yellow hover:text-quizzo-navy"
          >
            + {FRAGETYPEN[t].symbol} {FRAGETYPEN[t].name}
          </button>
        ))}
      </div>
    </main>
  )
}
