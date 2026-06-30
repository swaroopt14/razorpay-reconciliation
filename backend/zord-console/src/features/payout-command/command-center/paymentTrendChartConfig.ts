import type { PaymentTrendChartPoint } from './PaymentValueTrendChart'
import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'

/** Chart period tabs — calendar windows (see disbursementTrendWindow.ts). */
export type PaymentTrendGranularity = DisbursementTrendRange

export const PAYMENT_TREND_GRANULARITY: Record<PaymentTrendGranularity, { label: string }> = {
  week: { label: 'Week' },
  month: { label: 'Month' },
  quarter: { label: 'Quarter' },
  year: { label: 'Year' },
}

export const PAYMENT_TREND_GRAN_ORDER: PaymentTrendGranularity[] = ['week', 'month', 'quarter', 'year']

/** Bar width from slot spacing — wider when the visible window has fewer days (auto-zoom). */
export function paymentTrendBarWidthPx(spacing: number): number {
  return Math.max(2, Math.min(14, spacing * 0.58))
}

/** True when this bucket has any payment signal from the API. */
export function trendPointHasData(point: PaymentTrendChartPoint): boolean {
  return point.intendedMinor > 0 || point.confirmedMinor > 0 || point.reviewMinor > 0
}

/** Each tab shows its full rolling window — density from bucket count (7/30/90/365), not auto-zoom. */
export function computeDataFocusedBrushRange(
  _points: PaymentTrendChartPoint[],
  _range?: DisbursementTrendRange,
): { a: number; b: number } {
  return { a: 0, b: 1 }
}

/** Max x-axis tick labels per tab so week/month/quarter/year read differently. */
export function paymentTrendMaxAxisLabels(range: DisbursementTrendRange): number {
  if (range === 'week') return 7
  if (range === 'month') return 10
  if (range === 'quarter') return 12
  return 12
}

export function mapDisbursementBucketsToTrendPoints(
  buckets: Array<{
    label?: string | null
    total_amount?: number | string | null
    confirmed_amount?: number | string | null
    review_amount?: number | string | null
  }>,
): PaymentTrendChartPoint[] {
  /** Passthrough only — one chart point per leakage API bucket; no client math or fill. */
  return buckets.map((b) => ({
    label: b.label?.trim() || '—',
    intendedMinor: Number(b.total_amount) || 0,
    confirmedMinor: Number(b.confirmed_amount) || 0,
    reviewMinor: Number(b.review_amount) || 0,
  }))
}
