import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/auth.tsx'
import Startseite from './pages/Startseite.tsx'
import QuizLeiten, { NurAngemeldet } from './pages/QuizLeiten.tsx'
import QuizEditor from './pages/lehrkraft/QuizEditor.tsx'
import Passwort from './pages/lehrkraft/Passwort.tsx'
import SpielLeiten from './pages/lehrkraft/SpielLeiten.tsx'
import Mitspielen from './pages/Mitspielen.tsx'
import Wiederholen from './pages/Wiederholen.tsx'
import Aufgabe from './pages/Aufgabe.tsx'
import AufgabeDetail from './pages/lehrkraft/AufgabeDetail.tsx'

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
        <Route
          path="/leiten/spiel/:id"
          element={
            <NurAngemeldet>
              <SpielLeiten />
            </NurAngemeldet>
          }
        />
        <Route
          path="/leiten/aufgabe/:id"
          element={
            <NurAngemeldet>
              <AufgabeDetail />
            </NurAngemeldet>
          }
        />
        <Route path="/passwort" element={<Passwort />} />
        <Route path="/mitspielen" element={<Mitspielen />} />
        <Route path="/wiederholen" element={<Wiederholen />} />
        <Route path="/aufgabe" element={<Aufgabe />} />
        <Route path="/aufgabe/:code" element={<Aufgabe />} />
        <Route path="*" element={<Startseite />} />
      </Routes>
    </AuthProvider>
  )
}
