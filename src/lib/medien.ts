// Medien (Bild, Audio, Video) hochladen und aufräumen.
// Dateien liegen im Supabase-Speicher (Bucket "quizzo-medien", siehe 004_medien.sql),
// jede Lehrkraft in ihrem eigenen Ordner: <nutzer-id>/<zufällige-id>.<endung>

import { db } from './supabase.ts'
import type { Medium } from './fragetypen.ts'

export const BUCKET = 'quizzo-medien'
const MB = 1024 * 1024

/** Erlaubte Dateiarten mit Größengrenzen (Bilder werden vor dem Hochladen verkleinert). */
export const DATEI_REGELN = {
  bild: { typen: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], max: 20 * MB, text: 'JPG, PNG, WebP oder GIF' },
  audio: { typen: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm'], max: 15 * MB, text: 'MP3, M4A, OGG oder WAV, höchstens 15 MB' },
  video: { typen: ['video/mp4', 'video/webm'], max: 50 * MB, text: 'MP4 oder WebM, höchstens 50 MB' },
} as const
export type DateiArt = keyof typeof DATEI_REGELN

const ENDUNG: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/webm': 'weba',
  'video/mp4': 'mp4', 'video/webm': 'webm',
}

/** Prüft eine Datei vor dem Hochladen. Liefert eine Fehlermeldung oder null. */
export function pruefeDatei(datei: File, art: DateiArt): string | null {
  const regel = DATEI_REGELN[art]
  const typ = datei.type === 'audio/mp3' ? 'audio/mpeg' : datei.type
  if (!(regel.typen as readonly string[]).includes(typ)) return `Dieses Dateiformat geht leider nicht. Erlaubt: ${regel.text}.`
  if (datei.size > regel.max) return `Die Datei ist zu groß (höchstens ${regel.max / MB} MB).`
  return null
}

/** Größte Kantenlänge hochgeladener Bilder – reicht für Beamer, spart Speicher. */
const BILD_MAX_PX = 1600

/** Verkleinert ein Bild auf höchstens 1600 px und speichert es als WebP (GIFs bleiben, wegen Animation). */
async function verkleinereBild(datei: File): Promise<Blob> {
  if (datei.type === 'image/gif' || typeof createImageBitmap !== 'function') return datei
  const bild = await createImageBitmap(datei)
  const faktor = Math.min(1, BILD_MAX_PX / Math.max(bild.width, bild.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bild.width * faktor)
  canvas.height = Math.round(bild.height * faktor)
  canvas.getContext('2d')!.drawImage(bild, 0, 0, canvas.width, canvas.height)
  bild.close()
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.82))
  // Falls der Browser kein WebP kann oder das Ergebnis größer wäre: Original nehmen
  return blob && blob.type === 'image/webp' && blob.size < datei.size ? blob : datei
}

/**
 * Zufällige UUID (Version 4) als Dateiname.
 * Nicht crypto.randomUUID(): Das gibt es nur auf https-Seiten und localhost, nicht beim Testen im WLAN
 * (http://192.168…). crypto.getRandomValues() funktioniert überall.
 */
export function zufallsId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // Version 4
  b[8] = (b[8] & 0x3f) | 0x80 // Variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function nutzerId(): Promise<string> {
  const { data } = await db().auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Bitte melde dich erneut an.')
  return id
}

/** Lädt eine Datei in den eigenen Ordner hoch und liefert das Medium für die Frage. */
export async function ladeHoch(datei: File, art: DateiArt): Promise<Medium> {
  const fehler = pruefeDatei(datei, art)
  if (fehler) throw new Error(fehler)
  const inhalt = art === 'bild' ? await verkleinereBild(datei) : datei
  const typ = inhalt.type === 'audio/mp3' ? 'audio/mpeg' : inhalt.type
  const pfad = `${await nutzerId()}/${zufallsId()}.${ENDUNG[typ]}`
  const speicher = db().storage.from(BUCKET)
  const { error } = await speicher.upload(pfad, inhalt, { contentType: typ, cacheControl: '31536000', upsert: false })
  if (error) throw error
  const url = speicher.getPublicUrl(pfad).data.publicUrl
  return { art, url, pfad }
}

/** Wie lange eine nicht verwendete Datei liegen bleiben darf (z. B. hochgeladen, aber Quiz nie gespeichert). */
const FRIST_MS = 24 * 60 * 60 * 1000

/**
 * Löscht Dateien, die in keinem eigenen Quiz mehr vorkommen.
 * `kandidaten` (z. B. gerade entfernte oder ersetzte Medien) werden sofort gelöscht,
 * alle übrigen unbenutzten Dateien erst nach 24 Stunden (falls sie noch in einem offenen Editor stecken).
 * Fehler beim Aufräumen werden ignoriert – sie dürfen das Speichern nie verhindern.
 */
export async function raeumeMedienAuf(kandidaten: Iterable<string> = []): Promise<string[]> {
  try {
    const uid = await nutzerId()
    const speicher = db().storage.from(BUCKET)
    const { data: dateien, error } = await speicher.list(uid, { limit: 1000 })
    if (error || !dateien) return []

    const { data: fragen, error: fehler } = await db().from('fragen').select('medium').not('medium', 'is', null)
    if (fehler) return []
    const benutzt = new Set((fragen ?? []).map((f) => (f.medium as { pfad?: string } | null)?.pfad).filter(Boolean))

    const sofort = new Set(kandidaten)
    const jetzt = Date.now()
    const weg = dateien
      .map((d) => ({ pfad: `${uid}/${d.name}`, alt: jetzt - new Date(d.created_at ?? jetzt).getTime() > FRIST_MS }))
      .filter((d) => !benutzt.has(d.pfad) && (sofort.has(d.pfad) || d.alt))
      .map((d) => d.pfad)
    if (weg.length) await speicher.remove(weg)
    return weg
  } catch {
    return []
  }
}

/** Alle Speicherpfade in einer Liste von Fragen. */
export function pfadeIn(fragen: { medium?: Medium | null }[]): string[] {
  return fragen.flatMap((f) => (f.medium && 'pfad' in f.medium && f.medium.pfad ? [f.medium.pfad] : []))
}

/** Sekunden als m:ss, für Start-/Endzeiten. */
export function zeitText(s: number | undefined): string {
  if (s === undefined) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Liest "1:23", "83" oder "1:02:03" als Sekunden. Leer → undefined, unlesbar → NaN. */
export function leseZeit(text: string): number | undefined {
  const s = text.trim()
  if (!s) return undefined
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return NaN
  return s.split(':').reduce((summe, teil) => summe * 60 + Number(teil), 0)
}
