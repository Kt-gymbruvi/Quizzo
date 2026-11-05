import { Route, Routes } from 'react-router-dom'
import Startseite from './pages/Startseite.tsx'
import QuizLeiten from './pages/QuizLeiten.tsx'
import Mitspielen from './pages/Mitspielen.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Startseite />} />
      <Route path="/leiten" element={<QuizLeiten />} />
      <Route path="/mitspielen" element={<Mitspielen />} />
      <Route path="*" element={<Startseite />} />
    </Routes>
  )
}
