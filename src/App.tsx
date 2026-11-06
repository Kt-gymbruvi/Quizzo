import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/auth.tsx'
import Startseite from './pages/Startseite.tsx'
import QuizLeiten, { NurAngemeldet } from './pages/QuizLeiten.tsx'
import QuizEditor from './pages/lehrkraft/QuizEditor.tsx'
import Passwort from './pages/lehrkraft/Passwort.tsx'
import Mitspielen from './pages/Mitspielen.tsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Startseite />} />
        <Route path="/leiten" element={<QuizLeiten />} />
        <Route
          path="/leiten/quiz/:id"
          element={
            <NurAngemeldet>
              <QuizEditor />
            </NurAngemeldet>
          }
        />
        <Route path="/passwort" element={<Passwort />} />
        <Route path="/mitspielen" element={<Mitspielen />} />
        <Route path="*" element={<Startseite />} />
      </Routes>
    </AuthProvider>
  )
}
