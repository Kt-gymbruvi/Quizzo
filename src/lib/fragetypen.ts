// Fragetypen von Quizzo: Datenformat, Standardwerte, Prüfung und Bereinigung.
// Das Format entspricht genau dem, was die Datenbank in fragen.inhalt erwartet (siehe 003_fragetypen.sql).

export type Inhalte = {
  auswahl: { antworten: string[]; richtig: number[] }
  wahrfalsch: { richtig: boolean }
  freitext: { loesungen: string[] }
  reihenfolge: { elemente: string[] }
  zuordnung: { paare: { links: string; rechts: string }[] }
  umfrage: { antworten: string[] }
  wortwolke: Record<string, never>
  offen: Record<string, never>
  schieberegler: { min: number; max: number; schritt: number; richtig: number; toleranz: number; einheit?: string }
  folie: { text: string }
}
export type FrageTyp = keyof Inhalte
export type Punkte = 0 | 1 | 2
/** Schwierigkeit (für das Klassen-Duell): 1 leicht, 2 mittel, 3 schwer; ohne Angabe = mittel */
export type Schwierigkeit = 1 | 2 | 3
export const SCHWIERIGKEITEN: { wert: Schwierigkeit; name: string }[] = [
  { wert: 1, name: 'leicht' },
  { wert: 2, name: 'mittel' },
  { wert: 3, name: 'schwer' },
]
const alsSchwierigkeit = (x: unknown): Schwierigkeit | null => {
  const n = typeof x === 'string' ? (SCHWIERIGKEITEN.find((s) => s.name === x.trim().toLowerCase())?.wert ?? Number(x)) : x
  return n === 1 || n === 2 || n === 3 ? n : null
}

/** Bild, Ton oder Video zur Frage (nur am Beamer). Format wie in der Datenbank (medium_gueltig, 004_medien.sql). */
export type Medium =
  | { art: 'bild'; url: string; pfad?: string; beschreibung?: string }
  | { art: 'audio' | 'video'; url: string; pfad?: string; start?: number; ende?: number }
  | { art: 'youtube'; id: string; start?: number; ende?: number }
export type MedienArt = Medium['art']

export type Frage = {
  [T in FrageTyp]: { typ: T; text: string; zeitlimit: number; punkte: Punkte; inhalt: Inhalte[T]; medium?: Medium | null; schwierigkeit?: Schwierigkeit | null }
}[FrageTyp]

export const ZEITLIMITS = [5, 10, 20, 30, 45, 60, 90, 120, 180, 240] as const
export const MAX_ANTWORTEN = 6

type TypInfo = { name: string; beschreibung: string; symbol: string; bewertet: boolean; zeitlimit: number }

export const FRAGETYPEN: Record<FrageTyp, TypInfo> = {
  auswahl: { name: 'Multiple Choice', beschreibung: '2–6 Antworten, eine oder mehrere richtig', symbol: '☑', bewertet: true, zeitlimit: 20 },
  wahrfalsch: { name: 'Richtig/Falsch', beschreibung: 'Eine Aussage bewerten', symbol: '⚖', bewertet: true, zeitlimit: 10 },
  freitext: { name: 'Freitext', beschreibung: 'Antwort eintippen', symbol: '⌨', bewertet: true, zeitlimit: 30 },
  reihenfolge: { name: 'Sortieren', beschreibung: 'In die richtige Reihenfolge bringen', symbol: '⇅', bewertet: true, zeitlimit: 45 },
  zuordnung: { name: 'Zuordnung', beschreibung: 'Passende Paare verbinden', symbol: '⇄', bewertet: true, zeitlimit: 60 },
  schieberegler: { name: 'Schieberegler', beschreibung: 'Zahl schätzen – je näher, desto mehr Punkte', symbol: '⟷', bewertet: true, zeitlimit: 20 },
  umfrage: { name: 'Umfrage', beschreibung: 'Meinung abfragen, ohne Punkte', symbol: '📊', bewertet: false, zeitlimit: 20 },
  wortwolke: { name: 'Wortwolke', beschreibung: 'Kurze Begriffe sammeln, ohne Punkte', symbol: '☁', bewertet: false, zeitlimit: 30 },
  offen: { name: 'Offene Frage', beschreibung: 'Längere Antworten sammeln, ohne Punkte', symbol: '✎', bewertet: false, zeitlimit: 90 },
  folie: { name: 'Präsentationsfolie', beschreibung: 'Information zeigen, ohne Antwort', symbol: '▭', bewertet: false, zeitlimit: 20 },
}
export const TYP_REIHENFOLGE: FrageTyp[] = ['auswahl', 'wahrfalsch', 'freitext', 'reihenfolge', 'zuordnung', 'umfrage', 'wortwolke', 'offen', 'schieberegler', 'folie']

