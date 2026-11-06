import { vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn = ReturnType<typeof vi.fn<(...args: any[]) => any>>
const fn = (): Fn => vi.fn<(...args: any[]) => any>()

/** Attrappe des Supabase-Clients für Tests – es werden keine echten Server-Aufrufe gemacht. */
export const fakeSupabase = {
  auth: {
    getSession: fn(),
    onAuthStateChange: fn(),
    signInWithPassword: fn(),
    signOut: fn(),
    updateUser: fn(),
    verifyOtp: fn(),
    resetPasswordForEmail: fn(),
  },
  from: fn(),
  rpc: fn(),
  storage: { from: fn() },
}

/** Attrappe des Dateispeichers (Supabase Storage, Bucket "quizzo-medien") */
export const fakeSpeicher = { upload: fn(), getPublicUrl: fn(), list: fn(), remove: fn() }
export const SPEICHER_URL = 'https://test.supabase.co/storage/v1/object/public/quizzo-medien/'

export function eingeloggteSession(email = 'lehrkraft@schule.test') {
  return { access_token: 'x', user: { id: 'u1', email } }
}

/** Setzt alle Attrappen auf Standardverhalten zurück (nicht angemeldet, leere Daten). */
export function setzeFakeZurueck(session: unknown = null) {
  const a = fakeSupabase.auth
  a.getSession.mockReset().mockResolvedValue({ data: { session }, error: null })
  a.onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  a.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null })
  a.signOut.mockReset().mockResolvedValue({ error: null })
  a.updateUser.mockReset().mockResolvedValue({ data: {}, error: null })
  a.verifyOtp.mockReset().mockResolvedValue({ data: {}, error: null })
  a.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null })
  fakeSupabase.rpc.mockReset().mockResolvedValue({ data: 'neue-id', error: null })
  fakeSupabase.from.mockReset().mockImplementation(() => abfrage({ data: [], error: null }))
  fakeSupabase.storage.from.mockReset().mockReturnValue(fakeSpeicher)
  fakeSpeicher.upload.mockReset().mockImplementation(async (pfad: string) => ({ data: { path: pfad }, error: null }))
  fakeSpeicher.getPublicUrl.mockReset().mockImplementation((pfad: string) => ({ data: { publicUrl: SPEICHER_URL + pfad } }))
  fakeSpeicher.list.mockReset().mockResolvedValue({ data: [], error: null })
  fakeSpeicher.remove.mockReset().mockResolvedValue({ data: [], error: null })
}

/** Baut eine verkettbare Abfrage (select/eq/not/order/single/delete), die am Ende `ergebnis` liefert. */
export function abfrage(ergebnis: unknown) {
  const kette: any = {}
  for (const m of ['select', 'eq', 'not', 'order', 'single', 'delete']) kette[m] = vi.fn(() => kette)
  kette.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) => Promise.resolve(ergebnis).then(ok, nok)
  return kette
}
