import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import { DEMO_DISPATCH_ROWS } from './dispatchRelayDemo'
import { DEMO_SETTLEMENT_ROWS } from './settlementJournalDemo'
import { INDIA_CASE } from './indiaBulkCaseStudy'

/** Spec 7.13 - Payment Gaps & Value at Risk demo fixtures. */

export const PAYMENT_GAPS_HEADER = {
  title: 'Payment Gaps & Value at Risk',
  subtitle: 'Identify value that is unmatched, short-settled, reversed, or unresolved.',
} as const

/** Gap categories - exact Spec 7.13 labels. */
export type GapCategoryId =
  | 'unmatched_intent'
  | 'short_settled'
  | 'over_settled'
  | 'unlinked_settlement'
  | 'return_reversal'
  | 'unresolved'

export type GapCategory = {
  id: GapCategoryId
  label: string
  /** Potential exposure - never called “loss” until classified. */
  valueRupees: number
  payoutCount: number
  /** Maps into Outcome Review outcome class filter. */
  outcomeFilter: string
  description: string
}

export type GapAffectedRow = {
  id: string
  paymentRef: string
  contractId: string
  payeeLabel: string
  categoryId: GapCategoryId
  categoryLabel: string
  potentialExposureRupees: number
  batchId: string
  legalEntity: string
  country: string
  rail: string
  provider: string
  policy: string
  valueDate: string
  reviewHref: string
}

export type GapTrendPoint = {
  date: string
  valueRupees: number
}

export type GapsFilterState = {
  dateFrom: string
  dateTo: string
  legalEntity: string
  batch: string
  rail: string
  country: string
  policy: string
}

export const GAPS_FILTER_STORAGE_KEY = 'zord_settlement_gaps_filters_v2'

export const DEFAULT_GAPS_FILTERS: GapsFilterState = {
  dateFrom: '2026-06-01',
  dateTo: '2026-06-30',
  legalEntity: '',
  batch: '',
  rail: '',
  country: '',
  policy: '',
}

export const GAPS_FILTER_OPTIONS = {
  legalEntities: ['Acme Payments India'],
  batches: [{ id: DEMO_SMOKE_BATCH_ID, label: DEMO_BATCH_LABEL }],
  rails: ['NEFT', 'IMPS', 'RTGS'],
  countries: ['IN'],
  policies: ['POL-PAYOUT-CORE', 'POL-FEE-TOL'],
} as const

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatGapsInr(n: number): string {
  return formatInr(n)
}

function isoValueDate(label: string | null): string {
  if (!label) return '2026-06-12'
  if (label.startsWith('13')) return '2026-06-13'
  if (label.startsWith('14')) return '2026-06-14'
  return '2026-06-12'
}

function railCode(rail: string): string {
  if (rail.includes('IMPS')) return 'IMPS'
  if (rail.includes('RTGS')) return 'RTGS'
  return 'NEFT'
}

function gapRow(
  i: number,
  categoryId: GapCategoryId,
  categoryLabel: string,
  exposure: number,
): GapAffectedRow {
  const d = DEMO_DISPATCH_ROWS[i]!
  const s = DEMO_SETTLEMENT_ROWS[i]!
  return {
    id: `gap-${d.humanRef.toLowerCase()}`,
    paymentRef: d.humanRef,
    contractId: d.contractId,
    payeeLabel: d.payeeLabel,
    categoryId,
    categoryLabel,
    potentialExposureRupees: exposure,
    batchId: DEMO_SMOKE_BATCH_ID,
    legalEntity: 'Acme Payments India',
    country: 'IN',
    rail: railCode(d.route.rail),
    provider: d.route.provider.split('·')[0]?.trim() || 'HDFC',
    policy: categoryId === 'short_settled' ? 'POL-FEE-TOL' : 'POL-PAYOUT-CORE',
    valueDate: isoValueDate(s.valueDate),
    reviewHref:
      categoryId === 'unmatched_intent'
        ? `/settlement/journal?demo=sandbox&focus=${d.humanRef}`
        : `/settlement/review?demo=sandbox&gap=${categoryId}&focus=${d.humanRef}`,
  }
}

