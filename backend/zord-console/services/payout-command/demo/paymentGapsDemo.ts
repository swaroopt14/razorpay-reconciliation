/**
 * Payment Gaps data module — API-backed via intelligence leakage + timeseries.
 * Surfaces keep importing DEMO_GAP_ROWS / DEMO_GAP_TREND; this module loads live data.
 * Row list stays empty when upstream has no per-payment categories (no fake filler).
 */

import { notifyDemoDataListeners } from './demoBatchReadiness'
import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import { getLeakageKpis } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { getLeakageExposureTimeseries } from '@/services/payout-command/prod-api/getLeakageExposureTimeseries'
import { coerceMinor } from '@/features/payout-command/leakage-portfolio/utils/formatMinorInr'
import type { LeakageKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'

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

export const GAPS_FILTER_STORAGE_KEY = 'zord_settlement_gaps_filters'

export const DEFAULT_GAPS_FILTERS: GapsFilterState = {
  dateFrom: '2026-06-01',
  dateTo: '2026-06-14',
  legalEntity: '',
  batch: '',
  rail: '',
  country: '',
  policy: '',
}

export const GAPS_FILTER_OPTIONS = {
  legalEntities: ['Acme Payments India', 'Acme Payments SG'],
  batches: [{ id: DEMO_SMOKE_BATCH_ID, label: DEMO_BATCH_LABEL }],
  rails: ['NEFT', 'IMPS', 'RTGS'],
  countries: ['IN', 'SG'],
  policies: ['POL-PAYOUT-CORE', 'POL-VENDOR-STD', 'POL-FEE-TOL'],
} as const

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatGapsInr(n: number): string {
  return formatInr(n)
}

const CATEGORY_META: Array<Omit<GapCategory, 'valueRupees' | 'payoutCount'> & { id: GapCategoryId }> =
  [
    {
      id: 'unmatched_intent',
      label: 'Unmatched intent',
      outcomeFilter: 'Unresolved',
      description: 'Sealed or dispatched intents without a linked settlement observation.',
    },
    {
      id: 'short_settled',
      label: 'Short-settled',
      outcomeFilter: 'Short-settled',
      description: 'Observed credit below sealed expected amount.',
    },
    {
      id: 'over_settled',
      label: 'Over-settled',
      outcomeFilter: 'Over-settled',
      description: 'Observed credit above sealed expected amount.',
    },
    {
      id: 'unlinked_settlement',
      label: 'Unlinked settlement',
      outcomeFilter: 'Unresolved',
      description: 'Settlement signal present; not linked to a Payment Action Contract.',
    },
    {
      id: 'return_reversal',
      label: 'Return/reversal',
      outcomeFilter: 'Returned',
      description: 'Returned or reversed outcomes against sealed contracts.',
    },
    {
      id: 'unresolved',
      label: 'Unresolved',
      outcomeFilter: 'Unresolved',
      description: 'Match decision not yet final - missing reference or open investigation.',
    },
  ]

/** Empty until/unless upstream exposes per-payment gap rows (no fake filler). */
export let DEMO_GAP_ROWS: GapAffectedRow[] = []

/** Category cards seeded from leakage KPI buckets when row-level data is absent. */
export let DEMO_GAP_CATEGORIES: GapCategory[] = CATEGORY_META.map((cat) => ({
  ...cat,
  valueRupees: 0,
  payoutCount: 0,
}))

export let DEMO_GAP_TREND: GapTrendPoint[] = []

/**
 * Risk-adjusted payment exposure - Spec: only when live history exists.
 * Surface has no value branch when available; keep unavailable until UI can render it.
 */
export const DEMO_RISK_ADJUSTED = {
  available: false,
  reason:
    'Risk-adjusted payment exposure needs live history and a production-worthy model. Not shown until both exist.',
} as const

let liveHeroRupees = 0
let loadPromise: Promise<void> | null = null
let loadGeneration = 0

function formatTrendDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function categoriesFromLeakage(kpi: LeakageKpiResolved): GapCategory[] {
  const unmatched = coerceMinor(kpi.unmatched_amount_minor)
  const short = coerceMinor(kpi.under_settlement_amount_minor)
  const over = coerceMinor(kpi.over_settlement_amount_minor)
  const orphan = coerceMinor(kpi.orphan_amount_minor)
  const reversal = coerceMinor(kpi.reversal_exposure_minor)
  const unresolved = coerceMinor(kpi.unresolved_amount_minor)

  const values: Record<GapCategoryId, number> = {
    unmatched_intent: unmatched,
    short_settled: short,
    over_settled: over,
    unlinked_settlement: orphan,
    return_reversal: reversal,
    unresolved,
  }

  return CATEGORY_META.map((cat) => ({
    ...cat,
    valueRupees: values[cat.id] ?? 0,
    /** KPI is aggregate — no reliable payout count without row data. */
    payoutCount: values[cat.id] > 0 ? 1 : 0,
  }))
}

export async function loadPaymentGapsDemoData(): Promise<void> {
  const generation = ++loadGeneration
  const [leakage, timeseries] = await Promise.all([
    getLeakageKpis(),
    getLeakageExposureTimeseries({ granularity: 'day' }),
  ])
  if (generation !== loadGeneration) return

  // No per-payment category feed on leakage KPI — keep rows empty (no fake filler).
  DEMO_GAP_ROWS = []

  if (leakage && 'data_available' in leakage && leakage.data_available) {
    DEMO_GAP_CATEGORIES = categoriesFromLeakage(leakage)
    liveHeroRupees = DEMO_GAP_CATEGORIES.reduce((s, c) => s + c.valueRupees, 0)
  } else {
    DEMO_GAP_CATEGORIES = CATEGORY_META.map((cat) => ({
      ...cat,
      valueRupees: 0,
      payoutCount: 0,
    }))
    liveHeroRupees = 0
  }

  if (timeseries && 'data_available' in timeseries && timeseries.data_available) {
    DEMO_GAP_TREND = (timeseries.series ?? []).map((p) => ({
      date: formatTrendDate(p.date),
      valueRupees: coerceMinor(p.current_leakage_minor),
    }))
  } else {
    DEMO_GAP_TREND = []
  }

  notifyDemoDataListeners()
}

export function ensurePaymentGapsDemoLoaded(): void {
  if (typeof window === 'undefined') return
  if (loadPromise) return
  loadPromise = loadPaymentGapsDemoData().catch(() => {
    DEMO_GAP_ROWS = []
    DEMO_GAP_TREND = []
    notifyDemoDataListeners()
  })
}

if (typeof window !== 'undefined') {
  ensurePaymentGapsDemoLoaded()
}

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
  if (rows.length === 0) {
    return DEMO_GAP_CATEGORIES.map((cat) => ({ ...cat }))
  }
  return CATEGORY_META.map((cat) => {
    const matched = rows.filter((r) => r.categoryId === cat.id)
    return {
      ...cat,
      payoutCount: matched.length,
      valueRupees: matched.reduce((s, r) => s + r.potentialExposureRupees, 0),
    }
  })
}

export function valueRequiringReview(rows: GapAffectedRow[]): number {
  if (rows.length === 0) return liveHeroRupees
  return rows.reduce((s, r) => s + r.potentialExposureRupees, 0)
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
