import type { DisbursementTrendRange } from './disbursementTrendTypes'

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function lastDayOfUtcMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0))
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Current calendar quarter start month (0=Jan, 3=Apr, 6=Jul, 9=Oct). */
export function currentUtcQuarterStartMonth(now = new Date()): number {
  return Math.floor(now.getUTCMonth() / 3) * 3
}

/**
 * Chart window bounds (UTC):
 * - week: last 7 days inclusive (e.g. 16 Jun–22 Jun when today is 22 Jun)
 * - month: 1st–last day of current calendar month
 * - quarter: current calendar quarter (Q1 Jan–Mar, Q2 Apr–Jun, …)
 * - year: 1 Jan–31 Dec of current calendar year
 */
export function trendWindowBounds(range: DisbursementTrendRange, now = new Date()): { from: Date; to: Date } {
  const today = startOfUtcDay(now)
  const year = today.getUTCFullYear()

  if (range === 'week') {
    const from = new Date(today)
    from.setUTCDate(today.getUTCDate() - 6)
    return { from, to: today }
  }

  if (range === 'month') {
    const from = new Date(Date.UTC(year, today.getUTCMonth(), 1))
    const to = lastDayOfUtcMonth(year, today.getUTCMonth())
    return { from, to }
  }

  if (range === 'quarter') {
    const qStartMonth = currentUtcQuarterStartMonth(today)
    const from = new Date(Date.UTC(year, qStartMonth, 1))
    const to = lastDayOfUtcMonth(year, qStartMonth + 2)
    return { from, to }
  }

  const from = new Date(Date.UTC(year, 0, 1))
  const to = lastDayOfUtcMonth(year, 11)
  return { from, to }
}

export function trendWindowDateQuery(
  range: DisbursementTrendRange,
  now = new Date(),
): { from_date: string; to_date: string } {
  const { from, to } = trendWindowBounds(range, now)
  return { from_date: toIsoDate(from), to_date: toIsoDate(to) }
}

/** Inclusive day count for a range (for tests / diagnostics). */
export function trendWindowDayCount(range: DisbursementTrendRange, now = new Date()): number {
  const { from, to } = trendWindowBounds(range, now)
  const ms = to.getTime() - from.getTime()
  return Math.floor(ms / 86_400_000) + 1
}
