import { useState, type ReactNode } from 'react'
import { ANTWORT_STIL, FALSCH_STIL, WAHR_STIL } from '../lib/antwortStil.ts'
import type { Medium } from '../lib/fragetypen.ts'
import { normalisiere, type AbgegebeneAntwort, type LehrkraftFrage } from '../lib/spiel.ts'

// Beamer-Ansicht (Lehrkraft, iPad quer): Frage und Auswertung je Fragetyp

function Kachel({ i, children, gedimmt = false, markiert = false }: { i: number; children: ReactNode; gedimmt?: boolean; markiert?: boolean }) {
  return (
    <li
      className={`flex items-center gap-5 rounded-3xl px-6 py-5 text-3xl font-bold text-white transition xl:text-4xl ${ANTWORT_STIL[i].farbe} ${
        gedimmt ? 'opacity-35' : ''
      } ${markiert ? 'ring-8 ring-white' : ''}`}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-3xl font-black">{ANTWORT_STIL[i].buchstabe}</span>
      <span className="break-words">{children}</span>
    </li>
  )
}

function Hinweis({ children }: { children: ReactNode }) {
  return <p className="flex flex-1 items-center justify-center text-center text-4xl font-bold text-white/80">{children}</p>
}

const raster = (n: number) => (n > 4 ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-2')

/** Abspielbereich als Media-Fragment (#t=start,ende) – wird von allen gängigen Browsern verstanden */
const ausschnitt = (m: { start?: number; ende?: number }) =>
  m.start || m.ende ? `#t=${m.start ?? 0}${m.ende ? ',' + m.ende : ''}` : ''

/** Bild, Ton oder Video zur Frage. Wird nicht automatisch abgespielt – die Lehrkraft startet es. */
export function BeamerMedium({ medium }: { medium: Medium }) {
  switch (medium.art) {
    case 'bild':
      return <img src={medium.url} alt={medium.beschreibung ?? ''} className="h-full max-h-[60vh] w-full min-h-0 rounded-3xl bg-white/5 object-contain" />
    case 'audio':
      return (
        <div className="flex items-center gap-4 rounded-3xl bg-white/10 px-6 py-4">
          <span className="text-5xl" aria-hidden="true">
            🔊
          </span>
          <audio src={medium.url + ausschnitt(medium)} controls preload="auto" className="h-14 flex-1" aria-label="Audio zur Frage" />
        </div>
      )
    case 'video':
      return <video src={medium.url + ausschnitt(medium)} controls preload="auto" playsInline className="h-full max-h-[60vh] w-full min-h-0 rounded-3xl bg-black" aria-label="Video zur Frage" />
    case 'youtube': {
      // youtube-nocookie: YouTube setzt erst beim Abspielen Cookies (nur auf dem Lehrkraft-Gerät)
      const p = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' })
      if (medium.start) p.set('start', String(medium.start))
      if (medium.ende) p.set('end', String(medium.ende))
      return (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${medium.id}?${p}`}
          title="Video zur Frage"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="aspect-video max-h-[60vh] w-full rounded-3xl bg-black"
        />
      )
    }
  }
}

/** Anzeige während die Frage läuft */
export function BeamerFrage({ frage }: { frage: LehrkraftFrage }) {
  const a = frage.ansicht
  switch (frage.typ) {
    case 'auswahl':
    case 'umfrage':
      return (
        <div className="flex flex-1 flex-col gap-4">
          {frage.typ === 'auswahl' && a.mehrfach && <p className="text-center text-2xl font-bold text-quizzo-yellow">Mehrere Antworten sind richtig!</p>}
          <ul className={`grid flex-1 gap-5 ${raster(frage.inhalt.antworten.length)}`}>
            {frage.inhalt.antworten.map((t, i) => (
              <Kachel key={i} i={i}>
                {t}
              </Kachel>
            ))}
          </ul>
        </div>
      )
    case 'wahrfalsch':
      return (
        <ul className="grid flex-1 grid-cols-2 gap-5">
          {[WAHR_STIL, FALSCH_STIL].map((s) => (
            <li key={s.text} className={`flex items-center justify-center rounded-3xl text-6xl font-black text-white ${s.farbe}`}>
              {s.text}
            </li>
          ))}
        </ul>
      )
    case 'freitext':
      return <Hinweis>✍ Tippt eure Antwort auf dem Handy ein.</Hinweis>
    case 'wortwolke':
      return <Hinweis>☁ Schickt ein oder zwei Wörter – sie erscheinen gleich hier als Wortwolke.</Hinweis>
    case 'offen':
      return <Hinweis>✎ Schreibt eure Antwort auf dem Handy.</Hinweis>
    case 'reihenfolge':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <p className="text-3xl font-bold text-quizzo-yellow">Bringt in die richtige Reihenfolge:</p>
          <ul className="flex flex-wrap justify-center gap-4">
            {(a.elemente ?? []).map((e) => (
              <li key={e} className="rounded-2xl bg-white px-6 py-4 text-3xl font-bold text-quizzo-navy">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )
    case 'zuordnung':
      return (
        <div className="grid flex-1 grid-cols-2 gap-10">
          {[a.links ?? [], a.rechts ?? []].map((spalte, s) => (
            <ul key={s} className="flex flex-col justify-center gap-4">
              {spalte.map((e) => (
                <li key={e} className={`rounded-2xl px-6 py-4 text-3xl font-bold ${s === 0 ? 'bg-white text-quizzo-navy' : 'bg-quizzo-yellow text-quizzo-navy'}`}>
                  {e}
                </li>
              ))}
            </ul>
          ))}
        </div>
      )
    case 'schieberegler':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <p className="text-3xl font-bold text-white/80">Schätzt eine Zahl zwischen</p>
          <div className="flex w-full max-w-4xl items-center gap-6 text-5xl font-black">
            <span>{zahl(frage.inhalt.min)}</span>
            <div className="h-5 flex-1 rounded-full bg-gradient-to-r from-sky-500 via-quizzo-yellow to-rose-500" />
            <span>{zahl(frage.inhalt.max)}</span>
          </div>
          {frage.inhalt.einheit && <p className="text-3xl text-white/80">Einheit: {frage.inhalt.einheit}</p>}
        </div>
      )
    case 'folie':
      return frage.inhalt.text ? (
        <p className="flex-1 whitespace-pre-line rounded-3xl bg-white/5 px-10 py-8 text-4xl leading-snug">{frage.inhalt.text}</p>
      ) : (
        <div className="flex-1" />
      )
  }
}

const zahlFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
export const zahl = (n: number) => zahlFormat.format(n)

function Balken({ i, text, anzahl, max, richtig, farbe }: { i: number; text: ReactNode; anzahl: number; max: number; richtig?: boolean; farbe?: string }) {
  const f = farbe ?? ANTWORT_STIL[i].farbe
  return (
    <li className={`flex flex-col gap-2 rounded-3xl p-4 ${richtig === true ? 'bg-green-500/25 ring-4 ring-green-400' : richtig === false ? 'opacity-55' : ''}`}>
      <div className="flex items-center justify-between gap-4 text-3xl font-bold">
        <span className="flex items-center gap-4">
          {!farbe && <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-black ${f}`}>{ANTWORT_STIL[i].buchstabe}</span>}
          <span className="break-words">{text}</span>
          {richtig && <span aria-label="richtige Antwort">✓</span>}
        </span>
        <span className="tabular-nums">{anzahl}</span>
      </div>
      <div className="h-4 rounded-full bg-white/10">
        <div className={`h-4 rounded-full ${f}`} style={{ width: `${(anzahl / Math.max(1, max)) * 100}%` }} />
      </div>
    </li>
  )
}

function Kennzahl({ wert, text }: { wert: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-white/5 px-8 py-5">
      <span className="text-5xl font-black text-quizzo-yellow tabular-nums">{wert}</span>
      <span className="text-xl text-white/80">{text}</span>
    </div>
  )
}

/** Gruppiert Texte (ohne Groß-/Kleinschreibung) und zählt sie, häufigste zuerst. */
export function zaehleTexte(texte: string[]) {
  const gruppen = new Map<string, { text: string; anzahl: number }>()
  for (const t of texte) {
    const k = normalisiere(t)
    if (!k) continue
    const g = gruppen.get(k)
    if (g) g.anzahl++
    else gruppen.set(k, { text: t.trim(), anzahl: 1 })
  }
  return [...gruppen.entries()].map(([schluessel, g]) => ({ schluessel, ...g })).sort((a, b) => b.anzahl - a.anzahl)
}

/** Auswertung nach dem Auflösen */
export function BeamerAuswertung({ frage, antworten }: { frage: LehrkraftFrage; antworten: AbgegebeneAntwort[] }) {
  const richtigeAnzahl = antworten.filter((a) => a.anteil >= 1).length
  switch (frage.typ) {
    case 'auswahl':
    case 'umfrage': {
      const zaehler = frage.inhalt.antworten.map((_, i) => antworten.filter((a) => Array.isArray(a.antwort) && a.antwort.includes(i)).length)
      const max = Math.max(...zaehler)
      return (
        <ul className="flex flex-col gap-3">
          {frage.inhalt.antworten.map((t, i) => (
            <Balken key={i} i={i} text={t} anzahl={zaehler[i]} max={max} richtig={frage.typ === 'auswahl' ? frage.inhalt.richtig.includes(i) : undefined} />
          ))}
        </ul>
      )
    }
    case 'wahrfalsch': {
      const zaehler = [true, false].map((w) => antworten.filter((a) => a.antwort === w).length)
      return (
        <ul className="flex flex-col gap-3">
          {[WAHR_STIL, FALSCH_STIL].map((s, i) => (
            <Balken key={s.text} i={i} farbe={s.farbe} text={s.text} anzahl={zaehler[i]} max={Math.max(...zaehler)} richtig={frage.inhalt.richtig === (i === 0)} />
          ))}
        </ul>
      )
    }
    case 'freitext': {
      const gruppen = zaehleTexte(antworten.map((a) => String(a.antwort ?? '')))
      const loesungen = new Set(frage.inhalt.loesungen.map(normalisiere))
      return (
        <div className="flex flex-col gap-4">
          <p className="text-3xl">
            Richtig: <b className="text-green-300">{frage.inhalt.loesungen.join(' / ')}</b> · {richtigeAnzahl} von {antworten.length} richtig
          </p>
          <ul className="flex flex-wrap gap-3">
            {gruppen.slice(0, 15).map((g) => (
              <li key={g.schluessel} className={`rounded-2xl px-5 py-3 text-2xl font-bold ${loesungen.has(g.schluessel) ? 'bg-green-500 text-white' : 'bg-white/10'}`}>
                {g.text} <span className="opacity-70">×{g.anzahl}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    }
    case 'reihenfolge':
      return (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3">
            {frage.inhalt.elemente.map((e, i) => (
              <li key={e} className="flex items-center gap-4 rounded-2xl bg-green-500/20 px-5 py-3 text-3xl font-bold ring-2 ring-green-400">
                <span className="text-quizzo-yellow">{i + 1}.</span> {e}
              </li>
            ))}
          </ol>
          <Kennzahl wert={`${richtigeAnzahl} / ${antworten.length}`} text="haben die richtige Reihenfolge" />
        </div>
      )
    case 'zuordnung': {
      const schnitt = antworten.length ? Math.round((antworten.reduce((s, a) => s + a.anteil, 0) / antworten.length) * 100) : 0
      return (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {frage.inhalt.paare.map((p) => (
              <li key={p.links} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl bg-green-500/20 px-5 py-3 text-3xl font-bold ring-2 ring-green-400">
                <span>{p.links}</span>
                <span className="text-quizzo-yellow">⇄</span>
                <span>{p.rechts}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-4">
            <Kennzahl wert={`${schnitt} %`} text="der Paare richtig zugeordnet" />
            <Kennzahl wert={`${richtigeAnzahl} / ${antworten.length}`} text="alles richtig" />
          </div>
        </div>
      )
    }
    case 'schieberegler': {
      const werte = antworten.map((a) => Number(a.antwort)).filter(Number.isFinite)
      const schnitt = werte.length ? werte.reduce((s, w) => s + w, 0) / werte.length : null
      const e = frage.inhalt.einheit ? ` ${frage.inhalt.einheit}` : ''
      const { min, max, richtig } = frage.inhalt
      const pos = (w: number) => `${((w - min) / (max - min)) * 100}%`
      return (
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap gap-4">
            <Kennzahl wert={`${zahl(richtig)}${e}`} text="richtige Antwort" />
            {schnitt !== null && <Kennzahl wert={`${zahl(Math.round(schnitt * 100) / 100)}${e}`} text="Durchschnitt der Schätzungen" />}
            <Kennzahl wert={`${richtigeAnzahl} / ${antworten.length}`} text="im Toleranzbereich" />
          </div>
          <div className="relative mx-6 mt-6 h-5 rounded-full bg-white/15" aria-label="Verteilung der Schätzungen">
            {werte.map((w, i) => (
              <span key={i} className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/80" style={{ left: pos(w) }} />
            ))}
            <span className="absolute top-1/2 h-10 w-2 -translate-x-1/2 -translate-y-1/2 rounded bg-green-400" style={{ left: pos(richtig) }} />
            <span className="absolute -bottom-9 left-0 text-xl text-white/70">{zahl(min)}</span>
            <span className="absolute right-0 -bottom-9 text-xl text-white/70">{zahl(max)}</span>
          </div>
        </div>
      )
    }
    case 'wortwolke':
      return <Wortwolke texte={antworten.map((a) => String(a.antwort ?? ''))} />
    case 'offen':
      return <OffeneAntworten texte={antworten.map((a) => String(a.antwort ?? ''))} />
    case 'folie':
      return null
  }
}

function Wortwolke({ texte }: { texte: string[] }) {
  const [versteckt, setVersteckt] = useState<Set<string>>(new Set())
  const gruppen = zaehleTexte(texte).filter((g) => !versteckt.has(g.schluessel))
  const max = Math.max(1, ...gruppen.map((g) => g.anzahl))
  const farben = ['text-quizzo-yellow', 'text-sky-300', 'text-rose-300', 'text-emerald-300', 'text-violet-300', 'text-white']
  if (texte.length === 0) return <Hinweis>Keine Antworten.</Hinweis>
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 rounded-3xl bg-white/5 px-8 py-10" aria-label="Wortwolke">
        {gruppen.map((g, i) => (
          <li key={g.schluessel}>
            <button
              onClick={() => setVersteckt(new Set(versteckt).add(g.schluessel))}
              title="Antippen zum Ausblenden"
              className={`font-black leading-none transition hover:line-through ${farben[i % farben.length]}`}
              style={{ fontSize: `${1.5 + (g.anzahl / max) * 3.5}rem` }}
            >
              {g.text}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-center text-lg text-white/60">Antippen blendet ein Wort am Beamer aus.</p>
    </div>
  )
}

function OffeneAntworten({ texte }: { texte: string[] }) {
  const [versteckt, setVersteckt] = useState<Set<number>>(new Set())
  if (texte.length === 0) return <Hinweis>Keine Antworten.</Hinweis>
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {texte.map((t, i) =>
          versteckt.has(i) ? null : (
            <li key={i}>
              <button
                onClick={() => setVersteckt(new Set(versteckt).add(i))}
                title="Antippen zum Ausblenden"
                className="h-full w-full rounded-2xl bg-white px-5 py-4 text-left text-2xl text-quizzo-navy transition hover:opacity-60"
              >
                {t}
              </button>
            </li>
          ),
        )}
      </ul>
      <p className="text-center text-lg text-white/60">Antippen blendet eine Antwort am Beamer aus.</p>
    </div>
  )
}
