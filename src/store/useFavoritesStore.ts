import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface FavoritesState {
  ids: Set<string>
  loaded: boolean
  load: (userId: string) => Promise<void>
  toggle: (userId: string, productId: string) => Promise<void>
  clear: () => void
}

// Server-backed favorites, mirrored locally for instant heart toggles.
// Writes are optimistic and rolled back on error.
export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: new Set<string>(),
  loaded: false,

  load: async (userId) => {
    const { data, error } = await supabase
      .from('favorites')
      .select('product_id')
      .eq('user_id', userId)
    if (!error) {
      set({ ids: new Set((data ?? []).map(r => r.product_id)), loaded: true })
    }
  },

  toggle: async (userId, productId) => {
    const has = get().ids.has(productId)
    const next = new Set(get().ids)
    if (has) next.delete(productId)
    else next.add(productId)
    set({ ids: next })

    const { error } = has
      ? await supabase.from('favorites').delete()
          .eq('user_id', userId).eq('product_id', productId)
      : await supabase.from('favorites').insert({ user_id: userId, product_id: productId })

    if (error) {
      // Roll back the optimistic flip
      const rollback = new Set(get().ids)
      if (has) rollback.add(productId)
      else rollback.delete(productId)
      set({ ids: rollback })
    }
  },

  clear: () => set({ ids: new Set(), loaded: false }),
}))
