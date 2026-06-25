import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Database } from '../types/supabase'

type UserRow = Database['public']['Tables']['users']['Row']

interface AuthState {
  user: UserRow | null
  session: Session | null
  loading: boolean
  initialize: () => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  initialize: () => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
        set({ session, user: profile, loading: false })
      } else {
        set({ session, loading: false })
      }
    })

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
        set({ session, user: profile })
      } else {
        set({ session, user: null })
      }
    })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))
