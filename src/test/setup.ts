import '@testing-library/jest-dom/vitest'
import { setzeFakeZurueck } from './fakeSupabase.ts'

// In Tests nie mit dem echten Supabase-Server sprechen.
vi.mock('../lib/supabase.ts', async (original) => {
  const echt = await original<typeof import('../lib/supabase.ts')>()
  const { fakeSupabase } = await import('./fakeSupabase.ts')
  return {
    ...echt,
    supabase: fakeSupabase,
    db: () => fakeSupabase,
    pruefeVerbindung: vi.fn(async () => 'ok'),
  }
})

beforeEach(() => {
  setzeFakeZurueck()
  if (typeof window !== 'undefined') window.localStorage.clear() // SQL-Tests laufen ohne Browser-Umgebung
})
