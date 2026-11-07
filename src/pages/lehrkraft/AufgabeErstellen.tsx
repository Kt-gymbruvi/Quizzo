import { useEffect, useRef, useState } from 'react'
import { Knopf } from '../../components.tsx'
import { MODUS_INFO, type Aufgabenmodus } from '../../lib/aufgaben.ts'

// Dialog: aus einem Quiz eine Aufgabe ohne Live-Spiel machen (Selbstlernen, Hausaufgabe, Prüfung)

const MODI: Aufgabenmodus[] = ['selbstlernen', 'hausaufgabe', 'pruefung']
const TAG = 24 * 3600_000

/** Zeitlimit pro Frage: aus = ohne, quiz = Zeiten aus dem Quiz, fest = gleiche Zeit für alle Fragen */
type Zeitart = 'aus' | 'quiz' | 'fest'
const FESTE_ZEITEN = [20, 30, 45, 60, 90, 120, 180, 300]
const zeitText = (s: number) => (s < 60 ? `${s} Sekunden` : s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} Minuten` : s === 60 ? '1 Minute' : `${s / 60} Minuten`)

/** Datum für <input type="datetime-local"> (Ortszeit, ohne Sekunden) */
export function alsEingabe(d: Date) {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}
function standardFrist(modus: Aufgabenmodus) {
  if (modus === 'pruefung') return new Date(Date.now() + 90 * 60_000) // in 90 Minuten
  const d = new Date(Date.now() + 7 * TAG) // in einer Woche, 23:59 Uhr
  d.setHours(23, 59, 0, 0)
  return d
}

export function AufgabeErstellen({
  titel,
  medienHinweis,
  laeuft,
  erstellen,
  abbrechen,
}: {
  titel: string
  /** Das Quiz enthält Bilder/Audio/Video, die in Aufgaben nicht gezeigt werden */
  medienHinweis?: boolean
  laeuft: boolean
  /** zeit: null = ohne Zeitlimit, 0 = Zeiten aus dem Quiz, sonst Sekunden pro Frage */
  erstellen: (modus: Aufgabenmodus, frist: Date | null, codes: number | null, zeit: number | null) => void
  abbrechen: () => void
}) {
  const [modus, setModus] = useState<Aufgabenmodus>('selbstlernen')
  const [frist, setFrist] = useState(() => alsEingabe(standardFrist('hausaufgabe')))
  const [codes, setCodes] = useState(30)
  const [zeitart, setZeitart] = useState<Zeitart>('fest')
  const [sekunden, setSekunden] = useState(60)
  const [fehler, setFehler] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (!d || d.open) return
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
  }, [])

  function waehle(m: Aufgabenmodus) {
    setModus(m)
    setFehler(null)
    if (m !== 'selbstlernen') setFrist(alsEingabe(standardFrist(m)))
  }

  const maxTage = modus === 'hausaufgabe' ? 14 : 30

  function absenden() {
    if (modus === 'selbstlernen') return erstellen(modus, null, null, null)
    const d = new Date(frist)
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return setFehler('Die Frist muss in der Zukunft liegen.')
    if (d.getTime() > Date.now() + maxTage * TAG) return setFehler(`Die Frist darf höchstens ${maxTage} Tage entfernt sein.`)
    if (modus === 'pruefung' && !(codes >= 1 && codes <= 60)) return setFehler('Bitte 1 bis 60 Codes wählen.')
    erstellen(modus, d, modus === 'pruefung' ? codes : null, zeitart === 'aus' ? null : zeitart === 'quiz' ? 0 : sekunden)
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="aufgabe-titel"
      onCancel={(e) => {
        e.preventDefault()
        abbrechen()
      }}
      className="fixed inset-0 z-50 m-auto max-h-[calc(100dvh-2rem)] w-[min(60rem,calc(100%-2rem))] overflow-y-auto rounded-3xl bg-quizzo-navy p-8 text-white shadow-2xl ring-2 ring-quizzo-yellow/60 backdrop:bg-black/60"
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          absenden()
        }}
      >
        <div>
          <h2 id="aufgabe-titel" className="text-4xl font-extrabold">
            Als Aufgabe verteilen
          </h2>
          <p className="mt-1 text-xl text-white/70 break-words">{titel} · ohne Beamer, jede und jeder im eigenen Tempo am Handy</p>
        </div>

        <fieldset className="grid gap-4 md:grid-cols-3">
          <legend className="sr-only">Art der Aufgabe</legend>
          {MODI.map((m) => {
            const info = MODUS_INFO[m]
            const aktiv = modus === m
            return (
              <label
                key={m}
                className={`flex cursor-pointer flex-col gap-2 rounded-2xl p-5 ring-2 transition ${
                  aktiv ? 'bg-quizzo-yellow text-quizzo-navy ring-quizzo-yellow' : 'bg-quizzo-navy-light ring-white/15 hover:ring-white/40'
                }`}
              >
                <input type="radio" name="aufgabenmodus" value={m} checked={aktiv} onChange={() => waehle(m)} aria-label={info.name} className="sr-only" />
                <span className="text-3xl font-extrabold">
                  <span aria-hidden="true">{info.symbol}</span> {info.name}
                </span>
                <span className="text-lg">{info.text}</span>
                <span className={`mt-auto text-base ${aktiv ? 'text-quizzo-navy/80' : 'text-white/60'}`}>🔒 {info.datenschutz}</span>
              </label>
            )
          })}
        </fieldset>

        {modus !== 'selbstlernen' && (
          <div className="flex flex-wrap items-end gap-6">
            <label className="flex flex-col gap-2 text-xl font-semibold">
              {modus === 'hausaufgabe' ? 'Abgabe bis' : 'Prüfung endet um'}
              <input
                type="datetime-local"
                value={frist}
                min={alsEingabe(new Date())}
                max={alsEingabe(new Date(Date.now() + maxTage * TAG))}
                onChange={(e) => setFrist(e.target.value)}
                className="rounded-xl bg-white px-4 py-3 text-xl text-quizzo-navy"
              />
            </label>
            {modus === 'pruefung' && (
              <label className="flex flex-col gap-2 text-xl font-semibold">
                Anzahl Prüfungscodes
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={codes}
                  onChange={(e) => setCodes(Number(e.target.value))}
                  className="w-32 rounded-xl bg-white px-4 py-3 text-xl text-quizzo-navy"
                />
              </label>
            )}
          </div>
        )}
        {modus !== 'selbstlernen' && (
          <fieldset className="flex flex-col gap-3 rounded-2xl bg-white/5 p-5">
            <legend className="float-left mb-1 text-xl font-semibold">⏱ Zeitlimit pro Frage</legend>
            <div className="clear-both flex flex-wrap gap-3">
              {(
                [
                  ['fest', 'Feste Zeit'],
                  ['quiz', 'Zeiten aus dem Quiz'],
                  ['aus', 'Ohne Zeitlimit'],
                ] as const
              ).map(([wert, text]) => (
                <label
                  key={wert}
                  className={`cursor-pointer rounded-xl px-4 py-2.5 text-lg font-bold ring-2 transition ${
                    zeitart === wert ? 'bg-quizzo-yellow text-quizzo-navy ring-quizzo-yellow' : 'ring-white/20 hover:ring-white/50'
                  }`}
                >
                  <input type="radio" name="zeitart" value={wert} checked={zeitart === wert} onChange={() => setZeitart(wert)} className="sr-only" />
                  {text}
                </label>
              ))}
              {zeitart === 'fest' && (
                <select
                  value={sekunden}
                  onChange={(e) => setSekunden(Number(e.target.value))}
                  aria-label="Zeit pro Frage"
                  className="rounded-xl bg-white px-4 py-2.5 text-lg font-semibold text-quizzo-navy"
                >
                  {FESTE_ZEITEN.map((z) => (
                    <option key={z} value={z}>
                      {zeitText(z)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-base text-white/70">
              {zeitart === 'aus'
                ? 'Die Fragen können ohne Zeitdruck bearbeitet werden.'
                : `${zeitart === 'quiz' ? 'Jede Frage hat die Zeit, die im Quiz eingestellt ist (wie im Live-Spiel).' : `Jede Frage hat ${zeitText(sekunden)}.`} Die Zeit läuft ab dem Öffnen der Frage – Neuladen oder Zurückgehen setzt sie nicht zurück. Wer zu spät antwortet, bekommt für die Frage keine Punkte. Das erschwert Nachschlagen und KI-Hilfe, kann es aber nicht ganz verhindern.`}
            </p>
          </fieldset>
        )}
        {modus === 'pruefung' && (
          <p className="text-lg text-white/75">
            Du bekommst eine Liste mit Codes zum Ausdrucken. Schreib auf deinem Ausdruck zu jedem Code einen Namen und gib jedem Schüler seinen Code.
            Bitte kläre den Einsatz für benotete Prüfungen vorher mit der/dem Datenschutzbeauftragten deiner Schule.
          </p>
        )}
        {medienHinweis && (
          <p className="rounded-2xl bg-amber-500/20 px-5 py-3 text-lg ring-1 ring-amber-400/50">
            Hinweis: Bilder, Audio und Video werden in Aufgaben nicht angezeigt (sie laufen nur am Beamer).
          </p>
        )}
        {fehler && (
          <p role="alert" className="text-xl font-semibold text-red-300">
            {fehler}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <Knopf type="button" art="leise" onClick={abbrechen}>
            Abbrechen
          </Knopf>
          <Knopf type="submit" disabled={laeuft} className="!px-8 !text-2xl">
            {laeuft ? 'Wird erstellt …' : 'Aufgabe erstellen'}
          </Knopf>
        </div>
      </form>
    </dialog>
  )
}
