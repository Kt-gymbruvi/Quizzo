import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './lib/auth.tsx'
import { supabase } from './lib/supabase.ts'

export function Logo({ gross = false }: { gross?: boolean }) {
  return (
    <h1
      className={`font-black tracking-tight text-quizzo-yellow drop-shadow-[0_4px_0_rgba(0,0,0,0.35)] ${
        gross ? 'text-7xl sm:text-8xl lg:text-9xl' : 'text-4xl'
      }`}
    >
      Quizzo
    </h1>
  )
}

export function ZurueckLink({ zu = '/', text = '← Startseite' }: { zu?: string; text?: string }) {
  return (
    <Link to={zu} className="text-lg text-white/80 underline-offset-4 hover:text-quizzo-yellow hover:underline">
      {text}
    </Link>
  )
}

type KnopfArt = 'gelb' | 'rahmen' | 'leise' | 'gefahr'
const knopfStil: Record<KnopfArt, string> = {
  gelb: 'bg-quizzo-yellow text-quizzo-navy shadow-[0_5px_0_var(--color-quizzo-yellow-dark)] hover:brightness-105 active:translate-y-1 active:shadow-none',
  rahmen: 'border-3 border-quizzo-yellow text-quizzo-yellow hover:bg-quizzo-yellow hover:text-quizzo-navy',
  leise: 'bg-white/10 text-white hover:bg-white/20',
  gefahr: 'bg-red-500/90 text-white hover:bg-red-500',
}

export function Knopf({ art = 'gelb', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { art?: KnopfArt }) {
  return (
    <button
      className={`rounded-2xl px-6 py-3 text-xl font-extrabold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50 ${knopfStil[art]} ${className}`}
      {...rest}
    />
  )
}

export function Eingabe({ label, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-2 text-left text-lg font-semibold">
      {label}
      <input
        className={`rounded-xl border-2 border-white/20 bg-white px-4 py-3 text-xl font-normal text-quizzo-navy placeholder:text-slate-400 focus:border-quizzo-yellow focus:outline-none focus:ring-4 focus:ring-quizzo-yellow/40 ${className}`}
        {...rest}
      />
    </label>
  )
}

export function Meldung({ art, children }: { art: 'fehler' | 'erfolg'; children: ReactNode }) {
  return (
    <p
      role={art === 'fehler' ? 'alert' : 'status'}
      className={`rounded-xl px-4 py-3 text-lg font-semibold ${
        art === 'fehler' ? 'bg-red-500/20 text-red-100 ring-2 ring-red-400/60' : 'bg-green-500/20 text-green-100 ring-2 ring-green-400/60'
      }`}
    >
      {children}
    </p>
  )
}

/** Kopfzeile der Lehrkraft-Ansicht mit Abmelden-Knopf. */
export function LehrkraftKopf({ links }: { links?: ReactNode }) {
  const { session } = useAuth()
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-6">
        <Link to="/" aria-label="Zur Startseite">
          <Logo />
        </Link>
        {links}
      </div>
      {session && (
        <div className="flex items-center gap-4 text-lg">
          <span className="hidden text-white/70 md:inline">{session.user.email}</span>
          <Link to="/passwort" className="text-white/80 underline-offset-4 hover:text-quizzo-yellow hover:underline">
            Passwort ändern
          </Link>
          <Knopf art="leise" className="!py-2 !text-lg" onClick={() => supabase?.auth.signOut()}>
            Abmelden
          </Knopf>
        </div>
      )}
    </header>
  )
}
