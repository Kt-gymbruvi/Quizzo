import { useState, type ReactNode } from 'react'
import { Knopf } from '../components.tsx'
import { ANTWORT_STIL, FALSCH_STIL, WAHR_STIL } from '../lib/antwortStil.ts'
import { FRAGETYPEN } from '../lib/fragetypen.ts'
import { team, teamName } from '../lib/teams.ts'
import type { SchuelerFrage, SchuelerZustand } from '../lib/spiel.ts'
import { zahl } from './Beamer.tsx'
import { HotspotBild, type Punkt, type Ziel } from './HotspotBild.tsx'
import { KlassenBalken } from './KlassenBalken.tsx'

// Handy-Ansicht (Schüler): Eingabe und Ergebnis je Fragetyp

const druckKnopf = 'shadow-[0_5px_0_rgba(0,0,0,0.3)] transition active:translate-y-1 active:shadow-none'
const feld = 'w-full rounded-2xl bg-white px-4 py-4 text-2xl font-bold text-quizzo-navy placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60'

function AntwortKnopf({ i, children, onClick, gewaehlt, klein }: { i: number; children: ReactNode; onClick: () => void; gewaehlt?: boolean; klein?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={gewaehlt}
      className={`flex h-full items-center gap-3 rounded-2xl px-3 py-2 text-left font-bold leading-tight text-white ${klein ? 'text-lg' : 'text-2xl'} ${druckKnopf} ${
        ANTWORT_STIL[i].farbe
      } ${gewaehlt === false ? 'opacity-50' : ''} ${gewaehlt ? 'ring-4 ring-white' : ''}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-xl bg-white/25 font-black ${klein ? 'h-8 w-8 text-lg' : 'h-11 w-11 text-2xl'}`}>
        {gewaehlt ? '✓' : ANTWORT_STIL[i].buchstabe}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </button>
  )
}

/** Antworten kurz genug für zwei Spalten? (lange Texte bekommen die volle Breite) */
const zweispaltig = (antworten: string[]) => antworten.length > 4 && antworten.every((a) => a.length <= 18)

/** Raster für Antwortknöpfe: füllt den freien Platz; zu viel Inhalt verkleinert <Einpassen> – nie abschneiden. */
function AntwortRaster({ anzahl, spalten, children }: { anzahl: number; spalten: number; children: ReactNode }) {
  return (
    <div
      className="grid flex-1 gap-2"
      style={{ gridTemplateColumns: `repeat(${spalten}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.ceil(anzahl / spalten)}, minmax(min-content, 1fr))` }}
    >
      {children}
    </div>
  )
}

/** Gleich hohe Zeilen, die zusammen den freien Platz füllen (nie kleiner als ihr Inhalt). */
const zeilenRaster = (n: number) => ({ gridTemplateRows: `repeat(${n}, minmax(min-content, 1fr))` })

function Senden({ onClick, disabled, children = 'Antwort senden' }: { onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <Knopf onClick={onClick} disabled={disabled} className="shrink-0 !py-4 !text-2xl">
      {children}
    </Knopf>
  )
}

/** Eingabe während die Frage läuft. `senden` schickt die Antwort im Format der Datenbank. */
export function HandyEingabe({ frage, senden }: { frage: SchuelerFrage; senden: (antwort: unknown) => void }) {
  switch (frage.typ) {
    case 'auswahl':
      return frage.ansicht.mehrfach ? <Mehrfach antworten={frage.ansicht.antworten ?? []} senden={senden} /> : <Einfach antworten={frage.ansicht.antworten ?? []} senden={senden} />
    case 'umfrage':
      return <Einfach antworten={frage.ansicht.antworten ?? []} senden={senden} />
    case 'wahrfalsch':
      return (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-3">
          {[WAHR_STIL, FALSCH_STIL].map((s, i) => (
            <button key={s.text} onClick={() => senden(i === 0)} className={`rounded-3xl text-4xl font-black text-white ${druckKnopf} ${s.farbe}`}>
              {s.text}
            </button>
          ))}
        </div>
      )
    case 'freitext':
    case 'wortwolke':
    case 'offen':
      return <TextEingabe mehrzeilig={frage.typ === 'offen'} maxZeichen={frage.ansicht.max_zeichen ?? 40} senden={senden} platzhalter={frage.typ === 'wortwolke' ? 'Ein oder zwei Wörter' : 'Deine Antwort'} />
    case 'reihenfolge':
      return <Sortieren elemente={frage.ansicht.elemente ?? []} senden={senden} />
    case 'zuordnung':
      return <Zuordnen links={frage.ansicht.links ?? []} rechts={frage.ansicht.rechts ?? []} senden={senden} />
    case 'schieberegler':
      return <Regler min={frage.ansicht.min ?? 0} max={frage.ansicht.max ?? 100} schritt={frage.ansicht.schritt ?? 1} einheit={frage.ansicht.einheit ?? ''} senden={senden} />
    case 'kategorien':
      return <Kategorisieren kategorien={frage.ansicht.kategorien ?? []} begriffe={frage.ansicht.begriffe ?? []} senden={senden} />
    case 'lueckentext':
      return <Lueckentext teile={frage.ansicht.teile ?? []} optionen={frage.ansicht.optionen ?? null} maxZeichen={frage.ansicht.max_zeichen ?? 40} senden={senden} />
    case 'hotspot':
      return <Hotspot bild={frage.ansicht.bild ?? ''} beschreibung={frage.ansicht.beschreibung} senden={senden} />
    case 'folie':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-6xl" aria-hidden="true">
            👀
          </p>
          <p className="text-2xl font-bold">Schau nach vorne!</p>
        </div>
      )
  }
}

