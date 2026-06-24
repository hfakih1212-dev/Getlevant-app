import { create } from 'zustand'

export interface CartItem {
  productId: string
  variantId: string
  storeId: string
  name: string
  storeName: string
  imageUrl: string | null
  priceUsd: number
  size: string | null
  color: string | null
  colorHex: string | null
  quantity: number
}

interface CartState {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (productId: string, variantId: string) => void
  updateQuantity: (productId: string, variantId: string, quantity: number) => void
  clearCart: () => void
}

export const useCartStore = create<CartState>((set) => ({
  items: [],

  addItem: (incoming) =>
    set((state) => {
      const idx = state.items.findIndex(
        (i) => i.productId === incoming.productId && i.variantId === incoming.variantId,
      )
      if (idx !== -1) {
        const items = [...state.items]
        items[idx] = { ...items[idx], quantity: items[idx].quantity + 1 }
        return { items }
      }
      return { items: [...state.items, { ...incoming, quantity: 1 }] }
    }),

  removeItem: (productId, variantId) =>
    set((state) => ({
      items: state.items.filter(
        (i) => !(i.productId === productId && i.variantId === variantId),
      ),
    })),

  updateQuantity: (productId, variantId, quantity) =>
    set((state) => {
      if (quantity <= 0) {
        return {
          items: state.items.filter(
            (i) => !(i.productId === productId && i.variantId === variantId),
          ),
        }
      }
      return {
        items: state.items.map((i) =>
          i.productId === productId && i.variantId === variantId
            ? { ...i, quantity }
            : i,
        ),
      }
    }),

  clearCart: () => set({ items: [] }),
}))