export const GRENZEN = { text: 500, antwort: 120, loesung: 40, element: 80, paar: 60, folie: 1000, einheit: 20 }

export function neuerInhalt<T extends FrageTyp>(typ: T): Inhalte[T] {
  const inhalte: Inhalte = {
    auswahl: { antworten: ['', '', '', ''], richtig: [0] },
    wahrfalsch: { richtig: true },
    freitext: { loesungen: [''] },
    reihenfolge: { elemente: ['', '', ''] },
    zuordnung: { paare: [{ links: '', rechts: '' }, { links: '', rechts: '' }, { links: '', rechts: '' }] },
    umfrage: { antworten: ['', '', ''] },
    wortwolke: {},
    offen: {},
    schieberegler: { min: 0, max: 100, schritt: 1, richtig: 50, toleranz: 0, einheit: '' },
    folie: { text: '' },
  }
  return inhalte[typ]
}

export function neueFrage(typ: FrageTyp = 'auswahl'): Frage {
  const punkte: Punkte = FRAGETYPEN[typ].bewertet ? 1 : 0
  return { typ, text: '', zeitlimit: FRAGETYPEN[typ].zeitlimit, punkte, inhalt: neuerInhalt(typ) } as Frage
}

/** Wechselt den Typ einer Frage und übernimmt dabei so viel wie sinnvoll möglich. */
export function wechsleTyp(f: Frage, typ: FrageTyp): Frage {
  if (f.typ === typ) return f
  const neu = neueFrage(typ)
  neu.text = f.text
  if (f.medium) neu.medium = f.medium
  if (f.schwierigkeit && FRAGETYPEN[typ].bewertet) neu.schwierigkeit = f.schwierigkeit
  const alteTexte =
    f.typ === 'auswahl' || f.typ === 'umfrage' ? f.inhalt.antworten : f.typ === 'reihenfolge' ? f.inhalt.elemente : null
  if (alteTexte && (neu.typ === 'auswahl' || neu.typ === 'umfrage')) {
    neu.inhalt.antworten = [...alteTexte].slice(0, MAX_ANTWORTEN)
    while (neu.inhalt.antworten.length < 2) neu.inhalt.antworten.push('')
  }
  if (alteTexte && neu.typ === 'reihenfolge') {
    neu.inhalt.elemente = [...alteTexte].slice(0, 6)
    while (neu.inhalt.elemente.length < 3) neu.inhalt.elemente.push('')
  }
  if (f.typ === 'auswahl' && neu.typ === 'auswahl') neu.inhalt.richtig = f.inhalt.richtig
  return neu
}

const t = (s: string | undefined) => (s ?? '').trim()
const eindeutig = (liste: string[]) => new Set(liste.map((s) => s.trim().toLowerCase().replace(/\s+/g, ' '))).size === liste.length

