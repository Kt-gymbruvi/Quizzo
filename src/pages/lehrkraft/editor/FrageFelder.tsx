import type { ReactNode } from 'react'
import { ANTWORT_STIL, FALSCH_STIL, WAHR_STIL } from '../../../lib/antwortStil.ts'
import { GRENZEN, MAX_ANTWORTEN, type Frage, type Inhalte } from '../../../lib/fragetypen.ts'

// Typabhängige Eingabefelder im Quiz-Editor

const feld =
  'min-w-0 rounded-xl bg-white px-3 py-3 text-xl text-quizzo-navy placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/60'
const kleinerKnopf = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl font-bold hover:bg-white/20 disabled:opacity-30'
const hinzuKnopf = 'self-start rounded-xl border-2 border-dashed border-white/30 px-4 py-2 text-lg font-semibold text-white/80 hover:border-quizzo-yellow hover:text-quizzo-yellow'

type Props<T extends Frage['typ']> = {
  nr: number
  inhalt: Inhalte[T]
  setze: (inhalt: Inhalte[T]) => void
}

export function FrageFelder({ frage, nr, setzeInhalt }: { frage: Frage; nr: number; setzeInhalt: (i: Frage['inhalt']) => void }) {
  switch (frage.typ) {
    case 'auswahl':
      return <AuswahlFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'umfrage':
      return <UmfrageFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'wahrfalsch':
      return <WahrFalschFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'freitext':
      return <FreitextFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'reihenfolge':
      return <ReihenfolgeFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'zuordnung':
      return <ZuordnungFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'schieberegler':
      return <SchiebereglerFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'folie':
      return <FolieFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'wortwolke':
      return <Hinweis>Schüler tippen ein bis zwei Wörter (bis 25 Zeichen). Häufige Begriffe erscheinen am Beamer größer. Keine Punkte.</Hinweis>
    case 'offen':
      return <Hinweis>Schüler schreiben eine längere Antwort (bis 250 Zeichen). Die Antworten erscheinen am Beamer, einzelne kannst du ausblenden. Keine Punkte.</Hinweis>
  }
}

function Hinweis({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-white/5 px-4 py-3 text-lg text-white/80">{children}</p>
}

function ersetze<T>(liste: T[], i: number, wert: T) {
  return liste.map((x, j) => (j === i ? wert : x))
}

function AuswahlFelder({ nr, inhalt, setze }: Props<'auswahl'>) {
  const { antworten, richtig } = inhalt
  function umschalten(i: number) {
    const neu = richtig.includes(i) ? richtig.filter((r) => r !== i) : [...richtig, i].sort()
    setze({ antworten, richtig: neu })
  }
  function entfernen(i: number) {
    setze({ antworten: antworten.filter((_, j) => j !== i), richtig: richtig.filter((r) => r !== i).map((r) => (r > i ? r - 1 : r)) })
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-white/70">Mit ✓ markierst du die richtigen Antworten – eine oder mehrere.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {antworten.map((a, i) => {
          const istRichtig = richtig.includes(i)
          return (
            <div key={i} className={`flex items-center gap-2 rounded-2xl p-2 ring-3 transition ${istRichtig ? 'bg-green-500/20 ring-green-400' : 'bg-white/5 ring-transparent'}`}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl font-black text-white ${ANTWORT_STIL[i].farbe}`}>{ANTWORT_STIL[i].buchstabe}</span>
              <input
                value={a}
                onChange={(e) => setze({ antworten: ersetze(antworten, i, e.target.value), richtig })}
                placeholder={`Antwort ${ANTWORT_STIL[i].buchstabe}`}
                maxLength={GRENZEN.antwort}
                aria-label={`Frage ${nr} Antwort ${ANTWORT_STIL[i].buchstabe}`}
                className={`${feld} flex-1`}
              />
              <button
                type="button"
                onClick={() => umschalten(i)}
                aria-pressed={istRichtig}
                aria-label={`Frage ${nr}: Antwort ${ANTWORT_STIL[i].buchstabe} ist richtig`}
                title="Als richtig markieren"
                className={`${kleinerKnopf} ${istRichtig ? '!bg-green-500 text-white' : 'text-white/50'}`}
              >
                ✓
              </button>
              <button type="button" onClick={() => entfernen(i)} disabled={antworten.length <= 2} aria-label={`Frage ${nr}: Antwort ${ANTWORT_STIL[i].buchstabe} entfernen`} className={kleinerKnopf}>
                ×
              </button>
            </div>
          )
        })}
      </div>
      {antworten.length < MAX_ANTWORTEN && (
        <button type="button" className={hinzuKnopf} onClick={() => setze({ antworten: [...antworten, ''], richtig })}>
          + Antwort
        </button>
      )}
    </div>
  )
}

function UmfrageFelder({ nr, inhalt, setze }: Props<'umfrage'>) {
  const { antworten } = inhalt
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        {antworten.map((a, i) => (
          <div key={i} className="flex items-center gap-2 rounded-2xl bg-white/5 p-2">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl font-black text-white ${ANTWORT_STIL[i].farbe}`}>{ANTWORT_STIL[i].buchstabe}</span>
            <input
              value={a}
              onChange={(e) => setze({ antworten: ersetze(antworten, i, e.target.value) })}
              placeholder={`Option ${ANTWORT_STIL[i].buchstabe}`}
              maxLength={GRENZEN.antwort}
              aria-label={`Frage ${nr} Option ${ANTWORT_STIL[i].buchstabe}`}
              className={`${feld} flex-1`}
            />
            <button type="button" onClick={() => setze({ antworten: antworten.filter((_, j) => j !== i) })} disabled={antworten.length <= 2} aria-label={`Frage ${nr}: Option ${ANTWORT_STIL[i].buchstabe} entfernen`} className={kleinerKnopf}>
              ×
            </button>
          </div>
        ))}
      </div>
      {antworten.length < MAX_ANTWORTEN && (
        <button type="button" className={hinzuKnopf} onClick={() => setze({ antworten: [...antworten, ''] })}>
          + Option
        </button>
      )}
    </div>
  )
}