export const DEMO_GAP_ROWS: GapAffectedRow[] = DEMO_SETTLEMENT_ROWS.flatMap((s, i) => {
  const d = DEMO_DISPATCH_ROWS[i]
  if (!d?.sealed) return []
  if (s.outcome === 'Waiting') {
    return [gapRow(i, 'unmatched_intent', 'Unmatched intent', s.expectedRupees)]
  }
  if (s.outcome === 'Short') {
    const delta = Math.round((s.expectedRupees - (s.observedRupees ?? 0)) * 100) / 100
    return [gapRow(i, 'short_settled', 'Short-settled', delta)]
  }
  if (s.outcome === 'Returned' || s.outcome === 'Reversal') {
    return [gapRow(i, 'return_reversal', 'Return/reversal', s.expectedRupees)]
  }
  if (s.outcome === 'Missing reference') {
    return [gapRow(i, 'unresolved', 'Unresolved', s.expectedRupees)]
  }
  return []
})

/** Seed category cards - runtime filters recompute via `categoriesFromRows`. */
export const DEMO_GAP_CATEGORIES: GapCategory[] = [
  {
    id: 'unmatched_intent',
    label: 'Unmatched intent',
    valueRupees: INDIA_CASE.waitingValue,
    payoutCount: INDIA_CASE.waitingCount,
    outcomeFilter: 'Waiting',
    description: 'Dispatched intents without a linked settlement observation — waiting for credit confirmation. Same ₹ as Settlement “Waiting for settlement”.',
  },
  {
    id: 'short_settled',
    label: 'Short-settled',
    valueRupees: INDIA_CASE.shortDelta,
    payoutCount: INDIA_CASE.shortCount,
    outcomeFilter: 'Short',
    description: 'Observed credit below sealed expected amount — provider fee deductions.',
  },
  {
    id: 'over_settled',
    label: 'Over-settled',
    valueRupees: 0,
    payoutCount: 0,
    outcomeFilter: 'Over-settled',
    description: 'Observed credit above sealed expected amount.',
  },
  {
    id: 'unlinked_settlement',
    label: 'Unlinked settlement',
    valueRupees: 0,
    payoutCount: 0,
    outcomeFilter: 'Unresolved',
    description: 'Settlement signal present; not linked to a Payment Action Contract.',
  },
  {
    id: 'return_reversal',
    label: 'Return/reversal',
    valueRupees: INDIA_CASE.returnedValue + INDIA_CASE.reversalValue,
    payoutCount: INDIA_CASE.returnedCount + INDIA_CASE.reversalCount,
    outcomeFilter: 'Returned',
    description: 'Returned or reversed outcomes against sealed contracts.',
  },
  {
    id: 'unresolved',
    label: 'Unresolved',
    valueRupees: INDIA_CASE.missingRefValue,
    payoutCount: INDIA_CASE.missingRefCount,
    outcomeFilter: 'Unresolved',
    description: 'Match decision not yet final - missing reference or open investigation.',
  },
]

const CURRENT_GAP_EXPOSURE = DEMO_GAP_ROWS.reduce((s, r) => s + r.potentialExposureRupees, 0)

/** Historical observations for the trend - last point matches current filtered total. */
export const DEMO_GAP_TREND: GapTrendPoint[] = [
  { date: '01 Jun', valueRupees: Math.round(CURRENT_GAP_EXPOSURE * 0.41) },
  { date: '03 Jun', valueRupees: Math.round(CURRENT_GAP_EXPOSURE * 0.37) },
  { date: '05 Jun', valueRupees: Math.round(CURRENT_GAP_EXPOSURE * 0.49) },
  { date: '07 Jun', valueRupees: Math.round(CURRENT_GAP_EXPOSURE * 0.43) },
  { date: '09 Jun', valueRupees: Math.round(CURRENT_GAP_EXPOSURE * 0.59) },
  { date: '11 Jun', valueRupees: Math.round(CURRENT_GAP_EXPOSURE * 0.53) },
  { date: '13 Jun', valueRupees: CURRENT_GAP_EXPOSURE },
]

