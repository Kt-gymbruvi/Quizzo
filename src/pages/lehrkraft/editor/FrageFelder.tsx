import { useRef, useState, type ReactNode } from 'react'
import { ANTWORT_STIL, FALSCH_STIL, WAHR_STIL } from '../../../lib/antwortStil.ts'
import { GRENZEN, MAX_ABLENKER, MAX_ANTWORTEN, MAX_BEGRIFFE, MAX_KATEGORIEN, lueckenAus, type Frage, type Inhalte } from '../../../lib/fragetypen.ts'
import { DATEI_REGELN, ladeHoch } from '../../../lib/medien.ts'
import { fehlerText } from '../../../lib/supabase.ts'
import { HotspotBild } from '../../../spiel/HotspotBild.tsx'

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

export function FrageFelder({
  frage,
  nr,
  setzeInhalt,
  hochgeladen = () => {},
}: {
  frage: Frage
  nr: number
  setzeInhalt: (i: Frage['inhalt']) => void
  /** meldet neu hochgeladene Dateien (zum späteren Aufräumen) */
  hochgeladen?: (pfad: string) => void
}) {
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
    case 'kategorien':
      return <KategorienFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'lueckentext':
      return <LueckentextFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} />
    case 'hotspot':
      return <HotspotFelder nr={nr} inhalt={frage.inhalt} setze={setzeInhalt} hochgeladen={hochgeladen} />
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

