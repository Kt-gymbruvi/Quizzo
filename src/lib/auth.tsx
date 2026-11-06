import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'

type AuthZustand = { session: Session | null; laedt: boolean }

const AuthContext = createContext<AuthZustand>({ session: null, laedt: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [zustand, setZustand] = useState<AuthZustand>({ session: null, laedt: supabase !== null })

  useEffect(() => {
    if (!supabase) return
    let aktiv = true
    supabase.auth.getSession().then(({ data }) => {
      if (aktiv) setZustand({ session: data.session, laedt: false })
    })
    const { data } = supabase.auth.onAuthStateChange((_ereignis, session) => {
      if (aktiv) setZustand({ session, laedt: false })
    })
    return () => {
      aktiv = false
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={zustand}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
