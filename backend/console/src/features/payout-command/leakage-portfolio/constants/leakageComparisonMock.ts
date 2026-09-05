import type { LeakageComparisonChartPoint } from '../utils/mapLeakageComparisonSeries'

const DAY_BUCKETS = 30

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Fallback preview dual-series when upstream returns data_available: false or empty series. */
export function buildLeakageComparisonMock(
  intendedMinor: number,
  granularity: 'day' | 'week' | 'month' = 'day',
): LeakageComparisonChartPoint[] {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const base = Math.max(intendedMinor * 0.08, 500_000)
  const bucketCount =
    granularity === 'month' ? 12 : granularity === 'week' ? 12 : DAY_BUCKETS
  const stepDays = granularity === 'month' ? 30 : granularity === 'week' ? 7 : 1

  const points: LeakageComparisonChartPoint[] = []
  for (let i = bucketCount - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i * stepDays)
    const dateKey = toDateKey(d)
    const day = d.getDate()
    const month = d.getMonth() + 1
    const period =
      granularity === 'month'
        ? new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)
        : `${day}.${month < 10 ? `0${month}` : month}`
    const label = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d)

    const t = (bucketCount - i) / bucketCount
    const wave = Math.sin(t * 4.2) * 0.12 + 1
    const isFuture = i < Math.floor(bucketCount * 0.25)
    const current = Math.round(base * wave * (0.92 + (i % 5) * 0.03))
    const predicted = Math.round(current * (isFuture ? 1.08 + (i % 3) * 0.02 : 0.96 + (i % 4) * 0.01))

    points.push({
      dateKey,
      period,
      label,
      currentLeakageMinor: isFuture ? Math.round(current * 0.85) : current,
      predictedLeakageMinor: predicted,
      isFuture,
    })
  }

  return points
}

/** ISO date for mock "project start" (~75% through preview window). */
export function mockProjectStartAt(points: LeakageComparisonChartPoint[]): string | null {
  if (points.length < 4) return null
  const idx = Math.floor(points.length * 0.75)
  const dateKey = points[idx]?.dateKey
  return dateKey ? `${dateKey}T00:00:00.000Z` : null
}
