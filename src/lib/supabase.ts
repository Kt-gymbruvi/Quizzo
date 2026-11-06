import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { istGeheimerSchluessel } from './schluessel.ts'

// Nur der ÖFFENTLICHE Schlüssel (publishable) darf hier stehen.
// Alle Tabellen sind per Row Level Security geschützt.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

function erstelleClient(): SupabaseClient | null {
  if (!url || !key) return null
  if (istGeheimerSchluessel(key)) {
    throw new Error('Geheimer Supabase-Schlüssel erkannt – bitte nur den publishable-Schlüssel verwenden!')
  }
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Links aus E-Mails werden auf der Passwort-Seite selbst ausgewertet (HashRouter).
      detectSessionInUrl: false,
    },
  })
}

export const supabase = erstelleClient()

export type Verbindungsstatus = 'ok' | 'fehler' | 'nicht-konfiguriert'

/** Prüft, ob der Supabase-Server erreichbar ist (liest keine Daten). */
export async function pruefeVerbindung(): Promise<Verbindungsstatus> {
  if (!url || !key) return 'nicht-konfiguriert'
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } })
    return res.ok ? 'ok' : 'fehler'
  } catch {
    return 'fehler'
  }
}

/** Liefert den Client oder wirft einen verständlichen Fehler. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Der Server ist noch nicht eingerichtet.')
  return supabase
}

/** Übersetzt typische Supabase-Fehlermeldungen ins Deutsche. */
export function fehlerText(fehler: unknown): string {
  const msg = fehler instanceof Error ? fehler.message : typeof fehler === 'object' && fehler && 'message' in fehler ? String((fehler as { message: unknown }).message) : String(fehler)
  if (/invalid login credentials/i.test(msg)) return 'E-Mail-Adresse oder Passwort ist falsch.'
  if (/email not confirmed/i.test(msg)) return 'Die E-Mail-Adresse wurde noch nicht bestätigt.'
  if (/rate limit|too many/i.test(msg)) return 'Zu viele Versuche. Bitte warte einen Moment.'
  if (/should be at least|password.*(short|weak)/i.test(msg)) return 'Das Passwort ist zu kurz oder zu schwach.'
  if (/same.*password|different from the old/i.test(msg)) return 'Das neue Passwort muss sich vom alten unterscheiden.'
  if (/expired|invalid.*(token|otp)|otp.*(expired|invalid)/i.test(msg)) return 'Der Link ist abgelaufen oder ungültig.'
  if (/failed to fetch|network/i.test(msg)) return 'Keine Verbindung zum Server.'
  if (/does not exist|schema cache/i.test(msg)) return 'Die Datenbank ist noch nicht eingerichtet.'
  return 'Etwas ist schiefgelaufen: ' + msg
}
