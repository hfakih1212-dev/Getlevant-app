export interface LoyaltyTier {
  name: 'Bronze' | 'Silver' | 'Gold'
  minOrders: number
  color: string
}

// Milestone thresholds mirror the handle_order_delivered() trigger (5, 10)
export const LOYALTY_TIERS: LoyaltyTier[] = [
  { name: 'Bronze', minOrders: 0,  color: '#A9713D' },
  { name: 'Silver', minOrders: 5,  color: '#8A8A92' },
  { name: 'Gold',   minOrders: 10, color: '#C99700' },
]

export interface LoyaltyProgress {
  tier: LoyaltyTier
  nextTier: LoyaltyTier | null
  ordersToNext: number
  progress: number   // 0..1 within the current tier band
}

export function getLoyaltyProgress(completedOrders: number): LoyaltyProgress {
  let tier = LOYALTY_TIERS[0]
  let nextTier: LoyaltyTier | null = null

  for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
    if (completedOrders >= LOYALTY_TIERS[i].minOrders) {
      tier = LOYALTY_TIERS[i]
      nextTier = LOYALTY_TIERS[i + 1] ?? null
      break
    }
  }

  if (!nextTier) {
    return { tier, nextTier: null, ordersToNext: 0, progress: 1 }
  }

  const bandSize = nextTier.minOrders - tier.minOrders
  const inBand   = completedOrders - tier.minOrders
  return {
    tier,
    nextTier,
    ordersToNext: nextTier.minOrders - completedOrders,
    progress: Math.min(1, inBand / bandSize),
  }
}
