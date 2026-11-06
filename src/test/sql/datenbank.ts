import { PGlite, type Transaction } from '@electric-sql/pglite'

// Alle Migrationen aus supabase/migrations, in Dateinamen-Reihenfolge
const migrationen = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Minimaler Nachbau der Supabase-Umgebung: Rollen anon/authenticated, auth.users, auth.uid()
 * und die Standard-Rechte, die Supabase neuen Tabellen und Funktionen in "public" gibt.
 * So prüfen die Tests, ob unsere revoke/grant-Anweisungen und RLS-Regeln wirklich greifen.
 */
const SUPABASE_NACHBAU = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`

export const LEHRKRAFT_A = '00000000-0000-4000-8000-00000000000a'
export const LEHRKRAFT_B = '00000000-0000-4000-8000-00000000000b'

export async function neueDatenbank(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_NACHBAU)
  for (const pfad of Object.keys(migrationen).sort()) {
    await db.exec(migrationen[pfad])
  }
  await db.query('insert into auth.users (id) values ($1), ($2)', [LEHRKRAFT_A, LEHRKRAFT_B])
  return db
}

type Wer = { rolle: 'anon' } | { rolle: 'authenticated'; uid: string }
export const ANONYM: Wer = { rolle: 'anon' }
export const lehrkraft = (uid: string): Wer => ({ rolle: 'authenticated', uid })

/** Führt eine Abfrage so aus, wie sie über die Supabase-API mit dieser Rolle ankäme. */
export async function als<T = Record<string, unknown>>(db: PGlite, wer: Wer, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.exec(`set local role ${wer.rolle}`)
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [wer.rolle === 'authenticated' ? wer.uid : ''])
    return (await tx.query<T>(sql, params)).rows
  })
}

/** Ruft eine Datenbank-Funktion auf und liefert ihr Ergebnis. */
export async function rpc<T = unknown>(db: PGlite, wer: Wer, funktion: string, args: unknown[]): Promise<T> {
  const platzhalter = args.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await als<{ r: T }>(db, wer, `select public.${funktion}(${platzhalter}) as r`, args)
  return rows[0].r
}
