import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Knopf, Meldung } from '../../components.tsx'
import { FRAGETYPEN } from '../../lib/fragetypen.ts'
import { SCHWELLE, erstelleWiederholungsQuiz, ladeDiagnose, schwacheFragen, werteAus, type DiagnoseDaten } from '../../lib/diagnose.ts'
import { fehlerText } from '../../lib/supabase.ts'

// Diagnose nach dem Live-Spiel – nur für die Lehrkraft (Tablet/Laptop, nicht am Beamer zeigen)

const prozent = (x: number) => `${Math.round(x * 100)} %`
const farbe = (x: number) => (x >= 0.8 ? 'bg-green-500' : x >= SCHWELLE ? 'bg-amber-500' : 'bg-red-500')

function Zelle({ anteil }: { anteil: number | null | undefined }) {
  if (anteil === undefined) return <td className="px-1 text-center text-white/30">·</td>
  if (anteil === null) return <td className="px-1 text-center text-white/40" title="keine Antwort">–</td>
  const [zeichen, stil, titel] = anteil >= 1 ? ['✓', 'text-green-300', 'richtig'] : anteil > 0 ? ['◐', 'text-amber-300', `${prozent(anteil)} richtig`] : ['✗', 'text-red-300', 'falsch']
  return (
    <td className={`px-1 text-center text-xl font-black ${stil}`} title={titel}>
      {zeichen}
    </td>
  )
}

