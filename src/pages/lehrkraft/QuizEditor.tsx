import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Knopf, LehrkraftKopf, Meldung, ZurueckLink } from '../../components.tsx'
import {
  MAX_ANTWORTEN,
  ZEITLIMITS,
  ladeQuiz,
  neueFrage,
  pruefeQuiz,
  speichereQuiz,
  zuEditorFrage,
  type EditorFrage,
} from '../../lib/quizze.ts'
import { fehlerText } from '../../lib/supabase.ts'
import { ANTWORT_STIL } from '../../lib/antwortStil.ts'

export default function QuizEditor() {
  const { id } = useParams()
  const istNeu = id === 'neu' || !id
  const navigate = useNavigate()

  const [titel, setTitel] = useState('')
  const [fragen, setFragen] = useState<EditorFrage[]>(istNeu ? [neueFrage()] : [])
  const [laedt, setLaedt] = useState(!istNeu)
  const [fehler, setFehler] = useState<string[]>([])
  const [gespeichert, setGespeichert] = useState(false)
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    if (istNeu || !id) return
    ladeQuiz(id)
      .then((q) => {
        setTitel(q.titel)
        setFragen(q.fragen.length ? q.fragen.map(zuEditorFrage) : [neueFrage()])
      })
      .catch((err) => setFehler([fehlerText(err)]))
      .finally(() => setLaedt(false))
  }, [id, istNeu])

  function aendereFrage(index: number, aenderung: Partial<EditorFrage>) {
    setGespeichert(false)
    setFragen((alt) => alt.map((f, i) => (i === index ? { ...f, ...aenderung } : f)))
  }

  function aendereAntwort(fIndex: number, aIndex: number, text: string) {
    const antworten = [...fragen[fIndex].antworten]
    antworten[aIndex] = text
    aendereFrage(fIndex, { antworten })
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

  async function speichern() {
    const probleme = pruefeQuiz(titel, fragen)
    setFehler(probleme)
    setGespeichert(false)
    if (probleme.length) return
    setSpeichert(true)
    try {
      const neueId = await speichereQuiz(istNeu ? null : id!, titel, fragen)
      setGespeichert(true)
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
        {fragen.map((f, fi) => (
          <li key={fi} className="flex flex-col gap-4 rounded-3xl bg-quizzo-navy-light/70 p-6 ring-1 ring-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-2xl font-extrabold text-quizzo-yellow">Frage {fi + 1}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-lg">
                  Zeit
                  <select
                    value={f.zeitlimit}
                    onChange={(e) => aendereFrage(fi, { zeitlimit: Number(e.target.value) })}
                    className="rounded-lg bg-white px-3 py-2 text-lg font-semibold text-quizzo-navy"
                    aria-label={`Zeitlimit Frage ${fi + 1}`}
                  >
                    {ZEITLIMITS.map((z) => (
                      <option key={z} value={z}>
                        {z} Sekunden
                      </option>
                    ))}
                  </select>
                </label>
                <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => verschiebe(fi, -1)} disabled={fi === 0} aria-label={`Frage ${fi + 1} nach oben`}>
                  ↑
                </Knopf>
                <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => verschiebe(fi, 1)} disabled={fi === fragen.length - 1} aria-label={`Frage ${fi + 1} nach unten`}>
                  ↓
                </Knopf>
                <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => entferne(fi)} aria-label={`Frage ${fi + 1} entfernen`}>
                  Entfernen
                </Knopf>
              </div>
            </div>

            <textarea
              value={f.text}
              onChange={(e) => aendereFrage(fi, { text: e.target.value })}
              placeholder="Fragetext eingeben"
              maxLength={500}
              rows={2}
              aria-label={`Fragetext ${fi + 1}`}
              className="resize-y rounded-xl bg-white px-4 py-3 text-2xl font-semibold text-quizzo-navy placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
            />

            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: MAX_ANTWORTEN }, (_, ai) => {
                const istRichtig = f.richtig === ai
                return (
                  <div
                    key={ai}
                    className={`flex items-center gap-3 rounded-2xl p-2 ring-3 transition ${istRichtig ? 'bg-green-500/20 ring-green-400' : 'bg-white/5 ring-transparent'}`}
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-black text-white ${ANTWORT_STIL[ai].farbe}`}>
                      {ANTWORT_STIL[ai].buchstabe}
                    </span>
                    <input
                      value={f.antworten[ai]}
                      onChange={(e) => aendereAntwort(fi, ai, e.target.value)}
                      placeholder={ai < 2 ? `Antwort ${ANTWORT_STIL[ai].buchstabe}` : `Antwort ${ANTWORT_STIL[ai].buchstabe} (optional)`}
                      maxLength={120}
                      aria-label={`Frage ${fi + 1} Antwort ${ANTWORT_STIL[ai].buchstabe}`}
                      className="min-w-0 flex-1 rounded-xl bg-white px-3 py-3 text-xl text-quizzo-navy placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60"
                    />
                    <button
                      type="button"
                      onClick={() => aendereFrage(fi, { richtig: ai })}
                      aria-pressed={istRichtig}
                      aria-label={`Frage ${fi + 1}: Antwort ${ANTWORT_STIL[ai].buchstabe} ist richtig`}
                      title="Als richtige Antwort markieren"
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-black transition ${
                        istRichtig ? 'bg-green-500 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'
                      }`}
                    >
                      ✓
                    </button>
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ol>

      <Knopf
        art="rahmen"
        className="self-start"
        onClick={() => {
          setFragen((alt) => [...alt, neueFrage()])
          setGespeichert(false)
        }}
      >
        + Frage hinzufügen
      </Knopf>
    </main>
  )
}
