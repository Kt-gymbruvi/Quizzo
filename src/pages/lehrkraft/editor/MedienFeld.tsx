import { useRef, useState } from 'react'
import { youtubeId, type Medium } from '../../../lib/fragetypen.ts'
import { DATEI_REGELN, ladeHoch, leseZeit, zeitText, type DateiArt } from '../../../lib/medien.ts'
import { fehlerText } from '../../../lib/supabase.ts'

// Medium zu einer Frage: Bild, Audio, Video hochladen oder YouTube-Link. Erscheint nur am Beamer.

const knopf = 'rounded-xl border-2 border-dashed border-white/30 px-4 py-2 text-lg font-semibold text-white/80 hover:border-quizzo-yellow hover:text-quizzo-yellow disabled:opacity-40'
const feld = 'min-w-0 rounded-xl bg-white px-3 py-2 text-lg text-quizzo-navy placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60'

const ARTEN: { art: DateiArt; symbol: string; name: string }[] = [
  { art: 'bild', symbol: '🖼', name: 'Bild' },
  { art: 'audio', symbol: '🔊', name: 'Audio' },
  { art: 'video', symbol: '🎬', name: 'Video' },
]

export function MedienFeld({
  medium,
  nr,
  setze,
  hochgeladen,
}: {
  medium: Medium | null | undefined
  nr: number
  setze: (m: Medium | null) => void
  /** meldet neu hochgeladene Dateien (zum späteren Aufräumen) */
  hochgeladen: (pfad: string) => void
}) {
  const [laedt, setLaedt] = useState<DateiArt | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [youtube, setYoutube] = useState<string | null>(null)
  const dateiWahl = useRef<HTMLInputElement>(null)
  const [wahlArt, setWahlArt] = useState<DateiArt>('bild')

  function waehleDatei(art: DateiArt) {
    setFehler(null)
    setWahlArt(art)
    // erst nach dem Neuzeichnen (accept-Attribut passt dann zur Art)
    setTimeout(() => dateiWahl.current?.click())
  }

  async function dateiGewaehlt(datei: File | undefined) {
    if (!datei) return
    setLaedt(wahlArt)
    setFehler(null)
    try {
      const m = await ladeHoch(datei, wahlArt)
      if ('pfad' in m && m.pfad) hochgeladen(m.pfad)
      setze(m)
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaedt(null)
      if (dateiWahl.current) dateiWahl.current.value = ''
    }
  }

  function youtubeUebernehmen() {
    const id = youtubeId(youtube ?? '')
    if (!id) {
      setFehler('Das ist kein gültiger YouTube-Link (z. B. https://www.youtube.com/watch?v=…).')
      return
    }
    setFehler(null)
    setYoutube(null)
    setze({ art: 'youtube', id })
  }

  const eingabe = (
    <input
      ref={dateiWahl}
      type="file"
      hidden
      accept={DATEI_REGELN[wahlArt].typen.join(',')}
      onChange={(e) => dateiGewaehlt(e.target.files?.[0])}
      aria-label={`Datei für Frage ${nr}`}
      data-testid={`datei-${nr}`}
    />
  )

  if (!medium) {
    return (
      <div className="flex flex-col gap-2">
        {eingabe}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-lg font-semibold text-white/70">Medium (nur am Beamer):</span>
          {ARTEN.map((a) => (
            <button key={a.art} type="button" className={knopf} disabled={laedt !== null} onClick={() => waehleDatei(a.art)}>
              {laedt === a.art ? 'Lädt hoch …' : `+ ${a.symbol} ${a.name}`}
            </button>
          ))}
          {youtube === null && (
            <button type="button" className={knopf} disabled={laedt !== null} onClick={() => setYoutube('')}>
              + ▶ YouTube-Link
            </button>
          )}
        </div>
        {youtube !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), youtubeUebernehmen())}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label={`YouTube-Link Frage ${nr}`}
              autoFocus
              className={`${feld} flex-1`}
            />
            <button type="button" onClick={youtubeUebernehmen} className="rounded-xl bg-quizzo-yellow px-4 py-2 text-lg font-bold text-quizzo-navy">
              Übernehmen
            </button>
            <button type="button" onClick={() => setYoutube(null)} className="rounded-xl px-3 py-2 text-lg text-white/70 hover:text-white">
              Abbrechen
            </button>
          </div>
        )}
        {fehler && <p className="text-lg font-semibold text-red-300">{fehler}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-start gap-4 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <Vorschau medium={medium} />
      <div className="flex min-w-64 flex-1 flex-col gap-2">
        {medium.art === 'bild' ? (
          <label className="flex flex-col gap-1 text-base text-white/80">
            Bildbeschreibung (für Menschen, die das Bild nicht sehen können – freiwillig)
            <input
              value={medium.beschreibung ?? ''}
              onChange={(e) => setze({ ...medium, beschreibung: e.target.value })}
              maxLength={300}
              placeholder="z. B. Landkarte von Frankreich mit Paris"
              className={feld}
            />
          </label>
        ) : (
          <Ausschnitt key={medium.art === 'youtube' ? medium.id : medium.url} medium={medium} setze={setze} nr={nr} />
        )}
        <button type="button" onClick={() => setze(null)} className="self-start rounded-xl bg-white/10 px-4 py-2 text-lg font-semibold hover:bg-white/20">
          Medium entfernen
        </button>
      </div>
    </div>
  )
}

