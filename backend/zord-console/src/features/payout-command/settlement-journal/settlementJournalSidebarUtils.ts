import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'
import {
  isFailedObservationStatus,
  isSettledObservationStatus,
  mapSettlementObservationStatus,
} from './settlementObservationStatusMap'

export type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'ytd'

export type SettlementSidebarOutcome = {
  total: number
  settled: number
  failed: number
  settledPct: number | null
  label: 'Settled' | 'Partial' | 'Failed' | 'Unknown'
  dotClass: string
  progressPct: number
  toneText: string
  barClass: string
}

export {
  isFailedObservationStatus,
  isSettledObservationStatus,
  mapSettlementObservationStatus,
} from './settlementObservationStatusMap'

export const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
]

export const AMOUNT_RANGE_OPTIONS = [
  'All',
  'Under ₹10,000',
  '₹10,000 – ₹1,00,000',
  'Over ₹1,00,000',
] as const

export type AmountRangeFilter = (typeof AMOUNT_RANGE_OPTIONS)[number]

export function observationInDateRange(observationTime: string, preset: DateRangePreset): boolean {
  if (preset === 'all') return true
  const parsed = Date.parse(observationTime)
  if (!Number.isFinite(parsed)) return true
  const observed = new Date(parsed)
  const now = new Date()
  const start = new Date(now)
  if (preset === '7d') start.setDate(now.getDate() - 7)
  else if (preset === '30d') start.setDate(now.getDate() - 30)
  else if (preset === '90d') start.setDate(now.getDate() - 90)
  else if (preset === 'ytd') start.setMonth(0, 1)
  start.setHours(0, 0, 0, 0)
  return observed >= start
}

export function matchesAmountRange(amount: number, range: AmountRangeFilter): boolean {
  if (range === 'All') return true
  if (range === 'Under ₹10,000') return amount < 10_000
  if (range === '₹10,000 – ₹1,00,000') return amount >= 10_000 && amount <= 100_000
  return amount > 100_000
}

export function outcomeFromMatchConfidence(matchConfidence: number | null | undefined): SettlementSidebarOutcome {
  if (matchConfidence == null || !Number.isFinite(matchConfidence)) {
    return {
      total: 0,
      settled: 0,
      failed: 0,
      settledPct: null,
      label: 'Partial',
      dotClass: 'bg-slate-300',
      progressPct: 0,
      toneText: 'text-slate-600',
      barClass: 'bg-slate-400',
    }
  }

  const score = matchConfidence <= 1 ? matchConfidence : matchConfidence / 100
  const progressPct = Math.round(Math.min(100, Math.max(0, score * 100)))
  let label: SettlementSidebarOutcome['label'] = 'Partial'
  if (score >= 0.75) label = 'Settled'
  else if (score < 0.5) label = 'Failed'

  let dotClass = 'bg-amber-500'
  let toneText = 'text-amber-700'
  let barClass = 'bg-amber-500'
  if (score >= 0.75) {
    dotClass = 'bg-black'
    toneText = 'text-black'
    barClass = 'bg-black'
  } else if (score < 0.5) {
    dotClass = 'bg-rose-500'
    toneText = 'text-rose-700'
    barClass = 'bg-rose-500'
  }

  return {
    total: 0,
    settled: 0,
    failed: 0,
    settledPct: progressPct,
    label,
    dotClass,
    progressPct,
    toneText,
    barClass,
  }
}

export function outcomeFromObservationRows(rows: SettlementObservationTableRow[]): SettlementSidebarOutcome {
  const total = rows.length
  if (total === 0) {
    return {
      total: 0,
      settled: 0,
      failed: 0,
      settledPct: null,
      label: 'Partial',
      dotClass: 'bg-slate-300',
      progressPct: 0,
      toneText: 'text-slate-600',
      barClass: 'bg-slate-400',
    }
  }
  const settled = rows.filter((r) => isSettledObservationStatus(r.statusRaw)).length
  const failed = rows.filter((r) => isFailedObservationStatus(r.statusRaw)).length
  const known = rows.filter((r) => mapSettlementObservationStatus(r.statusRaw).known).length
  const settledPct = total > 0 ? Math.round((settled / total) * 100) : null
  let label: SettlementSidebarOutcome['label'] = 'Partial'
  // CON-P1-24: unknown statuses never upgrade the batch to Settled.
  if (known === 0) label = 'Unknown'
  else if (failed > 0 && failed >= settled) label = 'Failed'
  else if (settled === total) label = 'Settled'

  const failedRatio = failed / total
  const settledRatio = settled / total
  let dotClass = 'bg-amber-500'
  let toneText = 'text-amber-700'
  let barClass = 'bg-amber-500'
  if (label === 'Unknown') {
    dotClass = 'bg-slate-400'
    toneText = 'text-slate-600'
    barClass = 'bg-slate-400'
  } else if (failedRatio >= 0.5 || (failed > 0 && settled === 0)) {
    dotClass = 'bg-rose-500'
    toneText = 'text-rose-700'
    barClass = 'bg-rose-500'
  } else if (settledRatio >= 0.8 && failed === 0) {
    dotClass = 'bg-black'
    toneText = 'text-black'
    barClass = 'bg-black'
  }

  return {
    total,
    settled,
    failed,
    settledPct,
    label,
    dotClass,
    progressPct: settledPct ?? 0,
    toneText,
    barClass,
  }
}

export function settlementStatusBadgeClass(statusRaw: string) {
  const { bucket } = mapSettlementObservationStatus(statusRaw)
  if (bucket === 'settled') {
    return 'inline-flex rounded-full border border-black/30 bg-black px-2.5 py-0.5 text-[12px] font-semibold text-white'
  }
  if (bucket === 'failed') {
    return 'inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[12px] font-semibold text-rose-800'
  }
  if (bucket === 'pending') {
    return 'inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-900'
  }
  // unknown / Needs mapping — never styled as settled success
  return 'inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-700'
}

export { settlementStatusDisplayLabel } from './settlementObservationStatusMap'

export function computeSettlementBatchSummary(rows: SettlementObservationTableRow[]) {
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0)
  const totalSettled = rows.reduce((sum, r) => sum + r.settledAmount, 0)
  const totalFees = rows.reduce((sum, r) => sum + r.feeAmount, 0)
  const outcome = outcomeFromObservationRows(rows)
  return { totalAmount, totalSettled, totalFees, outcome }
}
