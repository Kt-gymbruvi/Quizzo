import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth.tsx'
import Anmelden from './lehrkraft/Anmelden.tsx'
import QuizListe from './lehrkraft/QuizListe.tsx'

/** Zeigt den Inhalt nur angemeldeten Lehrkräften, sonst die Anmeldung. */
export function NurAngemeldet({ children }: { children: ReactNode }) {
  const { session, laedt } = useAuth()
  if (laedt) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-2xl text-white/70">Einen Moment …</p>
      </main>
    )
  }
  return session ? <>{children}</> : <Anmelden />
}

// Lehrkraft-Ansicht: iPad im Querformat am Beamer – große Schrift
export default function QuizLeiten() {
  return (
    <NurAngemeldet>
      <QuizListe />
    </NurAngemeldet>
  )
}
