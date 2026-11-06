import { istGeheimerSchluessel } from '../lib/schluessel.ts'
import { fehlerText } from '../lib/supabase.ts'

function jwt(payload: object) {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.signatur`
}

describe('Schlüssel-Prüfung', () => {
  it('erkennt neue secret-Schlüssel', () => {
    expect(istGeheimerSchluessel('sb_secret_abc123')).toBe(true)
  })
  it('erkennt alte service_role-JWTs', () => {
    expect(istGeheimerSchluessel(jwt({ role: 'service_role' }))).toBe(true)
  })
  it('akzeptiert publishable- und anon-Schlüssel', () => {
    expect(istGeheimerSchluessel('sb_publishable_abc123')).toBe(false)
    expect(istGeheimerSchluessel(jwt({ role: 'anon' }))).toBe(false)
  })
})

describe('Fehlertexte', () => {
  it('übersetzt falsche Anmeldedaten', () => {
    expect(fehlerText({ message: 'Invalid login credentials' })).toBe('E-Mail-Adresse oder Passwort ist falsch.')
  })
  it('meldet fehlende Datenbanktabellen verständlich', () => {
    expect(fehlerText(new Error('relation "public.quizze" does not exist'))).toBe('Die Datenbank ist noch nicht eingerichtet.')
  })
})