export default function SpielDiagnose() {
  const { id } = useParams()
  const [daten, setDaten] = useState<DiagnoseDaten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [neuesQuiz, setNeuesQuiz] = useState<string | null>(null)
  const [erstellt, setErstellt] = useState(false)
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    if (!id) return
    ladeDiagnose(id)
      .then(setDaten)
      .catch((err) => setFehler(fehlerText(err)))
  }, [id])

  const auswertung = useMemo(() => (daten ? werteAus(daten) : null), [daten])
  const schwach = auswertung ? schwacheFragen(auswertung.fragen) : []

  async function wiederholungAnlegen() {
    if (!daten || !schwach.length) return
    setLaeuft(true)
    setFehler(null)
    try {
      setNeuesQuiz(await erstelleWiederholungsQuiz(daten.titel, schwach))
      setErstellt(true)
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black">📊 Diagnose</h1>
          {daten && (
            <p className="text-xl text-white/70">
              {daten.titel}
              {daten.runde > 1 && ` · Runde ${daten.runde}`} · {daten.spieler.length} Mitspielende
            </p>
          )}
        </div>
        <Link to={`/leiten/spiel/${id}`} className="rounded-xl bg-white/10 px-5 py-3 text-xl font-bold hover:bg-white/20">
          ← Zurück zum Spiel
        </Link>
      </header>

      <p className="rounded-2xl bg-amber-500/20 px-5 py-3 text-lg ring-1 ring-amber-400/50" role="note">
        🔒 Nur für dich – bitte nicht am Beamer zeigen: Hier stehen Spitznamen mit Ergebnissen. Beim Beenden des Spiels wird alles gelöscht.
      </p>

      {fehler && <Meldung art="fehler">{fehler}</Meldung>}
      {!daten && !fehler && <p className="text-xl text-white/70">Wird geladen …</p>}

      {auswertung && daten && (
        <>
          <section className="flex flex-col gap-3" aria-labelledby="diagnose-fragen">
            <h2 id="diagnose-fragen" className="text-2xl font-extrabold">
              Fragen
            </h2>
            <ol className="flex flex-col gap-2">
              {auswertung.fragen
                .filter((f) => f.frage.typ !== 'folie')
                .map((f) => (
                  <li key={f.nr} className="flex flex-col gap-1 rounded-2xl bg-quizzo-navy-light px-5 py-3 ring-1 ring-white/10">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="min-w-0 text-xl font-bold">
                        <span className="text-quizzo-yellow">F{f.nr + 1}</span> {f.frage.text}
                        <span className="ml-2 text-base font-normal text-white/60">{FRAGETYPEN[f.frage.typ].name}</span>
                      </span>
                      <span className="shrink-0 text-2xl font-black tabular-nums">{f.quote === null ? `${f.beantwortet} Antworten` : prozent(f.quote)}</span>
                    </div>
                    {f.quote !== null && (
                      <div className="h-3 rounded-full bg-white/10" aria-hidden="true">
                        <div className={`h-3 rounded-full ${farbe(f.quote)}`} style={{ width: prozent(f.quote) }} />
                      </div>
                    )}
                    {f.fehler && (
                      <p className="text-lg text-white/80">
                        Häufigste falsche Antwort: <b className="text-red-200">„{f.fehler.text}“</b> ({f.fehler.anzahl}×)
                      </p>
                    )}
                  </li>
                ))}
            </ol>
          </section>

          <section className="flex flex-col gap-3 rounded-3xl bg-white/5 p-5" aria-labelledby="diagnose-wiederholung">
            <h2 id="diagnose-wiederholung" className="text-2xl font-extrabold">
              🔁 Wiederholung
            </h2>
            {schwach.length ? (
              <>
                <p className="text-lg text-white/80">
                  {schwach.length} {schwach.length === 1 ? 'Frage wurde' : 'Fragen wurden'} von weniger als {prozent(SCHWELLE)} richtig beantwortet. Daraus kannst du ein neues Quiz machen – z. B. für die nächste Stunde oder als Selbstlern-Aufgabe.
                </p>
                {!erstellt ? (
                  <Knopf onClick={wiederholungAnlegen} disabled={laeuft} className="self-start">
                    {laeuft ? 'Wird angelegt …' : `Quiz „${daten.titel} – Wiederholung“ anlegen`}
                  </Knopf>
                ) : (
                  <Meldung art="erfolg">
                    Das Quiz ist angelegt.{' '}
                    {neuesQuiz && (
                      <Link to={`/leiten/quiz/${neuesQuiz}`} className="font-bold underline">
                        Jetzt bearbeiten
                      </Link>
                    )}
                  </Meldung>
                )}
              </>
            ) : (
              <p className="text-lg text-white/80">Alle Fragen saßen bei mindestens {prozent(SCHWELLE)} – keine Wiederholung nötig. 🎉</p>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="diagnose-spieler">
            <h2 id="diagnose-spieler" className="text-2xl font-extrabold">
              Wer braucht noch Hilfe?
            </h2>
            <p className="text-base text-white/70">Schwächste zuerst · ✓ richtig · ◐ teilweise · ✗ falsch · – keine Antwort</p>
            <div className="overflow-x-auto rounded-2xl bg-quizzo-navy-light ring-1 ring-white/10">
              <table className="w-full text-lg">
                <thead>
                  <tr className="text-left text-white/70">
                    <th className="px-4 py-2">Spitzname</th>
                    {auswertung.fragen.map((f) => (FRAGETYPEN[f.frage.typ].bewertet ? <th key={f.nr} className="px-1 text-center" title={f.frage.text}>F{f.nr + 1}</th> : null))}
                    <th className="px-4 py-2 text-right">gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {auswertung.spieler.map((s) => (
                    <tr key={s.spieler.id} className="border-t border-white/10">
                      <th scope="row" className="px-4 py-2 text-left font-bold">
                        {s.spieler.spitzname}
                      </th>
                      {auswertung.fragen.map((f) => (FRAGETYPEN[f.frage.typ].bewertet ? <Zelle key={f.nr} anteil={s.anteile[f.nr]} /> : null))}
                      <td className="px-4 py-2 text-right font-black tabular-nums">
                        <span className={`rounded-lg px-2 py-0.5 ${farbe(s.gesamt)}`}>{prozent(s.gesamt)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