function KategorienFelder({ nr, inhalt, setze }: Props<'kategorien'>) {
  const { kategorien, begriffe } = inhalt
  function entferneGruppe(i: number) {
    // Begriffe dieser Gruppe kommen in die erste Gruppe, die Nummern dahinter rücken auf
    setze({
      kategorien: kategorien.filter((_, j) => j !== i),
      begriffe: begriffe.map((b) => ({ ...b, kategorie: b.kategorie === i ? 0 : b.kategorie > i ? b.kategorie - 1 : b.kategorie })),
    })
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-white/70">Lege 2–{MAX_KATEGORIEN} Gruppen an und ordne jedem Begriff seine Gruppe zu. Schüler bekommen die Begriffe gemischt; jeder richtig einsortierte Begriff gibt Teilpunkte.</p>
      <div className="grid gap-2 md:grid-cols-2">
        {kategorien.map((k, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl font-black text-white ${ANTWORT_STIL[i].farbe}`}>{ANTWORT_STIL[i].buchstabe}</span>
            <input
              value={k}
              onChange={(e) => setze({ kategorien: ersetze(kategorien, i, e.target.value), begriffe })}
              maxLength={GRENZEN.kategorie}
              placeholder={`Gruppe ${ANTWORT_STIL[i].buchstabe}`}
              aria-label={`Frage ${nr} Gruppe ${ANTWORT_STIL[i].buchstabe}`}
              className={`${feld} flex-1`}
            />
            <button type="button" className={kleinerKnopf} onClick={() => entferneGruppe(i)} disabled={kategorien.length <= 2} aria-label={`Gruppe ${ANTWORT_STIL[i].buchstabe} entfernen`}>
              ×
            </button>
          </div>
        ))}
      </div>
      {kategorien.length < MAX_KATEGORIEN && (
        <button type="button" className={hinzuKnopf} onClick={() => setze({ kategorien: [...kategorien, ''], begriffe })}>
          + Gruppe
        </button>
      )}
      <div className="flex flex-col gap-2">
        {begriffe.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={b.text}
              onChange={(e) => setze({ kategorien, begriffe: ersetze(begriffe, i, { ...b, text: e.target.value }) })}
              maxLength={GRENZEN.begriff}
              placeholder={`Begriff ${i + 1}`}
              aria-label={`Frage ${nr} Begriff ${i + 1}`}
              className={`${feld} min-w-48 flex-1`}
            />
            <div className="flex gap-1" role="group" aria-label={`Gruppe für Begriff ${i + 1}`}>
              {kategorien.map((k, g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setze({ kategorien, begriffe: ersetze(begriffe, i, { ...b, kategorie: g }) })}
                  aria-pressed={b.kategorie === g}
                  aria-label={`Begriff ${i + 1} gehört zu ${k || 'Gruppe ' + ANTWORT_STIL[g].buchstabe}`}
                  title={k}
                  className={`h-11 w-11 rounded-xl text-xl font-black text-white ${ANTWORT_STIL[g].farbe} ${b.kategorie === g ? 'ring-4 ring-white' : 'opacity-30'}`}
                >
                  {ANTWORT_STIL[g].buchstabe}
                </button>
              ))}
            </div>
            <button type="button" className={kleinerKnopf} onClick={() => setze({ kategorien, begriffe: begriffe.filter((_, j) => j !== i) })} disabled={begriffe.length <= 2} aria-label={`Begriff ${i + 1} entfernen`}>
              ×
            </button>
          </div>
        ))}
        {begriffe.length < MAX_BEGRIFFE && (
          <button type="button" className={hinzuKnopf} onClick={() => setze({ kategorien, begriffe: [...begriffe, { text: '', kategorie: 0 }] })}>
            + Begriff
          </button>
        )}
      </div>
    </div>
  )
}

function LueckentextFelder({ nr, inhalt, setze }: Props<'lueckentext'>) {
  const { luecken, klammerFehler } = lueckenAus(inhalt.lueckentext)
  const ablenker = inhalt.ablenker ?? []
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-white/70">
        Schreibe den Text und setze jede Lücke in eckige Klammern: „Die [Sonne] geht im [Osten|O] auf.“ Mit | trennst du weitere erlaubte Schreibweisen. Jede richtige Lücke gibt Teilpunkte.
      </p>
      <textarea
        value={inhalt.lueckentext}
        onChange={(e) => setze({ ...inhalt, lueckentext: e.target.value })}
        maxLength={GRENZEN.lueckentext}
        rows={4}
        placeholder="Die [Sonne] geht im [Osten] auf."
        aria-label={`Frage ${nr} Lückentext`}
        className={`${feld} resize-y`}
      />
      <p className={`text-base ${klammerFehler ? 'text-red-300' : 'text-white/70'}`} aria-live="polite">
        {klammerFehler ? 'Eine eckige Klammer ist nicht geschlossen.' : luecken.length === 0 ? 'Noch keine Lücke markiert.' : `${luecken.length} ${luecken.length === 1 ? 'Lücke' : 'Lücken'}: ${luecken.map((l) => l[0] || '…').join(', ')}`}
      </p>
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={`Frage ${nr}: Wie füllen Schüler die Lücken?`}>
        {(
          [
            ['eingabe', '⌨ Eintippen'],
            ['auswahl', '☰ Aus Liste wählen'],
          ] as const
        ).map(([wert, text]) => (
          <button
            key={wert}
            type="button"
            role="radio"
            aria-checked={inhalt.modus === wert}
            onClick={() => setze({ ...inhalt, modus: wert })}
            className={`rounded-xl px-4 py-2 text-lg font-bold ring-2 ${inhalt.modus === wert ? 'bg-quizzo-yellow text-quizzo-navy ring-quizzo-yellow' : 'ring-white/20 hover:ring-white/50'}`}
          >
            {text}
          </button>
        ))}
      </div>
      {inhalt.modus === 'auswahl' && (
        <div className="flex flex-col gap-2">
          <p className="text-base text-white/70">In der Liste stehen alle Lösungen. Zusätzlich falsche Wörter (optional, bis {MAX_ABLENKER}):</p>
          <TextListe nr={nr} werte={ablenker} setze={(a) => setze({ ...inhalt, ablenker: a })} min={0} max={MAX_ABLENKER} maxLaenge={GRENZEN.luecke} bezeichnung="Falsches Wort" hinzuText="+ falsches Wort" />
        </div>
      )}
    </div>
  )
}

function HotspotFelder({ nr, inhalt, setze, hochgeladen }: Props<'hotspot'> & { hochgeladen: (pfad: string) => void }) {
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const dateiWahl = useRef<HTMLInputElement>(null)
  const { bild, ziel } = inhalt

  async function dateiGewaehlt(datei: File | undefined) {
    if (!datei) return
    setLaedt(true)
    setFehler(null)
    try {
      const m = await ladeHoch(datei, 'bild')
      if (m.art !== 'bild') return
      if (m.pfad) hochgeladen(m.pfad)
      setze({ bild: { url: m.url, ...(m.pfad ? { pfad: m.pfad } : {}), ...(bild.beschreibung ? { beschreibung: bild.beschreibung } : {}) }, ziel })
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaedt(false)
      if (dateiWahl.current) dateiWahl.current.value = ''
    }
  }

  const regler = (name: string, wert: number, setzeWert: (n: number) => void) => (
    <label className="flex items-center gap-3 text-base font-semibold">
      <span className="w-16">{name}</span>
      <input type="range" min={2} max={100} step={1} value={wert} onChange={(e) => setzeWert(Number(e.target.value))} aria-label={`Frage ${nr} Zielbereich ${name}`} className="w-48 accent-quizzo-yellow" />
      <span className="w-14 tabular-nums text-white/70">{Math.round(wert)} %</span>
    </label>
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-white/70">
        Lade ein Bild hoch (z. B. Karte, Zellbild, Diagramm) und tippe darauf, um die richtige Stelle festzulegen. Das Bild erscheint am Beamer und auf den Handys.
      </p>
      <input ref={dateiWahl} type="file" hidden accept={DATEI_REGELN.bild.typen.join(',')} onChange={(e) => dateiGewaehlt(e.target.files?.[0])} aria-label={`Bild für Frage ${nr}`} data-testid={`hotspot-datei-${nr}`} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={hinzuKnopf} disabled={laedt} onClick={() => dateiWahl.current?.click()}>
          {laedt ? 'Lädt hoch …' : bild.url ? '🖼 Anderes Bild' : '+ 🖼 Bild hochladen'}
        </button>
      </div>
      {fehler && <p className="text-lg font-semibold text-red-300">{fehler}</p>}
      {bild.url && (
        <>
          <div className="rounded-2xl bg-black/20 p-3">
            <HotspotBild url={bild.url} beschreibung={bild.beschreibung} hoehe="max-h-[28rem]" ziel={ziel} tippen={(p) => setze({ bild, ziel: { ...ziel, x: p.x, y: p.y } })} />
          </div>
          <p className="text-base text-white/70">Grün = richtige Stelle. Ins Bild tippen verschiebt sie, mit den Reglern änderst du die Größe.</p>
          <div className="flex flex-wrap gap-6">
            {regler('Breite', ziel.b, (b) => setze({ bild, ziel: { ...ziel, b } }))}
            {regler('Höhe', ziel.h, (h) => setze({ bild, ziel: { ...ziel, h } }))}
          </div>
          <input
            value={bild.beschreibung ?? ''}
            onChange={(e) => setze({ bild: { ...bild, beschreibung: e.target.value }, ziel })}
            maxLength={GRENZEN.beschreibung}
            placeholder="Bildbeschreibung für Screenreader (optional)"
            aria-label={`Frage ${nr} Bildbeschreibung`}
            className={feld}
          />
        </>
      )}
    </div>
  )
}