/** Entfernt leere Einträge und Leerzeichen; passt Indizes richtiger Antworten an. */
export function bereinigeFrage(f: Frage): Frage {
  const medium = bereinigeMedium(f.medium)
  const schwierigkeit = FRAGETYPEN[f.typ].bewertet ? alsSchwierigkeit(f.schwierigkeit) : null
  const basis = { text: t(f.text), zeitlimit: f.zeitlimit, punkte: FRAGETYPEN[f.typ].bewertet ? f.punkte : 0, ...(medium ? { medium } : {}), ...(schwierigkeit ? { schwierigkeit } : {}) }
  switch (f.typ) {
    case 'auswahl': {
      const antworten: string[] = []
      const richtig: number[] = []
      f.inhalt.antworten.forEach((a, i) => {
        if (!t(a)) return
        if (f.inhalt.richtig.includes(i)) richtig.push(antworten.length)
        antworten.push(t(a))
      })
      return { ...basis, typ: 'auswahl', inhalt: { antworten, richtig } }
    }
    case 'umfrage':
      return { ...basis, typ: 'umfrage', inhalt: { antworten: f.inhalt.antworten.map(t).filter(Boolean) } }
    case 'freitext':
      return { ...basis, typ: 'freitext', inhalt: { loesungen: f.inhalt.loesungen.map(t).filter(Boolean) } }
    case 'reihenfolge':
      return { ...basis, typ: 'reihenfolge', inhalt: { elemente: f.inhalt.elemente.map(t).filter(Boolean) } }
    case 'zuordnung':
      return {
        ...basis,
        typ: 'zuordnung',
        inhalt: { paare: f.inhalt.paare.map((p) => ({ links: t(p.links), rechts: t(p.rechts) })).filter((p) => p.links || p.rechts) },
      }
    case 'schieberegler': {
      const { einheit, ...rest } = f.inhalt
      return { ...basis, typ: 'schieberegler', inhalt: { ...rest, ...(t(einheit) ? { einheit: t(einheit) } : {}) } }
    }
    case 'folie':
      return { ...basis, typ: 'folie', inhalt: { text: f.inhalt.text.trim() } }
    default:
      return { ...basis, typ: f.typ, inhalt: f.inhalt } as Frage
  }
}

/** Leere Zeitangaben und Beschreibungen weglassen. */
function bereinigeMedium(m: Medium | null | undefined): Medium | null {
  if (!m) return null
  const neu: Record<string, unknown> = { ...m }
  for (const k of ['start', 'ende'] as const) {
    const v = neu[k]
    if (v === undefined || v === null || v === '' || !Number.isFinite(v as number)) delete neu[k]
  }
  if ('beschreibung' in neu) {
    const b = t(neu.beschreibung as string)
    if (b) neu.beschreibung = b
    else delete neu.beschreibung
  }
  return neu as Medium
}

