import type { BackendIntent } from '@/services/backend/intents'
import type { DisbursementTrendBucket, DisbursementTrendRange } from './disbursementTrendTypes'

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

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })
}

/** Rolling window end = now (UTC), start derived from `range`. */
export function trendWindowBounds(range: DisbursementTrendRange): { from: Date; to: Date } {
  const to = new Date()
  const from = new Date(to)
  if (range === 'week') {
    from.setUTCDate(to.getUTCDate() - 7)
  } else if (range === 'month') {
    from.setUTCDate(to.getUTCDate() - 30)
  } else if (range === 'quarter') {
    from.setUTCDate(to.getUTCDate() - 91)
  } else {
    from.setUTCFullYear(to.getUTCFullYear() - 1)
  }
  return { from, to }
}

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

  if (range === 'year') {
    const map = new Map<string, DisbursementTrendBucket>()
    const anchor = new Date(toDay)
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1))
      const mk = monthKey(d)
      map.set(mk, emptyBucket(mk, monthLabel(d)))
    }
    for (const it of items) {
      if (!inWindow(it.created_at, from, to)) continue
      const t = new Date(it.created_at)
      const mk = monthKey(t)
      let b = map.get(mk)
      if (!b) {
        b = emptyBucket(mk, monthLabel(t))
        map.set(mk, b)
      }
      const minor = parseAmountMinor(it.amount)
      addIntentToBucket(b, minor, isConfirmedStatus(it.status))
    }
    const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
    finalizeBucketReviewAmounts(sorted)
    return sorted
  }

  if (range === 'quarter') {
    const map = new Map<string, DisbursementTrendBucket>()
    for (let cursor = new Date(fromDay); cursor <= toDay; cursor = addUtcDays(cursor, 7)) {
      const key = cursor.toISOString().slice(0, 10)
      map.set(
        key,
        emptyBucket(
          key,
          cursor.toLocaleString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        ),
      )
    }
    for (const it of items) {
      if (!inWindow(it.created_at, from, to)) continue
      const t = startOfUtcDay(new Date(it.created_at))
      const diffDays = Math.floor((t.getTime() - fromDay.getTime()) / 86400000)
      const weekIndex = Math.max(0, Math.floor(diffDays / 7))
      const ws = addUtcDays(fromDay, weekIndex * 7)
      const key = ws.toISOString().slice(0, 10)
      let b = map.get(key)
      if (!b) {
        b = emptyBucket(
          key,
          ws.toLocaleString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        )
        map.set(key, b)
      }
      const minor = parseAmountMinor(it.amount)
      addIntentToBucket(b, minor, isConfirmedStatus(it.status))
    }
    const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
    finalizeBucketReviewAmounts(sorted)
    return sorted
  }

  const dayKeys: string[] = []
  let d = new Date(fromDay)
  while (d <= toDay) {
    dayKeys.push(d.toISOString().slice(0, 10))
    d = addUtcDays(d, 1)
  }
  const map = new Map<string, DisbursementTrendBucket>()
  for (const dk of dayKeys) {
    map.set(
      dk,
      emptyBucket(
        dk,
        new Date(`${dk}T12:00:00.000Z`).toLocaleString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
      ),
    )
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
