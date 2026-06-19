import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'

/** Unified period for Payment Command Center KPIs + chart. */
export type CommandCenterPeriod = 'week' | 'month' | 'quarter' | 'year'

/** Insight carousel period (separate from main command-center period). */
export type CarouselInsightPeriod = 'daily' | 'weekly' | 'quarterly'

export type IntelligenceDateQuery = {
  from_date: string
  to_date: string
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dateRangeFromDaysBack(days: number): IntelligenceDateQuery {
  const to = new Date()
  const from = new Date(to)
  from.setUTCDate(to.getUTCDate() - days)
  return { from_date: toIsoDate(from), to_date: toIsoDate(to) }
}

export function commandPeriodToDateRange(period: CommandCenterPeriod): IntelligenceDateQuery {
  if (period === 'week') return dateRangeFromDaysBack(7)
  if (period === 'month') return dateRangeFromDaysBack(30)
  if (period === 'quarter') return dateRangeFromDaysBack(91)
  return dateRangeFromDaysBack(365)
}

export function commandPeriodToTrendRange(period: CommandCenterPeriod): DisbursementTrendRange {
  if (period === 'week') return 'week'
  if (period === 'month') return 'month'
  if (period === 'quarter') return 'quarter'
  return 'year'
}

export function carouselPeriodToDateRange(period: CarouselInsightPeriod): IntelligenceDateQuery {
  if (period === 'daily') return dateRangeFromDaysBack(1)
  if (period === 'weekly') return dateRangeFromDaysBack(7)
  return dateRangeFromDaysBack(91)
}

export function carouselPeriodToTrendRange(period: CarouselInsightPeriod): DisbursementTrendRange {
  if (period === 'daily') return 'week'
  if (period === 'weekly') return 'week'
  return 'quarter'
}

export const COMMAND_CENTER_PERIOD_OPTIONS: readonly { id: CommandCenterPeriod; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
] as const

export const CAROUSEL_INSIGHT_PERIOD_OPTIONS: readonly { id: CarouselInsightPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'quarterly', label: 'Quarterly' },
] as const
