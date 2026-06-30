import type { BackendIntent } from '@/services/backend/intents'
import type { DisbursementTrendBucket, DisbursementTrendRange } from './disbursementTrendTypes'
import { formatTrendBucketLabel } from './disbursementTrendLabels'
import { trendWindowBounds } from './disbursementTrendWindow'

export { trendWindowBounds } from './disbursementTrendWindow'

function parseAmountMinor(amount: string | number | null | undefined): number {
  if (amount == null || amount === '') return 0
  const n = typeof amount === 'number' ? amount : Number.parseFloat(String(amount))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100)
}

function isConfirmedStatus(status: string): boolean {
  const s = status.toUpperCase()
  return (
    s.includes('SETTL') ||
    s.includes('CONFIRM') ||
    s === 'COMPLETED' ||
    s === 'SUCCESS' ||
    s === 'SUCCEEDED' ||
    s === 'PAID'
  )
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

/** @see disbursementTrendWindow.trendWindowBounds */
function inWindow(iso: string, from: Date, to: Date): boolean {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return t >= from.getTime() && t <= to.getTime()
}

function emptyBucket(key: string, label: string): DisbursementTrendBucket {
  return {
    key,
    label,
    total_amount: 0,
    confirmed_amount: 0,
    review_amount: 0,
    intent_count: 0,
    confirmed_count: 0,
  }
}

function addIntentToBucket(b: DisbursementTrendBucket, minor: number, confirmed: boolean) {
  b.intent_count += 1
  b.total_amount += minor
  if (confirmed) {
    b.confirmed_count += 1
    b.confirmed_amount += minor
  }
}

function finalizeBucketReviewAmounts(_buckets: DisbursementTrendBucket[]) {
  // review_amount is not derived from intent aggregates — use leakage unmatched only.
}

/**
 * Buckets intents for the home trend chart. Amounts aggregated in **minor units** (paise).
 */
export function aggregateIntentsToTrend(
  items: BackendIntent[],
  range: DisbursementTrendRange,
): DisbursementTrendBucket[] {
  const { from, to } = trendWindowBounds(range)
  const fromDay = startOfUtcDay(from)
  const toDay = startOfUtcDay(to)

  const dayKeys: string[] = []
  let d = new Date(fromDay)
  while (d <= toDay) {
    dayKeys.push(d.toISOString().slice(0, 10))
    d = addUtcDays(d, 1)
  }
  const map = new Map<string, DisbursementTrendBucket>()
  for (const dk of dayKeys) {
    map.set(dk, emptyBucket(dk, formatTrendBucketLabel(dk, range)))
  }
  for (const it of items) {
    if (!inWindow(it.created_at, from, to)) continue
    const dk = it.created_at.slice(0, 10)
    let b = map.get(dk)
    if (!b) {
      b = emptyBucket(dk, dk)
      map.set(dk, b)
    }
    const minor = parseAmountMinor(it.amount)
    addIntentToBucket(b, minor, isConfirmedStatus(it.status))
  }
  const rows = dayKeys.map((k) => map.get(k)!).filter(Boolean)
  finalizeBucketReviewAmounts(rows)
  return rows
}