/** Prüft das Medium einer Frage (gleiche Regeln wie die Datenbank). */
export function pruefeMedium(m: Medium | null | undefined): string[] {
  if (!m) return []
  const fehler: string[] = []
  if (m.art === 'youtube') {
    if (!/^[A-Za-z0-9_-]{11}$/.test(m.id)) fehler.push('Der YouTube-Link ist ungültig.')
  } else if (!/^https:\/\/[^\s"<>]+$/.test(m.url) || m.url.length > 1000) {
    fehler.push('Die Adresse des Mediums ist ungültig (sie muss mit https:// beginnen).')
  }
  if ('start' in m || 'ende' in m) {
    const { start, ende } = m as { start?: number; ende?: number }
    if (start !== undefined && (start < 0 || start > 36000)) fehler.push('Die Startzeit ist ungültig.')
    if (ende !== undefined && (ende <= 0 || ende > 36000)) fehler.push('Die Endzeit ist ungültig.')
    if (start !== undefined && ende !== undefined && ende <= start) fehler.push('Die Endzeit muss nach der Startzeit liegen.')
  }
  if (m.art === 'bild' && (m.beschreibung ?? '').length > 300) fehler.push('Die Bildbeschreibung ist zu lang (höchstens 300 Zeichen).')
  return fehler
}

/** Prüft eine Frage (nach Bereinigung). Liefert verständliche Fehlermeldungen ohne Präfix. */
export function pruefeFrage(roh: Frage): string[] {
  const f = bereinigeFrage(roh)
  const fehler: string[] = []
  if (!f.text) fehler.push(f.typ === 'folie' ? 'Die Überschrift fehlt.' : 'Der Fragetext fehlt.')
  else if (f.text.length > GRENZEN.text) fehler.push(`Der Text ist zu lang (höchstens ${GRENZEN.text} Zeichen).`)
  fehler.push(...pruefeMedium(f.medium))

  switch (f.typ) {
    case 'auswahl':
    case 'umfrage': {
      const n = f.inhalt.antworten.length
      if (n < 2) fehler.push('Bitte mindestens zwei Antworten ausfüllen.')
      if (n > MAX_ANTWORTEN) fehler.push(`Höchstens ${MAX_ANTWORTEN} Antworten.`)
      if (f.inhalt.antworten.some((a) => a.length > GRENZEN.antwort)) fehler.push(`Eine Antwort ist zu lang (höchstens ${GRENZEN.antwort} Zeichen).`)
      if (f.typ === 'auswahl' && n >= 2 && f.inhalt.richtig.length === 0) fehler.push('Bitte mindestens eine ausgefüllte Antwort als richtig markieren.')
      break
    }
    case 'freitext':
      if (f.inhalt.loesungen.length === 0) fehler.push('Bitte mindestens eine richtige Lösung eintragen.')
      if (f.inhalt.loesungen.length > 10) fehler.push('Höchstens 10 Lösungen.')
      if (f.inhalt.loesungen.some((l) => l.length > GRENZEN.loesung)) fehler.push(`Eine Lösung ist zu lang (höchstens ${GRENZEN.loesung} Zeichen).`)
      break
    case 'reihenfolge':
      if (f.inhalt.elemente.length < 3) fehler.push('Bitte mindestens drei Elemente eintragen.')
      if (f.inhalt.elemente.length > 6) fehler.push('Höchstens 6 Elemente.')
      if (!eindeutig(f.inhalt.elemente)) fehler.push('Jedes Element darf nur einmal vorkommen.')
      if (f.inhalt.elemente.some((e) => e.length > GRENZEN.element)) fehler.push(`Ein Element ist zu lang (höchstens ${GRENZEN.element} Zeichen).`)
      break
    case 'zuordnung': {
      const p = f.inhalt.paare
      if (p.some((x) => !x.links || !x.rechts)) fehler.push('Bitte jedes Paar auf beiden Seiten ausfüllen.')
      if (p.length < 2) fehler.push('Bitte mindestens zwei Paare eintragen.')
      if (p.length > 6) fehler.push('Höchstens 6 Paare.')
      if (!eindeutig(p.map((x) => x.links)) || !eindeutig(p.map((x) => x.rechts))) fehler.push('Jeder Begriff darf pro Seite nur einmal vorkommen.')
      if (p.some((x) => x.links.length > GRENZEN.paar || x.rechts.length > GRENZEN.paar)) fehler.push(`Ein Begriff ist zu lang (höchstens ${GRENZEN.paar} Zeichen).`)
      break
    }
    case 'schieberegler': {
      const s = f.inhalt
      if (![s.min, s.max, s.schritt, s.richtig, s.toleranz].every(Number.isFinite)) fehler.push('Bitte alle Zahlen ausfüllen.')
      else {
        if (s.min >= s.max) fehler.push('Das Minimum muss kleiner als das Maximum sein.')
        if (s.schritt <= 0) fehler.push('Die Schrittweite muss größer als 0 sein.')
        else if ((s.max - s.min) / s.schritt > 100000) fehler.push('Zu viele Schritte – bitte die Schrittweite vergrößern.')
        if (s.richtig < s.min || s.richtig > s.max) fehler.push('Die richtige Zahl muss zwischen Minimum und Maximum liegen.')
        if (s.toleranz < 0) fehler.push('Die Toleranz darf nicht negativ sein.')
      }
      if ((s.einheit ?? '').length > GRENZEN.einheit) fehler.push(`Die Einheit ist zu lang (höchstens ${GRENZEN.einheit} Zeichen).`)
      break
    }
    case 'folie':
      if (f.inhalt.text.length > GRENZEN.folie) fehler.push(`Der Folientext ist zu lang (höchstens ${GRENZEN.folie} Zeichen).`)
      break
  }
  return fehler
}

/** Prüft ein ganzes Quiz. */
export function pruefeQuiz(titel: string, fragen: Frage[]): string[] {
  const fehler: string[] = []
  if (!titel.trim()) fehler.push('Bitte gib dem Quiz einen Titel.')
  else if (titel.trim().length > 200) fehler.push('Der Titel darf höchstens 200 Zeichen lang sein.')
  if (fragen.length === 0) fehler.push('Das Quiz braucht mindestens eine Frage.')
  fragen.forEach((f, i) => pruefeFrage(f).forEach((m) => fehler.push(`Frage ${i + 1}: ${m}`)))
  return fehler
}

// ---------------------------------------------------------------------------
// Import / Export (Dateiformat "quizzo-quiz", Version 1)
// Jede Frage: { typ, text, zeitlimit?, punkte?, schwierigkeit?, ...Inhalt } – der Inhalt steht direkt in der Frage
// (Ausnahme Folie: { typ: "folie", text: Überschrift, folientext }). Beschreibung: docs/QUIZ-DATEIFORMAT.md
// ---------------------------------------------------------------------------
export const DATEI_FORMAT = 'quizzo-quiz'

export function exportiereQuiz(titel: string, fragen: Frage[]) {
  return {
    format: DATEI_FORMAT,
    version: 1,
    titel,
    fragen: fragen.map((f) => {
      const s = alsSchwierigkeit(f.schwierigkeit)
      const basis = { typ: f.typ, text: f.text, zeitlimit: f.zeitlimit, punkte: f.punkte, ...(s ? { schwierigkeit: SCHWIERIGKEITEN[s - 1].name } : {}), ...(f.medium ? { medium: f.medium } : {}) }
      // Bei Folien heißt der Folientext in der Datei "folientext" (sonst Konflikt mit der Überschrift "text")
      return f.typ === 'folie' ? { ...basis, folientext: f.inhalt.text } : { ...basis, ...f.inhalt }
    }),
  }
}

type Roh = Record<string, unknown>
const istObjekt = (x: unknown): x is Roh => typeof x === 'object' && x !== null && !Array.isArray(x)
const texte = (x: unknown): string[] => (Array.isArray(x) ? x.map((e) => (typeof e === 'string' || typeof e === 'number' ? String(e) : '')) : [])
const zahl = (x: unknown, ersatz: number) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : ersatz)

