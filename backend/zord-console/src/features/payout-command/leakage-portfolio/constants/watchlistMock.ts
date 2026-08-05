export type WatchlistItem = {
  id: string
  name: string
  valueLabel: string
  trendLabel: string
  trendUp: boolean
  sparkPath: string
}

/** Illustrative processing exposure per rail (lakhs INR) — aligned with ~1–2L batch scale, not legacy 50L+ demo values. */
export const WATCHLIST_ITEMS: WatchlistItem[] = [
  {
    id: 'hdfc',
    name: 'HDFC',
    valueLabel: '₹1,48,000',
    trendLabel: '-0.92%',
    trendUp: false,
    sparkPath: 'M2 14 L6 10 L10 12 L14 8 L18 10 L22 6',
  },
  {
    id: 'icici',
    name: 'ICICI',
    valueLabel: '₹1,92,000',
    trendLabel: '-0.45%',
    trendUp: false,
    sparkPath: 'M2 12 L6 11 L10 9 L14 10 L18 8 L22 7',
  },
  {
    id: 'stripe',
    name: 'STRIPE',
    valueLabel: '₹1,21,000',
    trendLabel: '+1.87%',
    trendUp: true,
    sparkPath: 'M2 16 L6 14 L10 12 L14 10 L18 8 L22 5',
  },
  {
    id: 'razorpay',
    name: 'RAZORPAY',
    valueLabel: '₹2,03,000',
    trendLabel: '+0.64%',
    trendUp: true,
    sparkPath: 'M2 15 L6 13 L10 11 L14 9 L18 7 L22 6',
  },
]
