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

/** Two-bucket status mix driven by the batch's payment-intent count:
 *  Complete   = total payment intents in the batch (each payment that has proof)
 *  Incomplete = total evidence packs − total intents (packs beyond covered intents)
 *  Packs are classified chronologically so the daily area still sums to pack volume. */
const COMPLETE_BUCKET = 'Complete'
const INCOMPLETE_BUCKET = 'Incomplete'
const BUCKET_COLOR: Record<string, string> = {
  [COMPLETE_BUCKET]: '#0f172a',
  [INCOMPLETE_BUCKET]: '#f59e0b',
}

function buildMixAreaSeries(
  segments: EvidenceTypeSegment[],
  classified: { row: PackTableRowVm; bucket: string }[],
): { points: EvidenceMixAreaPoint[]; series: EvidenceMixAreaSeries[] } {
  const series = segments.map((seg) => ({
    key: segmentSeriesKey(seg.name),
    name: seg.name,
    color: seg.color,
  }))

  const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
  const byDay = new Map<string, Map<string, number>>()

  for (const { row, bucket } of classified) {
    if (!row.generatedAt) continue
    const d = new Date(row.generatedAt)
    if (Number.isNaN(d.getTime())) continue
    const period = dayFmt.format(d)
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

export function deriveEvidenceAnalytics(
  rows: PackTableRowVm[],
  totalIntents: number | null,
): {
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

  const totalPacks = rows.length
  // Complete = total intents (capped at pack count); Incomplete = the remaining packs.
  const completeCount =
    totalIntents != null ? Math.max(0, Math.min(totalIntents, totalPacks)) : totalPacks
  const incompleteCount = Math.max(0, totalPacks - completeCount)

  // Classify packs chronologically: first `completeCount` count as Complete, rest Incomplete.
  const ordered = [...rows].sort((a, b) =>
    (a.generatedAt ?? '').localeCompare(b.generatedAt ?? ''),
  )
  const classified = ordered.map((row, i) => ({
    row,
    bucket: i < completeCount ? COMPLETE_BUCKET : INCOMPLETE_BUCKET,
  }))

  const segments: EvidenceTypeSegment[] = [
    { name: COMPLETE_BUCKET, count: completeCount },
    { name: INCOMPLETE_BUCKET, count: incompleteCount },
  ]
    .filter((seg) => seg.count > 0)
    .map((seg) => ({
      name: seg.name,
      pct: Math.round((seg.count / totalPacks) * 100),
      color: BUCKET_COLOR[seg.name],
    }))

  const trend = buildVolumeHistogram(rows)
  const mix = buildMixAreaSeries(segments, classified)

  return {
    segments,
    trend,
    mixArea: mix.points,
    mixSeries: mix.series,
    hasLiveData: true,
  }
}