/** YouTube-Video-ID aus einem Link (watch?v=, youtu.be/, shorts/, embed/) oder einer nackten ID. */
export function youtubeId(text: string): string | null {
  const s = text.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

/** Medium aus einer Import-Datei: { art, url | id | link, start?, ende?, beschreibung? } */
function importiereMedium(x: unknown): Medium | null {
  if (!istObjekt(x)) return null
  const zeit = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Math.round(zahl(v, NaN)))
  const zeiten = { start: zeit(x.start), ende: zeit(x.ende) }
  const art = x.art
  if (art === 'youtube') {
    const id = youtubeId(String(x.id ?? x.url ?? x.link ?? ''))
    return { art: 'youtube', id: id ?? String(x.id ?? x.url ?? ''), ...zeiten }
  }
  if (art !== 'bild' && art !== 'audio' && art !== 'video') return null
  const url = typeof x.url === 'string' ? x.url.trim() : ''
  const pfad = typeof x.pfad === 'string' ? { pfad: x.pfad } : {}
  if (art === 'bild') return { art, url, ...pfad, ...(typeof x.beschreibung === 'string' ? { beschreibung: x.beschreibung } : {}) }
  return { art, url, ...pfad, ...zeiten }
}

/** Liest eine Frage aus einer Import-Datei (großzügig: fehlende Werte bekommen Standardwerte). */
function importiereFrage(r: Roh): Frage {
  const typ = (typeof r.typ === 'string' && r.typ in FRAGETYPEN ? r.typ : 'auswahl') as FrageTyp
  const basis = neueFrage(typ)
  basis.text = typeof r.text === 'string' ? r.text : ''
  basis.zeitlimit = Math.min(240, Math.max(5, Math.round(zahl(r.zeitlimit, basis.zeitlimit))))
  const p = zahl(r.punkte, basis.punkte)
  basis.punkte = (FRAGETYPEN[typ].bewertet ? ([0, 1, 2].includes(p) ? p : 1) : 0) as Punkte
  const medium = importiereMedium(r.medium)
  if (medium) basis.medium = bereinigeMedium(medium)
  const schwierigkeit = FRAGETYPEN[typ].bewertet ? alsSchwierigkeit(r.schwierigkeit) : null
  if (schwierigkeit) basis.schwierigkeit = schwierigkeit

  switch (basis.typ) {
    case 'auswahl': {
      basis.inhalt.antworten = texte(r.antworten)
      const richtig = Array.isArray(r.richtig) ? r.richtig : [r.richtig]
      basis.inhalt.richtig = richtig.map((x) => zahl(x, -1)).filter((i) => Number.isInteger(i) && i >= 0)
      break
    }
    case 'umfrage':
      basis.inhalt.antworten = texte(r.antworten)
      break
    case 'wahrfalsch':
      basis.inhalt.richtig = r.richtig === true || r.richtig === 'true' || r.richtig === 'wahr' || r.richtig === 'richtig'
      break
    case 'freitext':
      basis.inhalt.loesungen = texte(r.loesungen)
      break
    case 'reihenfolge':
      basis.inhalt.elemente = texte(r.elemente)
      break
    case 'zuordnung':
      basis.inhalt.paare = (Array.isArray(r.paare) ? r.paare : []).filter(istObjekt).map((x) => ({
        links: typeof x.links === 'string' ? x.links : '',
        rechts: typeof x.rechts === 'string' ? x.rechts : '',
      }))
      break
    case 'schieberegler': {
      const s = basis.inhalt
      basis.inhalt = {
        min: zahl(r.min, s.min),
        max: zahl(r.max, s.max),
        schritt: zahl(r.schritt, s.schritt),
        richtig: zahl(r.richtig, s.richtig),
        toleranz: zahl(r.toleranz, s.toleranz),
        einheit: typeof r.einheit === 'string' ? r.einheit : '',
      }
      break
    }
    case 'folie':
      basis.inhalt.text = typeof r.folientext === 'string' ? r.folientext : ''
      break
  }
  return basis
}

export type ImportErgebnis = { titel: string; fragen: Frage[]; fehler: string[] }

/** Liest den Inhalt einer Quizzo-Datei. Wirft bei unlesbaren Dateien einen Fehler mit deutscher Meldung. */
export function importiereQuiz(dateiText: string): ImportErgebnis {
  let daten: unknown
  try {
    daten = JSON.parse(dateiText)
  } catch {
    throw new Error('Die Datei ist keine gültige Quizzo-Datei (kein JSON).')
  }
  if (!istObjekt(daten) || !Array.isArray(daten.fragen)) {
    throw new Error('Die Datei ist keine gültige Quizzo-Datei (es fehlt die Liste „fragen“).')
  }
  if (daten.fragen.length > 200) throw new Error('Die Datei enthält zu viele Fragen (höchstens 200).')
  const titel = typeof daten.titel === 'string' ? daten.titel.trim() : ''
  const fragen = daten.fragen.filter(istObjekt).map(importiereFrage)
  return { titel, fragen, fehler: pruefeQuiz(titel, fragen) }
}
