import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Nur der ÖFFENTLICHE Schlüssel (publishable) darf hier stehen.
// Alle Tabellen sind per Row Level Security geschützt.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Erkennt secret-/service_role-Schlüssel, damit sie nie versehentlich benutzt werden. */
export function istGeheimerSchluessel(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true
  // Ältere JWT-Schlüssel: Rolle im Payload prüfen
  const teile = k.split('.')
  if (teile.length === 3) {
    try {
      const payload = JSON.parse(atob(teile[1].replace(/-/g, '+').replace(/_/g, '/')))
      return payload.role === 'service_role'
    } catch {
      return false
    }
  }
  return false
}

function erstelleClient(): SupabaseClient | null {
  if (!url || !key) return null
  if (istGeheimerSchluessel(key)) {
    throw new Error('Geheimer Supabase-Schlüssel erkannt – bitte nur den publishable-Schlüssel verwenden!')
  }
  return createClient(url, key)
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
