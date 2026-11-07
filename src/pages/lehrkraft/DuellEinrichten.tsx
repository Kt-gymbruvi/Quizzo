import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Knopf } from '../../components.tsx'
import { MAX_TEAMS, type DuellEinstellung } from '../../lib/duell.ts'
import { TEAMS } from '../../lib/teams.ts'

// Dialog: Klassen-Duell aus den abgehakten Quizzen einrichten

export function DuellEinrichten({
  titel,
  starten,
  abbrechen,
}: {
  /** Titel der gewählten Quizze = Kategorien */
  titel: string[]
  starten: (e: Omit<DuellEinstellung, 'quizIds'>) => void
  abbrechen: () => void
}) {
  const [teams, setTeams] = useState(2)
  const [zeilen, setZeilen] = useState(5)
  const [zufall, setZufall] = useState(false)
  const [abzug, setAbzug] = useState(false)
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
      aria-labelledby="duell-titel"
      onCancel={(e) => {
        e.preventDefault()
        abbrechen()
      }}
      className="fixed inset-0 z-50 m-auto max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100%-2rem))] overflow-y-auto rounded-3xl bg-quizzo-navy p-8 text-white shadow-2xl ring-2 ring-quizzo-yellow/60 backdrop:bg-black/60"
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          starten({ teams, zeilen, zufall, abzug })
        }}
      >
        <div>
          <h2 id="duell-titel" className="text-4xl font-extrabold">
            🏆 Klassen-Duell einrichten
          </h2>
          <p className="mt-1 text-xl text-white/70">Teams spielen gegeneinander am Beamer – ohne Handys. Jedes Quiz wird eine Kategorie.</p>
        </div>

        <ol className="flex flex-wrap gap-2" aria-label="Kategorien">
          {titel.map((t, i) => (
            <li key={i} className="rounded-xl bg-quizzo-yellow px-3 py-1.5 text-lg font-extrabold text-quizzo-navy">
              {i + 1}. {t}
            </li>
          ))}
        </ol>

        <Auswahl legende="Wie viele Teams?">
          {Array.from({ length: MAX_TEAMS - 1 }, (_, i) => i + 2).map((n) => (
            <Wahl key={n} aktiv={teams === n} onClick={() => setTeams(n)} label={`${n} Teams`}>
              <span className="flex gap-0.5" aria-hidden="true">
                {TEAMS.slice(0, n).map((t) => (
                  <span key={t.name} className={`h-3 w-3 rounded-full ${t.farbe}`} />
                ))}
              </span>
              {n}
            </Wahl>
          ))}
        </Auswahl>

        <Auswahl legende="Fragen pro Kategorie (100 bis 500 Punkte)">
          {[3, 4, 5].map((n) => (
            <Wahl key={n} aktiv={zeilen === n} onClick={() => setZeilen(n)} label={`${n} Fragen pro Kategorie`}>
              {n}
            </Wahl>
          ))}
        </Auswahl>

        <div className="flex flex-col gap-3">
          <Schalter an={zufall} umschalten={() => setZufall((z) => !z)}>
            Fragen zufällig aus jedem Quiz wählen <span className="text-white/60">(sonst die ersten der Reihe nach)</span>
          </Schalter>
          <Schalter an={abzug} umschalten={() => setAbzug((a) => !a)}>
            Falsche Antworten kosten Punkte <span className="text-white/60">(dann darf ein anderes Team antworten)</span>
          </Schalter>
          <p className="text-base text-white/60">
            Leichte Fragen kommen auf die niedrigen Felder, schwere auf die hohen (Schwierigkeit im Frageneditor; ohne Angabe = mittel). Umfragen,
            Wortwolken, offene Fragen und Folien werden übersprungen – sie haben keine richtige Lösung. Der Spielstand bleibt nur auf diesem Gerät.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Knopf type="button" art="leise" onClick={abbrechen}>
            Abbrechen
          </Knopf>
          <Knopf type="submit" className="!px-8 !text-2xl">
            Duell starten
          </Knopf>
        </div>
      </form>
    </dialog>
  )
}

function Auswahl({ legende, children }: { legende: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xl font-semibold">{legende}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

function Wahl({ aktiv, onClick, label, children }: { aktiv: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      aria-label={label}
      className={`flex min-w-20 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-2xl font-extrabold ring-2 transition ${
        aktiv ? 'bg-quizzo-yellow text-quizzo-navy ring-quizzo-yellow' : 'ring-white/20 hover:ring-white/50'
      }`}
    >
      {children}
    </button>
  )
}

function Schalter({ an, umschalten, children }: { an: boolean; umschalten: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-xl">
      <input type="checkbox" checked={an} onChange={umschalten} className="h-6 w-6 accent-quizzo-yellow" />
      <span>{children}</span>
    </label>
  )
}
