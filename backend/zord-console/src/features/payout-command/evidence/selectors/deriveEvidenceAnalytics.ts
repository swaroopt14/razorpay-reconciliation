import type { PackTableRowVm } from '../types/evidenceViewModels'

export type EvidenceTypeSegment = { name: string; pct: number; color: string }

export type EvidenceTrendPoint = {
  /** X-axis tick (day of month). */
  day: string
  /** Tooltip / accessible label, e.g. "Apr 26". */
  label: string
  dateKey: string
  count: number
}

export const EVIDENCE_VOLUME_DAYS = 30

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Last 30 calendar days (today inclusive), one bar per day. */
export function buildVolumeHistogram(rows: PackTableRowVm[]): EvidenceTrendPoint[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tickFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric' })
  const labelFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

  const skeleton: EvidenceTrendPoint[] = []
  for (let offset = EVIDENCE_VOLUME_DAYS - 1; offset >= 0; offset--) {
    const d = new Date(today)
    d.setDate(d.getDate() - offset)
    skeleton.push({
      day: tickFmt.format(d),
      label: labelFmt.format(d),
      dateKey: toDateKey(d),
      count: 0,
    })
  }

  const counts = new Map<string, number>()
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - (EVIDENCE_VOLUME_DAYS - 1))

  for (const row of rows) {
    if (!row.generatedAt) continue
    const d = new Date(row.generatedAt)
    if (Number.isNaN(d.getTime())) continue
    d.setHours(0, 0, 0, 0)
    if (d < windowStart || d > today) continue
    const key = toDateKey(d)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return skeleton.map((p) => ({
    ...p,
    count: counts.get(p.dateKey) ?? 0,
  }))
}

export type EvidenceMixAreaPoint = {
  period: string
  [seriesKey: string]: string | number
}

export type EvidenceMixAreaSeries = {
  key: string
  name: string
  color: string
}

function segmentSeriesKey(name: string): string {
  const k = name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase()
  return k || 'other'
}

function statusBucket(proofStatusKey: PackTableRowVm['proofStatusKey']): string {
  if (proofStatusKey === 'proofReady' || proofStatusKey === 'verified' || proofStatusKey === 'exported') {
    return 'Complete'
  }
  if (proofStatusKey === 'needsReview') return 'Review'
  return 'Incomplete'
}

function buildMixAreaSeries(
  segments: EvidenceTypeSegment[],
  rows: PackTableRowVm[],
): { points: EvidenceMixAreaPoint[]; series: EvidenceMixAreaSeries[] } {
  const series = segments.map((seg) => ({
    key: segmentSeriesKey(seg.name),
    name: seg.name,
    color: seg.color,
  }))

  const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
  const byDay = new Map<string, Map<string, number>>()

  for (const row of rows) {
    if (!row.generatedAt) continue
    const d = new Date(row.generatedAt)
    if (Number.isNaN(d.getTime())) continue
    const period = dayFmt.format(d)
    const bucket = statusBucket(row.proofStatusKey)
    const dayMap = byDay.get(period) ?? new Map<string, number>()
    dayMap.set(bucket, (dayMap.get(bucket) ?? 0) + 1)
    byDay.set(period, dayMap)
  }

  const order = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const sorted = [...byDay.entries()].sort(
    (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]) || a[0].localeCompare(b[0]),
  )

  const points: EvidenceMixAreaPoint[] = sorted.map(([period, counts]) => {
    const point: EvidenceMixAreaPoint = { period }
    for (const seg of series) {
      point[seg.key] = counts.get(seg.name) ?? 0
    }
    return point
  })

  return { points, series }
}

const SEGMENT_COLORS = ['#000000', '#000000', '#cbd5e1', '#cbd5e1', '#f59e0b']

export function deriveEvidenceAnalytics(rows: PackTableRowVm[]): {
  segments: EvidenceTypeSegment[]
  trend: EvidenceTrendPoint[]
  mixArea: EvidenceMixAreaPoint[]
  mixSeries: EvidenceMixAreaSeries[]
  hasLiveData: boolean
} {
  if (rows.length === 0) {
    return {
      segments: [],
      trend: [],
      mixArea: [],
      mixSeries: [],
      hasLiveData: false,
    }
  }

  const statusBuckets = new Map<string, number>()
  for (const row of rows) {
    const key = statusBucket(row.proofStatusKey)
    statusBuckets.set(key, (statusBuckets.get(key) ?? 0) + 1)
  }

  const total = rows.length
  const segments: EvidenceTypeSegment[] = [...statusBuckets.entries()].map(([name, count], i) => ({
    name,
    pct: Math.round((count / total) * 100),
    color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
  }))

  const trend = buildVolumeHistogram(rows)
  const mix = buildMixAreaSeries(segments, rows)

  return {
    segments,
    trend,
    mixArea: mix.points,
    mixSeries: mix.series,
    hasLiveData: true,
  }
}