/**
 * Risk-adjusted payment exposure - Spec: only when live history exists.
 * Demo sandbox: model not production-worthy → surface as unavailable.
 */
export const DEMO_RISK_ADJUSTED = {
  available: false,
  reason:
    'Risk-adjusted payment exposure needs live history and a production-worthy model. Not shown until both exist.',
} as const

export function filterGapRows(rows: GapAffectedRow[], filters: GapsFilterState): GapAffectedRow[] {
  return rows.filter((r) => {
    if (filters.legalEntity && r.legalEntity !== filters.legalEntity) return false
    if (filters.batch && r.batchId !== filters.batch) return false
    if (filters.rail && r.rail !== filters.rail) return false
    if (filters.country && r.country !== filters.country) return false
    if (filters.policy && r.policy !== filters.policy) return false
    if (filters.dateFrom && r.valueDate < filters.dateFrom) return false
    if (filters.dateTo && r.valueDate > filters.dateTo) return false
    return true
  })
}

export function categoriesFromRows(rows: GapAffectedRow[]): GapCategory[] {
  return DEMO_GAP_CATEGORIES.map((cat) => {
    const matched = rows.filter((r) => r.categoryId === cat.id)
    return {
      ...cat,
      payoutCount: matched.length,
      valueRupees: Math.round(matched.reduce((s, r) => s + r.potentialExposureRupees, 0) * 100) / 100,
    }
  })
}

/** Exception exposure only — same total as Overview / Outcome Review (excludes waiting). */
export function valueRequiringReview(rows: GapAffectedRow[]): number {
  return (
    Math.round(
      rows
        .filter((r) => r.categoryId !== 'unmatched_intent')
        .reduce((s, r) => s + r.potentialExposureRupees, 0) * 100,
    ) / 100
  )
}

export function unmatchedWaitingValue(rows: GapAffectedRow[]): number {
  return (
    Math.round(
      rows
        .filter((r) => r.categoryId === 'unmatched_intent')
        .reduce((s, r) => s + r.potentialExposureRupees, 0) * 100,
    ) / 100
  )
}

/** Build Outcome Review deep-link preserving Gaps filters. */
export function outcomeReviewHref(
  gap: GapCategoryId | '',
  filters: GapsFilterState,
  focus?: string,
): string {
  const q = new URLSearchParams({ demo: 'sandbox' })
  if (gap) q.set('gap', gap)
  if (focus) q.set('focus', focus)
  if (filters.legalEntity) q.set('legal_entity', filters.legalEntity)
  if (filters.batch) q.set('batch', filters.batch)
  if (filters.rail) q.set('rail', filters.rail)
  if (filters.country) q.set('country', filters.country)
  if (filters.policy) q.set('policy', filters.policy)
  if (filters.dateFrom) q.set('date_from', filters.dateFrom)
  if (filters.dateTo) q.set('date_to', filters.dateTo)
  return `/settlement/review?${q.toString()}`
}

/** Waiting (unmatched) lives on Settlement Journal; exceptions open Outcome Review. */
export function gapDestinationHref(
  gap: GapCategoryId | '',
  filters: GapsFilterState,
  focus?: string,
): string {
  if (gap === 'unmatched_intent') {
    const q = new URLSearchParams({ demo: 'sandbox' })
    if (focus) q.set('focus', focus)
    return `/settlement/journal?${q.toString()}`
  }
  return outcomeReviewHref(gap, filters, focus)
}

export function loadStoredGapsFilters(): GapsFilterState {
  if (typeof window === 'undefined') return { ...DEFAULT_GAPS_FILTERS }
  try {
    const raw = window.sessionStorage.getItem(GAPS_FILTER_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_GAPS_FILTERS }
    return { ...DEFAULT_GAPS_FILTERS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_GAPS_FILTERS }
  }
}

export function storeGapsFilters(filters: GapsFilterState) {
  try {
    window.sessionStorage.setItem(GAPS_FILTER_STORAGE_KEY, JSON.stringify(filters))
  } catch {
    /* ignore */
  }
}