function WahrFalschFelder({ nr, inhalt, setze }: Props<'wahrfalsch'>) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-white/70">Ist die Aussage richtig oder falsch?</p>
      <div className="flex gap-3">
        {[true, false].map((wert) => {
          const stil = wert ? WAHR_STIL : FALSCH_STIL
          const aktiv = inhalt.richtig === wert
          return (
            <button
              key={String(wert)}
              type="button"
              onClick={() => setze({ richtig: wert })}
              aria-pressed={aktiv}
              aria-label={`Frage ${nr}: Aussage ist ${stil.text.toLowerCase()}`}
              className={`flex-1 rounded-2xl px-6 py-4 text-2xl font-black text-white transition ${aktiv ? `${stil.farbe} ring-4 ring-white` : 'bg-white/10 text-white/60'}`}
            >
              {aktiv ? '✓ ' : ''}
              {stil.text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TextListe({
  nr,
  werte,
  setze,
  min,
  max,
  maxLaenge,
  bezeichnung,
  hinzuText,
  nummeriert = false,
  verschiebbar = false,
}: {
  nr: number
  werte: string[]
  setze: (w: string[]) => void
  min: number
  max: number
  maxLaenge: number
  bezeichnung: string
  hinzuText: string
  nummeriert?: boolean
  verschiebbar?: boolean
}) {
  function tausche(i: number, j: number) {
    const neu = [...werte]
    ;[neu[i], neu[j]] = [neu[j], neu[i]]
    setze(neu)
  }
  return (
    <div className="flex flex-col gap-2">
      {werte.map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          {nummeriert && <span className="w-8 shrink-0 text-right text-2xl font-black text-quizzo-yellow">{i + 1}.</span>}
          <input
            value={w}
            onChange={(e) => setze(ersetze(werte, i, e.target.value))}
            maxLength={maxLaenge}
            placeholder={`${bezeichnung} ${i + 1}`}
            aria-label={`Frage ${nr} ${bezeichnung} ${i + 1}`}
            className={`${feld} flex-1`}
          />
          {verschiebbar && (
            <>
              <button type="button" className={kleinerKnopf} onClick={() => tausche(i, i - 1)} disabled={i === 0} aria-label={`${bezeichnung} ${i + 1} nach oben`}>
                ↑
              </button>
              <button type="button" className={kleinerKnopf} onClick={() => tausche(i, i + 1)} disabled={i === werte.length - 1} aria-label={`${bezeichnung} ${i + 1} nach unten`}>
                ↓
              </button>
            </>
          )}
          <button type="button" className={kleinerKnopf} onClick={() => setze(werte.filter((_, j) => j !== i))} disabled={werte.length <= min} aria-label={`${bezeichnung} ${i + 1} entfernen`}>
            ×
          </button>
        </div>
      ))}
      {werte.length < max && (
        <button type="button" className={hinzuKnopf} onClick={() => setze([...werte, ''])}>
          {hinzuText}
        </button>
      )}
    </div>
  )
}

function FreitextFelder({ nr, inhalt, setze }: Props<'freitext'>) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-white/70">
        Akzeptierte Lösungen (z. B. „Berlin“ und „BER“). Groß-/Kleinschreibung und doppelte Leerzeichen spielen keine Rolle.
      </p>
      <TextListe nr={nr} werte={inhalt.loesungen} setze={(l) => setze({ loesungen: l })} min={1} max={10} maxLaenge={GRENZEN.loesung} bezeichnung="Lösung" hinzuText="+ weitere Schreibweise" />
    </div>
  )
}

function ReihenfolgeFelder({ nr, inhalt, setze }: Props<'reihenfolge'>) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-white/70">Trage die Elemente in der richtigen Reihenfolge ein. Schüler bekommen sie gemischt.</p>
      <TextListe nr={nr} werte={inhalt.elemente} setze={(e) => setze({ elemente: e })} min={3} max={6} maxLaenge={GRENZEN.element} bezeichnung="Element" hinzuText="+ Element" nummeriert verschiebbar />
    </div>
  )
}

