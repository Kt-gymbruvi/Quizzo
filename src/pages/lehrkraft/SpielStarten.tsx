import { useEffect, useRef, useState } from 'react'
import { Knopf } from '../../components.tsx'
import type { Spielmodus } from '../../lib/spiel.ts'
import { TEAMS } from '../../lib/teams.ts'

// Dialog vor dem Spielstart: Spielmodus wählen

const MODI: { modus: Spielmodus; name: string; text: string; symbol: string }[] = [
  { modus: 'klassisch', name: 'Klassisch', text: 'Jede und jeder spielt für sich. Bestenliste nach jeder Frage.', symbol: '🏆' },
  { modus: 'team', name: 'Team', text: 'Alle werden automatisch auf Teams verteilt. Es zählt der Punkteschnitt des Teams.', symbol: '🤝' },
]

export function SpielStarten({
  titel,
  laeuft,
  starten,
  abbrechen,
}: {
  titel: string
  laeuft: boolean
  starten: (modus: Spielmodus, teams: number | null) => void
  abbrechen: () => void
}) {
  const [modus, setModus] = useState<Spielmodus>('klassisch')
  const [teams, setTeams] = useState(2)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (!d || d.open) return
    // als modales Fenster (mit abgedunkeltem Hintergrund); ältere Browser/Testumgebung: einfach öffnen
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="spielstart-titel"
      onCancel={(e) => {
        e.preventDefault()
        abbrechen()
      }}
      className="fixed inset-0 z-50 m-auto w-[min(48rem,calc(100%-2rem))] rounded-3xl bg-quizzo-navy p-8 text-white shadow-2xl ring-2 ring-quizzo-yellow/60 backdrop:bg-black/60"
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          starten(modus, modus === 'team' ? teams : null)
        }}
      >
        <div>
          <h2 id="spielstart-titel" className="text-4xl font-extrabold">
            Wie wollt ihr spielen?
          </h2>
          <p className="mt-1 text-xl text-white/70 break-words">{titel}</p>
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Spielmodus</legend>
          {MODI.map((m) => (
            <label
              key={m.modus}
              className={`flex cursor-pointer flex-col gap-2 rounded-2xl p-5 ring-2 transition ${
                modus === m.modus ? 'bg-quizzo-yellow text-quizzo-navy ring-quizzo-yellow' : 'bg-quizzo-navy-light ring-white/15 hover:ring-white/40'
              }`}
            >
              <input type="radio" name="modus" value={m.modus} checked={modus === m.modus} onChange={() => setModus(m.modus)} aria-label={m.name} className="sr-only" />
              <span className="text-3xl font-extrabold">
                <span aria-hidden="true">{m.symbol}</span> {m.name}
              </span>
              <span className="text-lg">{m.text}</span>
            </label>
          ))}
        </fieldset>

        {modus === 'team' && (
          <div className="flex flex-col gap-3">
            <span className="text-xl font-semibold">Anzahl der Teams</span>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Anzahl der Teams">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={teams === n}
                  onClick={() => setTeams(n)}
                  className={`h-16 w-16 rounded-2xl text-3xl font-black ring-2 ${teams === n ? 'bg-quizzo-yellow text-quizzo-navy ring-quizzo-yellow' : 'bg-quizzo-navy-light ring-white/15'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="flex flex-wrap gap-2 text-lg">
              {TEAMS.slice(0, teams).map((t) => (
                <span key={t.name} className={`rounded-full px-3 py-1 font-bold ${t.farbe}`}>
                  {t.zeichen} {t.name}
                </span>
              ))}
            </p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <Knopf type="button" art="leise" onClick={abbrechen}>
            Abbrechen
          </Knopf>
          <Knopf type="submit" disabled={laeuft} className="!px-8 !text-2xl">
            {laeuft ? 'Spiel wird erstellt …' : '▶ Spiel erstellen'}
          </Knopf>
        </div>
      </form>
    </dialog>
  )
}
