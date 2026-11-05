import { Logo, ZurueckLink } from '../components.tsx'

// Lehrkraft-Ansicht: iPad im Querformat am Beamer – große Schrift
export default function QuizLeiten() {
  return (
    <main className="flex min-h-dvh flex-col gap-10 px-10 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <ZurueckLink />
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-5xl font-extrabold">Quiz leiten</h2>
        <p className="max-w-2xl text-2xl text-white/80">
          Hier melden sich Lehrkräfte an und starten ihre Quizze. Dieser Bereich folgt in der nächsten Etappe.
        </p>
      </section>
    </main>
  )
}
