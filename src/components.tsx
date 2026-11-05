import { Link } from 'react-router-dom'

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

export function ZurueckLink() {
  return (
    <Link to="/" className="text-lg text-white/80 underline-offset-4 hover:text-quizzo-yellow hover:underline">
      ← Startseite
    </Link>
  )
}
