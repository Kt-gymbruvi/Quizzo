import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eingabe, Knopf, LehrkraftKopf, Meldung, ZurueckLink } from '../../components.tsx'
import { useAuth } from '../../lib/auth.tsx'
import { db, fehlerText } from '../../lib/supabase.ts'

export const MIN_PASSWORT_LAENGE = 8

/**
 * Passwort festlegen oder ändern.
 * - Aus einer E-Mail (Einladung / Passwort vergessen): …/#/passwort?token_hash=…&type=invite|recovery
 * - Als angemeldete Lehrkraft: …/#/passwort
 */
export default function Passwort() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session, laedt } = useAuth()
  const tokenHash = params.get('token_hash')
  const typ = params.get('type')
  const [linkFehler, setLinkFehler] = useState<string | null>(null)
  const geprueft = useRef(false)

  const [passwort, setPasswort] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  // Link aus der E-Mail einlösen (nur einmal)
  useEffect(() => {
    if (!tokenHash || geprueft.current) return
    geprueft.current = true
    if (typ !== 'invite' && typ !== 'recovery') {
      setLinkFehler('Der Link ist ungültig.')
      return
    }
    db()
      .auth.verifyOtp({ token_hash: tokenHash, type: typ })
      .then(({ error }) => {
        if (error) setLinkFehler(fehlerText(error))
        else navigate('/passwort', { replace: true })
      })
      .catch((err) => setLinkFehler(fehlerText(err)))
  }, [tokenHash, typ, navigate])

  async function speichern(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (passwort.length < MIN_PASSWORT_LAENGE) {
      setFehler(`Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`)
      return
    }
    if (passwort !== wiederholung) {
      setFehler('Die beiden Passwörter stimmen nicht überein.')
      return
    }
    setLaeuft(true)
    try {
      const { error } = await db().auth.updateUser({ password: passwort })
      if (error) setFehler(fehlerText(error))
      else navigate('/leiten', { replace: true, state: { hinweis: 'Dein Passwort wurde gespeichert.' } })
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }

  let inhalt
  if (linkFehler) {
    inhalt = (
      <>
        <Meldung art="fehler">{linkFehler}</Meldung>
        <p className="text-lg text-white/80">Fordere auf der Anmeldeseite über „Passwort vergessen?“ einen neuen Link an.</p>
        <ZurueckLink zu="/leiten" text="← Zur Anmeldung" />
      </>
    )
  } else if (laedt || (tokenHash && !session)) {
    inhalt = <p className="text-xl text-white/80">Einen Moment …</p>
  } else if (!session) {
    inhalt = (
      <>
        <p className="text-xl text-white/80">Bitte melde dich zuerst an.</p>
        <ZurueckLink zu="/leiten" text="← Zur Anmeldung" />
      </>
    )
  } else {
    inhalt = (
      <form onSubmit={speichern} className="flex flex-col gap-5">
        <Eingabe
          label="Neues Passwort"
          type="password"
          autoComplete="new-password"
          required
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
        />
        <Eingabe
          label="Passwort wiederholen"
          type="password"
          autoComplete="new-password"
          required
          value={wiederholung}
          onChange={(e) => setWiederholung(e.target.value)}
        />
        <p className="text-base text-white/70">Mindestens {MIN_PASSWORT_LAENGE} Zeichen.</p>
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        <Knopf type="submit" disabled={laeuft}>
          {laeuft ? 'Wird gespeichert …' : 'Passwort speichern'}
        </Knopf>
        <ZurueckLink zu="/leiten" text="← Zu meinen Quizzen" />
      </form>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col gap-10 px-8 py-6">
      <LehrkraftKopf />
      <section className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-3xl bg-quizzo-navy-light/60 p-8 ring-1 ring-white/10">
        <h2 className="text-3xl font-extrabold">Passwort festlegen</h2>
        {inhalt}
      </section>
    </main>
  )
}