function ZuordnungFelder({ nr, inhalt, setze }: Props<'zuordnung'>) {
  const { paare } = inhalt
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-white/70">Trage zusammengehörige Paare ein. Schüler bekommen die rechte Seite gemischt. Jedes richtige Paar gibt Teilpunkte.</p>
      {paare.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={p.links}
            onChange={(e) => setze({ paare: ersetze(paare, i, { ...p, links: e.target.value }) })}
            maxLength={GRENZEN.paar}
            placeholder={`Begriff ${i + 1}`}
            aria-label={`Frage ${nr} Paar ${i + 1} links`}
            className={`${feld} flex-1`}
          />
          <span className="text-2xl font-black text-quizzo-yellow" aria-hidden="true">
            ⇄
          </span>
          <input
            value={p.rechts}
            onChange={(e) => setze({ paare: ersetze(paare, i, { ...p, rechts: e.target.value }) })}
            maxLength={GRENZEN.paar}
            placeholder={`passt zu ${i + 1}`}
            aria-label={`Frage ${nr} Paar ${i + 1} rechts`}
            className={`${feld} flex-1`}
          />
          <button type="button" className={kleinerKnopf} onClick={() => setze({ paare: paare.filter((_, j) => j !== i) })} disabled={paare.length <= 2} aria-label={`Paar ${i + 1} entfernen`}>
            ×
          </button>
        </div>
      ))}
      {paare.length < 6 && (
        <button type="button" className={hinzuKnopf} onClick={() => setze({ paare: [...paare, { links: '', rechts: '' }] })}>
          + Paar
        </button>
      )}
    </div>
  )
}

function ZahlFeld({ label, wert, setze, nr }: { label: string; wert: number; setze: (n: number) => void; nr: number }) {
  return (
    <label className="flex flex-col gap-1 text-base font-semibold">
      {label}
      <input
        type="number"
        value={Number.isFinite(wert) ? wert : ''}
        onChange={(e) => setze(e.target.value === '' ? NaN : Number(e.target.value))}
        aria-label={`Frage ${nr} ${label}`}
        className={`${feld} w-36`}
      />
    </label>
  )
}

function SchiebereglerFelder({ nr, inhalt, setze }: Props<'schieberegler'>) {
  const s = inhalt
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-white/70">Schüler wählen eine Zahl mit einem Schieberegler. Innerhalb der Toleranz gibt es volle Punkte, danach immer weniger.</p>
      <div className="flex flex-wrap gap-4">
        <ZahlFeld nr={nr} label="Richtige Zahl" wert={s.richtig} setze={(n) => setze({ ...s, richtig: n })} />
        <ZahlFeld nr={nr} label="Minimum" wert={s.min} setze={(n) => setze({ ...s, min: n })} />
        <ZahlFeld nr={nr} label="Maximum" wert={s.max} setze={(n) => setze({ ...s, max: n })} />
        <ZahlFeld nr={nr} label="Schrittweite" wert={s.schritt} setze={(n) => setze({ ...s, schritt: n })} />
        <ZahlFeld nr={nr} label="Toleranz (±)" wert={s.toleranz} setze={(n) => setze({ ...s, toleranz: n })} />
        <label className="flex flex-col gap-1 text-base font-semibold">
          Einheit (optional)
          <input value={s.einheit ?? ''} onChange={(e) => setze({ ...s, einheit: e.target.value })} maxLength={GRENZEN.einheit} placeholder="z. B. km" aria-label={`Frage ${nr} Einheit`} className={`${feld} w-36`} />
        </label>
      </div>
    </div>
  )
}

function FolieFelder({ nr, inhalt, setze }: Props<'folie'>) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-white/70">Die Folie erscheint am Beamer, bis du auf „Weiter“ klickst. Kein Countdown, keine Antworten.</p>
      <textarea
        value={inhalt.text}
        onChange={(e) => setze({ text: e.target.value })}
        maxLength={GRENZEN.folie}
        rows={4}
        placeholder="Text der Folie (optional)"
        aria-label={`Frage ${nr} Folientext`}
        className={`${feld} resize-y`}
      />
    </div>
  )
}
