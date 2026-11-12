import { useState, type FormEvent } from 'react'
import { Eingabe, Knopf, Logo, Meldung, ZurueckLink, ZurLehrraum } from '../../components.tsx'
import { db, fehlerText } from '../../lib/supabase.ts'

export default function Anmelden() {
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [vergessen, setVergessen] = useState(false)

  async function anmelden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setLaeuft(true)
    try {
      const { error } = await db().auth.signInWithPassword({ email: email.trim(), password: passwort })
      if (error) setFehler(fehlerText(error))
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  async function linkSenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setLaeuft(true)
    try {
      const { error } = await db().auth.resetPasswordForEmail(email.trim())
      if (error) setFehler(fehlerText(error))
      else setHinweis('Falls ein Konto zu dieser Adresse existiert, kommt gleich eine E-Mail mit einem Link.')
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-10">
      <ZurLehrraum ecke />
      <Logo />
      <form
        onSubmit={vergessen ? linkSenden : anmelden}
        className="flex w-full max-w-md flex-col gap-5 rounded-3xl bg-quizzo-navy-light/60 p-8 shadow-2xl ring-1 ring-white/10"
      >
        <h2 className="text-center text-3xl font-extrabold">{vergessen ? 'Passwort vergessen' : 'Anmelden für Lehrkräfte'}</h2>
        <Eingabe
          label="E-Mail-Adresse"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {!vergessen && (
          <Eingabe
            label="Passwort"
            type="password"
            autoComplete="current-password"
            required
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
          />
        )}
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {hinweis && <Meldung art="erfolg">{hinweis}</Meldung>}
        <Knopf type="submit" disabled={laeuft}>
          {laeuft ? 'Einen Moment …' : vergessen ? 'Link zum Zurücksetzen senden' : 'Anmelden'}
        </Knopf>
        <button
          type="button"
          className="text-base text-white/80 underline underline-offset-4 hover:text-quizzo-yellow"
          onClick={() => {
            setVergessen(!vergessen)
            setFehler(null)
            setHinweis(null)
          }}
        >
          {vergessen ? 'Zurück zur Anmeldung' : 'Passwort vergessen?'}
        </button>
        <p className="text-center text-sm text-white/60">
          Konten werden nur auf Einladung angelegt. Schülerinnen und Schüler brauchen kein Konto.
        </p>
      </form>
      <ZurueckLink />
    </main>
  )
}
