import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { LeakageExposureTimeseriesResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import { coerceMinor } from './formatMinorInr'

export type LeakageComparisonChartPoint = {
  dateKey: string
  period: string
  label: string
  currentLeakageMinor: number
  predictedLeakageMinor: number
  isFuture: boolean
}

function formatPeriodLabel(isoDate: string, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)
  }
  const day = d.getDate()
  const month = d.getMonth() + 1
  return `${day}.${month < 10 ? `0${month}` : month}`
}

function formatTooltipLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

export function mapLeakageComparisonSeries(
  res: LeakageExposureTimeseriesResponse | null,
): {
  points: LeakageComparisonChartPoint[]
  projectStartAt: string | null
  live: boolean
} {
  if (!isDataAvailable(res) || !Array.isArray(res.series) || res.series.length === 0) {
    return { points: [], projectStartAt: null, live: false }
  }

  const granularity = res.granularity ?? 'day'
  const points = res.series.map((row) => ({
    dateKey: row.date,
    period: formatPeriodLabel(row.date, granularity),
    label: formatTooltipLabel(row.date),
    currentLeakageMinor: coerceMinor(row.current_leakage_minor),
    predictedLeakageMinor: coerceMinor(row.predicted_leakage_minor),
    isFuture: Boolean(row.is_future),
  }))

  return {
    points,
    projectStartAt: res.project_start_at ?? null,
    live: true,
  }
}
