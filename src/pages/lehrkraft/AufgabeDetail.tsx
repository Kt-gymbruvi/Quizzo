import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Knopf, LehrkraftKopf, Meldung } from '../../components.tsx'
import {
  MODUS_INFO,
  aufgabenLink,
  antwortAlsText,
  ergebnisCsv,
  gibCodeFrei,
  hoechstpunkte,
  ladeErgebnisse,
  loescheAufgabe,
  schliesseAufgabe,
  type AufgabeErgebnis,
  type AufgabeTeilnehmer,
} from '../../lib/aufgaben.ts'
import { FRAGETYPEN } from '../../lib/fragetypen.ts'
import { useRegelmaessig } from '../../lib/spiel.ts'
import { fehlerText } from '../../lib/supabase.ts'

// Lehrkraft: eine verteilte Aufgabe (Selbstlernen, Hausaufgabe, Prüfung) – Code teilen, Ergebnisse ansehen

const datum = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const tag = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' })
const prozent = (x: number) => `${Math.round(x * 100)} %`

function herunterladen(name: string, inhalt: string, typ: string) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function AufgabeDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [e, setE] = useState<AufgabeErgebnis | null | undefined>(undefined)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(() => {
    ladeErgebnisse(id)
      .then((x) => {
        setE(x)
        setFehler(null)
      })
      .catch((err) => setFehler(fehlerText(err)))
  }, [id])
  useRegelmaessig(laden, 20_000)

  async function aktion(fn: () => Promise<void>) {
    try {
      await fn()
      laden()
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  async function loeschen() {
    if (!e || !window.confirm(`Aufgabe „${e.titel}“ samt allen Ergebnissen jetzt löschen? Das kann nicht rückgängig gemacht werden.`)) return
    try {
      await loescheAufgabe(e.id)
      navigate('/leiten', { state: { hinweis: `Die Aufgabe „${e.titel}“ wurde gelöscht.` } })
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  const kopf = (
    <LehrkraftKopf
      links={
        <Link to="/leiten" className="text-xl text-white/80 hover:text-quizzo-yellow print:hidden">
          ← Meine Quizze
        </Link>
      }
    />
  )

  if (e === undefined || e === null) {
    return (
      <main className="flex min-h-dvh flex-col gap-8 px-8 py-6 lg:px-12">
        {kopf}
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {e === null && <p className="text-2xl">Diese Aufgabe gibt es nicht (mehr). Vielleicht wurde sie gelöscht oder ist abgelaufen.</p>}
        {e === undefined && !fehler && <p className="text-2xl text-white/70">Wird geladen …</p>}
      </main>
    )
  }

  const info = MODUS_INFO[e.modus]
  const max = e.fragen.reduce((s, f) => s + hoechstpunkte(f), 0)

  return (
    <main className="flex min-h-dvh flex-col gap-8 px-8 py-6 lg:px-12 print:bg-white print:p-0 print:text-black">
      <div className="print:hidden">{kopf}</div>

      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <p className="text-2xl font-bold text-quizzo-yellow">
            <span aria-hidden="true">{info.symbol}</span> {info.name} ·{' '}
            <span className={e.offen ? 'text-green-400' : 'text-white/70'}>{e.offen ? 'läuft' : 'beendet'}</span>
          </p>
          <h2 className="text-5xl font-extrabold break-words">{e.titel}</h2>
          <p className="mt-2 text-xl text-white/75">
            {e.frist ? `${e.modus === 'pruefung' ? 'Ende' : 'Abgabe bis'}: ${datum.format(new Date(e.frist))}` : 'Ohne Frist – läuft, bis du sie beendest'}
          </p>
          <p className="text-lg text-white/60">
            🔒 {e.loeschen_am ? `Alle Ergebnisse werden am ${tag.format(new Date(e.loeschen_am))} automatisch gelöscht.` : info.datenschutz}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Knopf art="leise" onClick={laden}>
            ↻ Aktualisieren
          </Knopf>
          {e.modus !== 'selbstlernen' && (
            <Knopf art="leise" onClick={() => herunterladen(`${e.titel} – Ergebnisse.csv`, ergebnisCsv(e), 'text/csv;charset=utf-8')}>
              ⤓ Ergebnisse (CSV)
            </Knopf>
          )}
          {e.offen && (
            <Knopf
              art="rahmen"
              onClick={() => window.confirm('Aufgabe jetzt beenden? Danach kann niemand mehr antworten.') && aktion(() => schliesseAufgabe(e.id))}
            >
              Beenden
            </Knopf>
          )}
          <Knopf art="gefahr" onClick={loeschen}>
            Löschen
          </Knopf>
        </div>
      </div>

      {fehler && <Meldung art="fehler">{fehler}</Meldung>}

      {e.offen && <Teilen code={e.code} modus={e.modus} />}

      {e.modus === 'selbstlernen' ? (
        <Statistik e={e} />
      ) : (
        <>
          <Uebersicht e={e} max={max} />
          {e.modus === 'pruefung' && <CodeListe e={e} freigeben={(t) => aktion(() => gibCodeFrei(t.id))} />}
        </>
      )}
    </main>
  )
}

function Teilen({ code, modus }: { code: string; modus: AufgabeErgebnis['modus'] }) {
  const link = aufgabenLink(code)
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#0b1f4d', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [link])
  const adresse = `${window.location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, '')
  return (
    <section className="flex flex-wrap items-center gap-8 rounded-3xl bg-white p-6 text-quizzo-navy print:hidden">
      {qr && <img src={qr} alt="QR-Code zur Aufgabe" className="h-48 w-48 shrink-0" />}
      <div className="flex min-w-72 flex-1 flex-col gap-2">
        <p className="text-2xl">
          Link oder QR-Code öffnen – oder auf <b>{adresse}</b> unter <b>Mitspielen → Aufgaben-Code</b> eingeben:
        </p>
        <p className="text-7xl font-black tracking-[0.15em]" aria-label="Aufgaben-Code">
          {code}
        </p>
        <p className="text-lg break-all text-quizzo-navy/70">{link}</p>
        {modus === 'pruefung' && <p className="text-lg font-semibold">Zusätzlich braucht jede Person ihren Prüfungscode (Liste unten).</p>}
        {modus === 'hausaufgabe' && <p className="text-lg font-semibold">Den Link kannst du z. B. im Klassen-Messenger oder auf der Lernplattform teilen.</p>}
      </div>
    </section>
  )
}

/** Selbstlernen: anonyme Zahlen pro Frage */
function Statistik({ e }: { e: AufgabeErgebnis }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-3xl font-extrabold">Wie gut klappt welche Frage? (anonym)</h3>
      <table className="w-full text-left text-xl">
        <thead className="text-lg text-white/60">
          <tr>
            <th className="py-2 pr-4">Frage</th>
            <th className="py-2 pr-4">Antworten</th>
            <th className="w-1/3 py-2">richtig</th>
          </tr>
        </thead>
        <tbody>
          {e.fragen.map((f, n) => {
            const s = e.statistik.find((x) => x.frage_nr === n)
            const bewertet = FRAGETYPEN[f.typ].bewertet
            const anteil = s && s.versuche ? s.anteil_summe / s.versuche : 0
            return (
              <tr key={n} className="border-t border-white/10">
                <td className="py-3 pr-4">
                  <span className="text-white/50">{n + 1}.</span> {f.text}
                </td>
                <td className="py-3 pr-4 tabular-nums">{f.typ === 'folie' ? '–' : (s?.versuche ?? 0)}</td>
                <td className="py-3">
                  {bewertet && s?.versuche ? <Balken anteil={anteil} /> : <span className="text-white/50">–</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Balken({ anteil }: { anteil: number }) {
  const farbe = anteil >= 0.75 ? 'bg-green-500' : anteil >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <span className="flex items-center gap-3">
      <span className="h-5 flex-1 overflow-hidden rounded-full bg-white/10">
        <span className={`block h-full ${farbe}`} style={{ width: `${Math.round(anteil * 100)}%` }} />
      </span>
      <span className="w-16 text-right tabular-nums">{prozent(anteil)}</span>
    </span>
  )
}

function zeichen(anteil: number | undefined) {
  if (anteil === undefined) return { z: '–', titel: 'nicht beantwortet', stil: 'text-white/30' }
  if (anteil >= 1) return { z: '✓', titel: 'richtig', stil: 'text-green-400' }
  if (anteil > 0) return { z: '◐', titel: 'teilweise richtig', stil: 'text-amber-400' }
  return { z: '✗', titel: 'falsch', stil: 'text-red-400' }
}

/** Hausaufgabe/Prüfung: Tabelle Teilnehmer × Fragen */
function Uebersicht({ e, max }: { e: AufgabeErgebnis; max: number }) {
  const [offen, setOffen] = useState<string | null>(null)
  const teilnehmer = e.teilnehmer.filter((t) => t.begonnen_am)
  const name = e.modus === 'pruefung' ? 'Code' : 'Spitzname'

  if (!teilnehmer.length) {
    return <p className="text-2xl text-white/70 print:hidden">Noch hat niemand angefangen.</p>
  }
  return (
    <section className="flex flex-col gap-4 print:hidden">
      <h3 className="text-3xl font-extrabold">
        Ergebnisse · {teilnehmer.filter((t) => t.abgegeben_am).length} von {teilnehmer.length} abgegeben
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xl">
          <thead className="text-lg text-white/60">
            <tr>
              <th className="py-2 pr-4">{name}</th>
              <th className="py-2 pr-4">Punkte</th>
              {e.fragen.map((f, n) => (
                <th key={n} className="px-1 py-2 text-center" title={f.text}>
                  {n + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teilnehmer.map((t) => (
              <Fragment key={t.id}>
                <tr className="cursor-pointer border-t border-white/10 hover:bg-white/5" onClick={() => setOffen(offen === t.id ? null : t.id)}>
                  <td className="py-2 pr-4 font-bold">
                    <button className="text-left font-mono" aria-expanded={offen === t.id}>
                      {t.code ?? t.spitzname}
                    </button>
                    {!t.abgegeben_am && <span className="ml-2 text-base font-normal text-white/50">in Arbeit</span>}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {t.punkte} / {max} <span className="text-white/50">({max ? prozent(t.punkte / max) : '–'})</span>
                  </td>
                  {e.fragen.map((f, n) => {
                    if (!FRAGETYPEN[f.typ].bewertet) {
                      const beantwortet = t.antworten.some((a) => a.frage_nr === n)
                      return (
                        <td key={n} className="px-1 py-2 text-center text-white/50" title={beantwortet ? 'beantwortet' : 'ohne Antwort'}>
                          {f.typ === 'folie' ? '' : beantwortet ? '•' : '–'}
                        </td>
                      )
                    }
                    const z = zeichen(t.antworten.find((a) => a.frage_nr === n)?.anteil)
                    return (
                      <td key={n} className={`px-1 py-2 text-center text-2xl font-black ${z.stil}`} title={z.titel}>
                        {z.z}
                      </td>
                    )
                  })}
                </tr>
                {offen === t.id && (
                  <tr>
                    <td colSpan={2 + e.fragen.length} className="pb-4">
                      <Antworten e={e} t={t} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot className="text-lg text-white/70">
            <tr className="border-t-2 border-white/20">
              <td className="py-2 pr-4" colSpan={2}>
                Anteil richtig je Frage
              </td>
              {e.fragen.map((f, n) => {
                const a = teilnehmer.flatMap((t) => t.antworten.filter((x) => x.frage_nr === n))
                return (
                  <td key={n} className="px-1 py-2 text-center tabular-nums">
                    {FRAGETYPEN[f.typ].bewertet && a.length ? prozent(a.reduce((s, x) => s + x.anteil, 0) / a.length) : ''}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-lg text-white/60">Tipp: Zeile anklicken, um alle Antworten zu sehen (auch Freitext und offene Fragen).</p>
    </section>
  )
}

function Antworten({ e, t }: { e: AufgabeErgebnis; t: AufgabeTeilnehmer }) {
  return (
    <ol className="flex flex-col gap-2 rounded-2xl bg-quizzo-navy-light/70 p-4 text-lg">
      {e.fragen.map((f, n) => {
        if (f.typ === 'folie') return null
        const a = t.antworten.find((x) => x.frage_nr === n)
        const z = FRAGETYPEN[f.typ].bewertet ? zeichen(a?.anteil) : null
        return (
          <li key={n} className="grid grid-cols-[2rem_1fr] gap-2">
            <span className="text-white/50">{n + 1}.</span>
            <span>
              <span className="text-white/70">{f.text}</span>
              <br />
              {a ? (
                <>
                  {z && <b className={z.stil}>{z.z} </b>}
                  <span className="font-semibold whitespace-pre-wrap">{antwortAlsText(f, a.antwort)}</span>
                  {a.punkte > 0 && <span className="text-white/60"> · {a.punkte} Punkte</span>}
                </>
              ) : (
                <span className="text-white/40">keine Antwort</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Prüfung: Codes zum Ausdrucken (mit leerer Spalte für Namen) und zum Freigeben */
function CodeListe({ e, freigeben }: { e: AufgabeErgebnis; freigeben: (t: AufgabeTeilnehmer) => void }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <h3 className="text-3xl font-extrabold">Prüfungscodes</h3>
        <Knopf art="leise" onClick={() => window.print()}>
          🖨 Codes drucken
        </Knopf>
      </div>
      <p className="text-lg text-white/70 print:hidden">
        Schreib auf dem Ausdruck zu jedem Code einen Namen und schneide die Codes aus. Die Zuordnung bleibt nur bei dir – Quizzo kennt keine Namen.
        Hat jemand das Gerät gewechselt, gib den Code mit „Freigeben“ wieder frei; bisherige Antworten bleiben erhalten.
      </p>
      <div className="hidden print:block">
        <h2 className="text-2xl font-bold">
          {e.titel} – Prüfungscodes (Aufgaben-Code {e.code})
        </h2>
        <p className="mb-4 text-sm">Zuordnung nur auf Papier aufbewahren. Ergebnisse werden am {e.loeschen_am ? tag.format(new Date(e.loeschen_am)) : '–'} gelöscht.</p>
      </div>
      <table className="w-full text-left text-xl print:text-base">
        <thead className="text-lg text-white/60 print:text-black">
          <tr>
            <th className="py-2 pr-4">Code</th>
            <th className="py-2 pr-4">Name (nur auf Papier)</th>
            <th className="py-2 pr-4 print:hidden">Stand</th>
            <th className="py-2 print:hidden" />
          </tr>
        </thead>
        <tbody>
          {e.teilnehmer.map((t) => (
            <tr key={t.id} className="border-t border-white/10 print:border-black/40">
              <td className="py-2 pr-4 font-mono text-2xl font-bold print:py-3">{t.code}</td>
              <td className="py-2 pr-4">
                <span className="inline-block w-64 border-b border-dashed border-white/30 print:border-black/60">&nbsp;</span>
              </td>
              <td className="py-2 pr-4 text-lg text-white/70 print:hidden">
                {t.abgegeben_am ? 'abgegeben' : t.begonnen_am ? (t.aktiv ? 'in Arbeit' : 'freigegeben') : 'nicht benutzt'}
              </td>
              <td className="py-2 print:hidden">
                {t.aktiv && !t.abgegeben_am && (
                  <button className="rounded-xl bg-white/10 px-3 py-1 text-base font-semibold hover:bg-white/20" onClick={() => freigeben(t)}>
                    Freigeben
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
