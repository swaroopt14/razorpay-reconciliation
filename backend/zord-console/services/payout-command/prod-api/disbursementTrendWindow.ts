import type { DisbursementTrendRange } from './disbursementTrendTypes'
import {
  businessTrendWindowYmd,
  DEFAULT_TENANT_BUSINESS_TIMEZONE,
  resolveTenantBusinessTimezone,
} from '@/services/payout-command/tenantBusinessTimezone'

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function lastDayOfUtcMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0))
}

/** @deprecated Prefer business-TZ windows via trendWindowDateQuery(..., timeZone). */
export function currentUtcQuarterStartMonth(now = new Date()): number {
  return Math.floor(now.getUTCMonth() / 3) * 3
}

/**
 * Chart window bounds — CON-P1-29: civil dates in tenant business timezone
 * (not UTC/browser local day boundaries).
 */
export function trendWindowBounds(
  range: DisbursementTrendRange,
  now = new Date(),
  timeZone: string = DEFAULT_TENANT_BUSINESS_TIMEZONE,
): { from: Date; to: Date } {
  const tz = resolveTenantBusinessTimezone(timeZone)
  const { from_date, to_date } = businessTrendWindowYmd(range, tz, now)
  // Noon UTC on the civil YMD avoids DST edge issues when converting labels/buckets.
  const from = new Date(`${from_date}T12:00:00.000Z`)
  const to = new Date(`${to_date}T12:00:00.000Z`)
  if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
    return { from, to }
  }
  // Fallback UTC (legacy)
  const today = startOfUtcDay(now)
  const year = today.getUTCFullYear()
  if (range === 'week') {
    const weekFrom = new Date(today)
    weekFrom.setUTCDate(today.getUTCDate() - 6)
    return { from: weekFrom, to: today }
  }
  if (range === 'month') {
    return {
      from: new Date(Date.UTC(year, today.getUTCMonth(), 1)),
      to: lastDayOfUtcMonth(year, today.getUTCMonth()),
    }
  }
  if (range === 'quarter') {
    const qStartMonth = currentUtcQuarterStartMonth(today)
    return {
      from: new Date(Date.UTC(year, qStartMonth, 1)),
      to: lastDayOfUtcMonth(year, qStartMonth + 2),
    }
  }
  return { from: new Date(Date.UTC(year, 0, 1)), to: lastDayOfUtcMonth(year, 11) }
}

export function trendWindowDateQuery(
  range: DisbursementTrendRange,
  now = new Date(),
  timeZone: string = DEFAULT_TENANT_BUSINESS_TIMEZONE,
): { from_date: string; to_date: string } {
  return businessTrendWindowYmd(range, resolveTenantBusinessTimezone(timeZone), now)
}

/** Inclusive day count for a range (for tests / diagnostics). */
export function trendWindowDayCount(
  range: DisbursementTrendRange,
  now = new Date(),
  timeZone: string = DEFAULT_TENANT_BUSINESS_TIMEZONE,
): number {
  const { from_date, to_date } = trendWindowDateQuery(range, now, timeZone)
  const from = new Date(`${from_date}T12:00:00.000Z`)
  const to = new Date(`${to_date}T12:00:00.000Z`)
  const ms = to.getTime() - from.getTime()
  return Math.floor(ms / 86_400_000) + 1
}
