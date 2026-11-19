// Klassen-Challenge: Alle spielen gemeinsam. Statt Plätzen zeigt dieser Balken, wie viel die ganze Klasse
// bisher richtig hat (Durchschnitt über die aufgelösten Fragen), mit Medaillen-Stufen bei 50 / 70 / 90 %.

export type Klasse = { prozent: number; fragen: number; letzte?: number | null }

export const MEDAILLEN = [
  { ab: 90, zeichen: '🥇', name: 'Gold' },
  { ab: 70, zeichen: '🥈', name: 'Silber' },
  { ab: 50, zeichen: '🥉', name: 'Bronze' },
] as const

export const medailleFuer = (prozent: number) => MEDAILLEN.find((m) => prozent >= m.ab) ?? null
/** Nächste Stufe, die noch nicht erreicht ist (null bei Gold) */
export const naechsteMedaille = (prozent: number) => [...MEDAILLEN].reverse().find((m) => prozent < m.ab) ?? null

export function KlassenBalken({ klasse, gross = false }: { klasse: Klasse; gross?: boolean }) {
  const p = Math.max(0, Math.min(100, klasse.prozent))
  const medaille = medailleFuer(p)
  return (
    <div className="flex w-full flex-col gap-2">
      <div className={`flex items-baseline justify-between gap-3 font-black ${gross ? 'text-5xl' : 'text-2xl'}`}>
        <span>
          {medaille && <span aria-label={`Medaille ${medaille.name}`}>{medaille.zeichen} </span>}
          <span className="text-quizzo-yellow tabular-nums">{p} %</span>
        </span>
        <span className={`font-semibold text-white/70 ${gross ? 'text-2xl' : 'text-base'}`}>richtig als Klasse</span>
      </div>
      <div
        className={`relative w-full rounded-full bg-white/15 ${gross ? 'h-10' : 'h-5'}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p}
        aria-label="Fortschritt der Klasse"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-quizzo-yellow to-green-400 transition-all duration-700" style={{ width: `${p}%` }} />
        {MEDAILLEN.map((m) => (
          <span key={m.ab} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${m.ab}%` }} aria-hidden="true">
            <span className={`block rounded-full bg-quizzo-navy/70 leading-none ${gross ? 'p-1 text-3xl' : 'text-base'} ${p >= m.ab ? '' : 'opacity-40 grayscale'}`}>{m.zeichen}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
