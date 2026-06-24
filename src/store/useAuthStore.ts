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
      set({ session, loading: false })

      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()
        set({ user: profile })
      }
    })

    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session })

      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()
        set({ user: profile })
      } else {
        set({ user: null })
      }
    })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))
