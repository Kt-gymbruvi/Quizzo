import { Logo, ZurueckLink } from '../components.tsx'

// Schüleransicht: fürs Handy optimiert
export default function Mitspielen() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-5 py-6">
      <header className="flex items-center justify-between">
        <Logo />
        <ZurueckLink />
      </header>
      <section className="flex flex-1 flex-col justify-center gap-4 text-center">
        <h2 className="text-3xl font-extrabold">Mitspielen</h2>
        <p className="text-lg text-white/80">
          Hier gibst du bald die Spiel-PIN und deinen Spitznamen ein. Kein Konto nötig.
        </p>
      </section>
    </main>
  )
}