function Einfach({ antworten, senden }: { antworten: string[]; senden: (a: unknown) => void }) {
  return (
    <AntwortRaster anzahl={antworten.length} spalten={zweispaltig(antworten) ? 2 : 1}>
      {antworten.map((a, i) => (
        <AntwortKnopf key={i} i={i} klein={antworten.length > 4} onClick={() => senden([i])}>
          {a}
        </AntwortKnopf>
      ))}
    </AntwortRaster>
  )
}

function Mehrfach({ antworten, senden }: { antworten: string[]; senden: (a: unknown) => void }) {
  const [gewaehlt, setGewaehlt] = useState<number[]>([])
  const umschalten = (i: number) => setGewaehlt((g) => (g.includes(i) ? g.filter((x) => x !== i) : [...g, i]))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-center text-base font-bold text-quizzo-yellow">Wähle alle richtigen Antworten!</p>
      <AntwortRaster anzahl={antworten.length} spalten={zweispaltig(antworten) ? 2 : 1}>
        {antworten.map((a, i) => (
          <AntwortKnopf key={i} i={i} klein={antworten.length > 4} onClick={() => umschalten(i)} gewaehlt={gewaehlt.includes(i)}>
            {a}
          </AntwortKnopf>
        ))}
      </AntwortRaster>
      <Senden onClick={() => senden([...gewaehlt].sort())} disabled={gewaehlt.length === 0} />
    </div>
  )
}

function TextEingabe({ mehrzeilig, maxZeichen, platzhalter, senden }: { mehrzeilig: boolean; maxZeichen: number; platzhalter: string; senden: (a: unknown) => void }) {
  const [text, setText] = useState('')
  const leer = !text.trim()
  return (
    <form
      className="flex flex-1 flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!leer) senden(text.trim())
      }}
    >
      {mehrzeilig ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={maxZeichen} rows={4} placeholder={platzhalter} aria-label="Antwort" className={`${feld} resize-none !text-xl !font-semibold`} />
      ) : (
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={maxZeichen} placeholder={platzhalter} autoComplete="off" aria-label="Antwort" className={feld} />
      )}
      <p className="text-right text-base text-white/60">
        {text.length} / {maxZeichen}
      </p>
      <Senden onClick={() => !leer && senden(text.trim())} disabled={leer} />
    </form>
  )
}

