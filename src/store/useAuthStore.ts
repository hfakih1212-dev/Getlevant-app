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
  refreshUser: () => Promise<void>
  signOut: () => Promise<void>
}

async function fetchOrCreateProfile(): Promise<UserRow | null> {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .maybeSingle()
  if (existing) return existing
  // Row missing (auth user pre-dates the trigger) — create it via security-definer RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created } = await (supabase.rpc as any)('ensure_my_profile')
  return created as UserRow | null
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  initialize: () => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchOrCreateProfile()
        set({ session, user: profile, loading: false })
      } else {
        set({ session, loading: false })
      }
    })

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        set({ session: null, user: null })
        return
      }
      // Ignore refresh events that race with an in-progress sign-out
      const currentSession = useAuthStore.getState().session
      if (!currentSession && event === 'TOKEN_REFRESHED') return

      if (session?.user) {
        const profile = await fetchOrCreateProfile()
        set({ session, user: profile })
      } else {
        set({ session: null, user: null })
      }
    })
  },

  refreshUser: async () => {
    const profile = await fetchOrCreateProfile()
    set({ user: profile })
  },

  signOut: async () => {
    // Clear state first so the UI reacts immediately.
    set({ user: null, session: null })
    // scope:'local' wipes SecureStore without a network round-trip,
    // stopping the auto-refresh timer from restoring the session.
    try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
  },
}))
