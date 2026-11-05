import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components.tsx'
import { pruefeVerbindung, type Verbindungsstatus } from '../lib/supabase.ts'

const statusText: Record<Verbindungsstatus | 'pruefe', string> = {
  pruefe: 'Verbindung wird geprüft …',
  ok: 'Verbunden',
  fehler: 'Keine Verbindung zum Server',
  'nicht-konfiguriert': 'Server noch nicht eingerichtet',
}

export default function Startseite() {
  const [status, setStatus] = useState<Verbindungsstatus | 'pruefe'>('pruefe')

  useEffect(() => {
    pruefeVerbindung().then(setStatus)
  }, [])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-12 px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-3">
        <Logo gross />
        <p className="text-xl text-white/85 sm:text-2xl">Das Live-Quiz für deinen Unterricht</p>
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-5 sm:flex-row">
        <Link
          to="/leiten"
          className="flex-1 rounded-3xl border-4 border-quizzo-yellow px-8 py-7 text-3xl font-extrabold text-quizzo-yellow transition hover:bg-quizzo-yellow hover:text-quizzo-navy focus:outline-none focus-visible:ring-4 focus-visible:ring-white sm:text-4xl"
        >
          Quiz leiten
        </Link>
        <Link
          to="/mitspielen"
          className="flex-1 rounded-3xl bg-quizzo-yellow px-8 py-7 text-3xl font-extrabold text-quizzo-navy shadow-[0_6px_0_var(--color-quizzo-yellow-dark)] transition hover:brightness-105 active:translate-y-1 active:shadow-none focus:outline-none focus-visible:ring-4 focus-visible:ring-white sm:text-4xl"
        >
          Mitspielen
        </Link>
      </div>

      <p className="flex items-center gap-2 text-sm text-white/60" role="status">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            status === 'ok' ? 'bg-green-400' : status === 'pruefe' ? 'bg-white/40' : 'bg-red-400'
          }`}
        />
        {statusText[status]}
      </p>
    </main>
  )
}