function Vorschau({ medium }: { medium: Medium }) {
  switch (medium.art) {
    case 'bild':
      return <img src={medium.url} alt={medium.beschreibung ?? ''} className="max-h-40 max-w-64 rounded-xl bg-white/10 object-contain" />
    case 'audio':
      return <audio src={medium.url} controls preload="metadata" className="w-72" />
    case 'video':
      return <video src={medium.url} controls preload="metadata" className="max-h-40 max-w-64 rounded-xl bg-black" />
    case 'youtube':
      return (
        <a href={`https://www.youtube.com/watch?v=${medium.id}`} target="_blank" rel="noreferrer" className="flex h-24 w-40 items-center justify-center rounded-xl bg-black text-lg font-bold text-white underline">
          ▶ YouTube-Video
        </a>
      )
  }
}

/** Start- und Endzeit (Ausschnitt) für Audio, Video und YouTube */
function Ausschnitt({ medium, setze, nr }: { medium: Exclude<Medium, { art: 'bild' }>; setze: (m: Medium) => void; nr: number }) {
  const [texte, setTexte] = useState({ start: zeitText(medium.start), ende: zeitText(medium.ende) })
  const [fehler, setFehler] = useState<string | null>(null)

  function uebernimm(neu: typeof texte) {
    const start = leseZeit(neu.start)
    const ende = leseZeit(neu.ende)
    if (Number.isNaN(start) || Number.isNaN(ende)) return setFehler('Zeiten bitte als Minuten:Sekunden eingeben, z. B. 1:30.')
    if (start !== undefined && ende !== undefined && ende <= start) return setFehler('Das Ende muss nach dem Start liegen.')
    setFehler(null)
    const { start: _s, ende: _e, ...rest } = medium
    setze({ ...rest, ...(start ? { start } : {}), ...(ende ? { ende } : {}) } as Medium)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-base text-white/80">Nur einen Ausschnitt abspielen (freiwillig):</span>
      <div className="flex flex-wrap items-center gap-2 text-lg">
        {(['start', 'ende'] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            {k === 'start' ? 'von' : 'bis'}
            <input
              value={texte[k]}
              onChange={(e) => setTexte({ ...texte, [k]: e.target.value })}
              onBlur={() => uebernimm(texte)}
              placeholder={k === 'start' ? '0:00' : 'Ende'}
              inputMode="numeric"
              aria-label={`${k === 'start' ? 'Startzeit' : 'Endzeit'} Frage ${nr}`}
              className={`${feld} w-24 text-center`}
            />
          </label>
        ))}
      </div>
      {fehler && <p className="text-base font-semibold text-red-300">{fehler}</p>}
    </div>
  )
}