function Sortieren({ elemente, senden }: { elemente: string[]; senden: (a: unknown) => void }) {
  const [liste, setListe] = useState(elemente)
  function tausche(i: number, j: number) {
    setListe((l) => {
      const n = [...l]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-center text-base text-white/80">Mit ↑ ↓ in die richtige Reihenfolge bringen.</p>
      <ol className="grid flex-1 gap-2" style={zeilenRaster(liste.length)}>
        {liste.map((e, i) => (
          <li key={e} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-1 text-xl font-bold leading-tight text-quizzo-navy">
            <span className="w-6 shrink-0 text-quizzo-navy/50">{i + 1}.</span>
            <span className="min-w-0 flex-1 break-words">{e}</span>
            <button onClick={() => tausche(i, i - 1)} disabled={i === 0} aria-label={`${e} nach oben`} className="h-full max-h-12 w-12 shrink-0 rounded-xl bg-quizzo-navy/10 text-2xl disabled:opacity-20">
              ↑
            </button>
            <button onClick={() => tausche(i, i + 1)} disabled={i === liste.length - 1} aria-label={`${e} nach unten`} className="h-full max-h-12 w-12 shrink-0 rounded-xl bg-quizzo-navy/10 text-2xl disabled:opacity-20">
              ↓
            </button>
          </li>
        ))}
      </ol>
      <Senden onClick={() => senden(liste)} />
    </div>
  )
}

function Zuordnen({ links, rechts, senden }: { links: string[]; rechts: string[]; senden: (a: unknown) => void }) {
  const [wahl, setWahl] = useState<string[]>(links.map(() => ''))
  const vollstaendig = wahl.every(Boolean)
  const doppelt = new Set(wahl.filter(Boolean)).size !== wahl.filter(Boolean).length
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-center text-base text-white/80">Wähle zu jedem Begriff das passende Gegenstück.</p>
      <div className="grid flex-1 gap-2" style={zeilenRaster(links.length)}>
        {links.map((l, i) => (
          <label key={l} className="grid grid-cols-2 items-center gap-2 rounded-2xl bg-white/10 px-3 py-1">
            <span className="min-w-0 break-words text-lg font-bold leading-tight">{l}</span>
            <select
              value={wahl[i]}
              onChange={(e) => setWahl((w) => w.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`Gegenstück zu ${l}`}
              className="h-full max-h-12 min-w-0 rounded-xl bg-white px-2 text-lg font-semibold text-quizzo-navy"
            >
              <option value="">– wählen –</option>
              {rechts.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {doppelt && <p className="shrink-0 text-center text-base font-semibold text-quizzo-yellow">Jedes Gegenstück passt nur einmal.</p>}
      <Senden onClick={() => senden(wahl)} disabled={!vollstaendig || doppelt} />
    </div>
  )
}

function Regler({ min, max, schritt, einheit, senden }: { min: number; max: number; schritt: number; einheit: string; senden: (a: unknown) => void }) {
  const mitte = min + Math.round((max - min) / 2 / schritt) * schritt
  const [wert, setWert] = useState(mitte)
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
      <p className="text-center text-5xl font-black text-quizzo-yellow tabular-nums" aria-live="polite">
        {zahl(wert)}
        {einheit && <span className="ml-2 text-3xl text-white/80">{einheit}</span>}
      </p>
      <input type="range" min={min} max={max} step={schritt} value={wert} onChange={(e) => setWert(Number(e.target.value))} aria-label="Deine Schätzung" className="h-10 w-full accent-quizzo-yellow" />
      <div className="flex justify-between text-lg text-white/70">
        <span>{zahl(min)}</span>
        <span>{zahl(max)}</span>
      </div>
      <div className="flex justify-center gap-3">
        <button onClick={() => setWert((w) => Math.max(min, +(w - schritt).toFixed(10)))} className="h-14 w-20 rounded-2xl bg-white/15 text-3xl font-black" aria-label="kleiner">
          −
        </button>
        <button onClick={() => setWert((w) => Math.min(max, +(w + schritt).toFixed(10)))} className="h-14 w-20 rounded-2xl bg-white/15 text-3xl font-black" aria-label="größer">
          +
        </button>
      </div>
      <Senden onClick={() => senden(wert)} />
    </div>
  )
}

/** Kategorisieren: zu jedem Begriff die Gruppe antippen (Buchstabe + Farbe wie in der Legende) */
function Kategorisieren({ kategorien, begriffe, senden }: { kategorien: string[]; begriffe: string[]; senden: (a: unknown) => void }) {
  const [wahl, setWahl] = useState<Record<string, number>>({})
  const fertig = begriffe.every((b) => wahl[b] !== undefined)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ul className="flex shrink-0 flex-wrap justify-center gap-2" aria-label="Gruppen">
        {kategorien.map((k, i) => (
          <li key={k} className={`flex items-center gap-2 rounded-xl px-3 py-1 text-lg font-bold text-white ${ANTWORT_STIL[i].farbe}`}>
            <span className="font-black">{ANTWORT_STIL[i].buchstabe}</span> {k}
          </li>
        ))}
      </ul>
      <div className="grid flex-1 gap-2" style={zeilenRaster(begriffe.length)}>
        {begriffe.map((b) => (
          <div key={b} className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-1">
            <span className="min-w-0 flex-1 break-words text-lg font-bold leading-tight">{b}</span>
            {kategorien.map((k, i) => {
              const gewaehlt = wahl[b] === i
              return (
                <button
                  key={k}
                  onClick={() => setWahl((w) => ({ ...w, [b]: i }))}
                  aria-pressed={gewaehlt}
                  aria-label={`${b}: ${k}`}
                  className={`h-11 w-11 shrink-0 rounded-xl text-xl font-black text-white transition ${ANTWORT_STIL[i].farbe} ${
                    gewaehlt ? 'ring-4 ring-white' : wahl[b] !== undefined ? 'opacity-35' : ''
                  }`}
                >
                  {ANTWORT_STIL[i].buchstabe}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <Senden onClick={() => senden(wahl)} disabled={!fertig} />
    </div>
  )
}

/** Lückentext: Eingabefelder oder Auswahllisten mitten im Text */
function Lueckentext({ teile, optionen, maxZeichen, senden }: { teile: string[]; optionen: string[] | null; maxZeichen: number; senden: (a: unknown) => void }) {
  const n = Math.max(0, teile.length - 1)
  const [werte, setWerte] = useState<string[]>(() => Array.from({ length: n }, () => ''))
  const setze = (i: number, w: string) => setWerte((alt) => alt.map((x, j) => (j === i ? w : x)))
  const lueckenFeld = 'mx-1 my-1 inline-block min-w-0 rounded-lg bg-white px-2 py-1 align-middle text-xl font-bold text-quizzo-navy focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60'
  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        senden(werte.map((w) => w.trim()))
      }}
    >
      <p className="flex-1 rounded-2xl bg-white/10 px-4 py-3 text-xl leading-loose">
        {teile.map((t, i) => (
          <span key={i}>
            <span className="whitespace-pre-line">{t}</span>
            {i < n &&
              (optionen ? (
                <select value={werte[i]} onChange={(e) => setze(i, e.target.value)} aria-label={`Lücke ${i + 1}`} className={`${lueckenFeld} max-w-[12rem]`}>
                  <option value="">– {i + 1} –</option>
                  {optionen.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={werte[i]}
                  onChange={(e) => setze(i, e.target.value)}
                  maxLength={maxZeichen}
                  autoComplete="off"
                  autoCapitalize="off"
                  placeholder={String(i + 1)}
                  aria-label={`Lücke ${i + 1}`}
                  className={`${lueckenFeld} w-32 placeholder:font-normal placeholder:text-slate-400`}
                />
              ))}
          </span>
        ))}
      </p>
      <Senden onClick={() => senden(werte.map((w) => w.trim()))} disabled={werte.every((w) => !w.trim())} />
    </form>
  )
}

/** Hotspot: auf die richtige Stelle im Bild tippen, dann senden */
function Hotspot({ bild, beschreibung, senden }: { bild: string; beschreibung?: string | null; senden: (a: unknown) => void }) {
  const [punkt, setPunkt] = useState<Punkt | null>(null)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-center text-base text-white/80">{punkt ? 'Du kannst noch umentscheiden – oder senden.' : 'Tippe auf die richtige Stelle im Bild.'}</p>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <HotspotBild url={bild} beschreibung={beschreibung} tippen={setPunkt} marker={punkt} />
      </div>
      <Senden onClick={() => punkt && senden(punkt)} disabled={!punkt} />
    </div>
  )
}

/** Wie viele Teile richtig waren (Zuordnung, Kategorisieren, Lückentext) – sonst null */
export function teilrichtigText(frage: SchuelerFrage, anteil: number): string | null {
  const a = frage.ansicht
  const [n, was] =
    frage.typ === 'zuordnung' ? [a.links?.length ?? 0, 'Paaren'] : frage.typ === 'kategorien' ? [a.begriffe?.length ?? 0, 'Begriffen'] : frage.typ === 'lueckentext' ? [a.luecken ?? 0, 'Lücken'] : [0, '']
  if (!n || anteil >= 1) return null
  return `${Math.round(anteil * n)} von ${n} ${was} richtig`
}

/** Lösung als lesbarer Text für die Ergebnis-Anzeige auf dem Handy */
export function loesungText(frage: SchuelerFrage, loesung: unknown): ReactNode {
  if (loesung == null) return null
  switch (frage.typ) {
    case 'auswahl':
      return (loesung as number[]).map((i) => frage.ansicht.antworten?.[i]).join(', ')
    case 'wahrfalsch':
      return loesung ? WAHR_STIL.text : FALSCH_STIL.text
    case 'freitext':
      return (loesung as string[]).join(' / ')
    case 'reihenfolge':
      return (
        <ol className="mt-1 list-decimal pl-6 text-left">
          {(loesung as string[]).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ol>
      )
    case 'zuordnung':
      return (
        <ul className="mt-1 text-left">
          {(loesung as { links: string; rechts: string }[]).map((p) => (
            <li key={p.links}>
              {p.links} ⇄ {p.rechts}
            </li>
          ))}
        </ul>
      )
    case 'schieberegler': {
      const l = loesung as { richtig: number; einheit?: string | null }
      return `${zahl(l.richtig)}${l.einheit ? ' ' + l.einheit : ''}`
    }
    case 'kategorien': {
      const l = loesung as { kategorien: string[]; begriffe: { text: string; kategorie: number }[] }
      return (
        <ul className="mt-1 text-left">
          {l.kategorien.map((k, i) => (
            <li key={k}>
              {k}: <span className="font-normal">{l.begriffe.filter((b) => b.kategorie === i).map((b) => b.text).join(', ')}</span>
            </li>
          ))}
        </ul>
      )
    }
    case 'lueckentext': {
      const l = loesung as string[][]
      const teile = frage.ansicht.teile ?? []
      return (
        <span className="mt-1 block text-left font-normal">
          {teile.map((t, i) => (
            <span key={i}>
              {t}
              {i < l.length && <b className="rounded bg-white/20 px-1">{l[i][0]}</b>}
            </span>
          ))}
        </span>
      )
    }
    case 'hotspot':
      return frage.ansicht.bild ? (
        <span className="mt-2 block">
          <HotspotBild url={frage.ansicht.bild} beschreibung={frage.ansicht.beschreibung} hoehe="max-h-[30dvh]" ziel={loesung as Ziel} zielBeschriftung="richtige Stelle" />
        </span>
      ) : null
    default:
      return null
  }
}

/** Ergebnis nach dem Auflösen */
export function HandyAuswertung({ z }: { z: SchuelerZustand }) {
  const m = z.meine_antwort
  const frage = z.frage
  const bewertet = frage ? FRAGETYPEN[frage.typ].bewertet : false
  const anteil = m?.anteil ?? 0

  let titel: string
  let farbe: string
  if (!m) {
    titel = 'Keine Antwort'
    farbe = 'bg-white/10'
  } else if (!bewertet) {
    titel = 'Danke für deine Antwort!'
    farbe = 'bg-quizzo-navy-light'
  } else if (anteil >= 1) {
    titel = 'Richtig!'
    farbe = 'bg-green-600'
  } else if (anteil > 0) {
    titel = frage?.typ === 'schieberegler' ? 'Knapp daneben!' : 'Teilweise richtig'
    farbe = 'bg-amber-600'
  } else {
    titel = 'Leider falsch'
    farbe = 'bg-red-600'
  }
  const loesung = frage ? loesungText(frage, z.loesung) : null
  const eigenesTeam = z.teams?.find((t) => t.team === z.team)

  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl px-5 py-6 text-center ${farbe}`}>
      <p className="text-5xl font-black">{titel}</p>
      {bewertet && m && (m.punkte ?? 0) > 0 && <p className="text-4xl font-black">+{m.punkte}</p>}
      {frage && m && teilrichtigText(frage, anteil) && <p className="text-xl">{teilrichtigText(frage, anteil)}</p>}
      {bewertet && loesung && anteil < 1 && (
        <div className="text-xl">
          Richtig war: <b>{loesung}</b>
        </div>
      )}
      {bewertet && z.modus === 'challenge' && z.klasse ? (
        <div className="mt-4 w-full rounded-2xl bg-black/20 px-4 py-3">
          <KlassenBalken klasse={z.klasse} />
        </div>
      ) : bewertet && eigenesTeam ? (
        <p className="mt-4 rounded-2xl bg-black/20 px-4 py-2 text-2xl font-bold">
          {team(z.team)!.zeichen} {teamName(z.team)}: Platz {eigenesTeam.platz} von {z.teams!.length}
          <span className="block text-lg font-semibold">Du: {z.punkte} Punkte</span>
        </p>
      ) : (
        bewertet && (
          <p className="mt-4 text-2xl font-bold">
            {z.punkte} Punkte · Platz {z.platz} von {z.anzahl_spieler}
          </p>
        )
      )}
    </div>
  )
}
