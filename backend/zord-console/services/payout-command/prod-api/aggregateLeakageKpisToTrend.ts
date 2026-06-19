import { BACKEND_SERVICES } from '@/config/api.endpoints'
import type {
  DisbursementTrendBucket,
  DisbursementTrendRange,
} from './disbursementTrendTypes'
import type { LeakageKpiResolved, LeakageKpiResponse, MinorAmountField } from './intelligenceTypes'
import { trendWindowBounds } from './aggregateIntentsToTrend'

export type LeakageTrendBucketSpec = {
  key: string
  label: string
  from_date: string
  to_date: string
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
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

function lastDayOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
}

function readMinor(value: MinorAmountField | undefined | null): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function emptyTrendBucket(spec: LeakageTrendBucketSpec): DisbursementTrendBucket {
  return {
    key: spec.key,
    label: spec.label,
    total_amount: 0,
    confirmed_amount: 0,
    review_amount: 0,
    intent_count: 0,
    confirmed_count: 0,
  }
}

function mapLeakageToBucket(spec: LeakageTrendBucketSpec, body: LeakageKpiResolved): DisbursementTrendBucket {
  const intended = readMinor(body.total_intended_amount_minor)
  const confirmed = readMinor(body.total_observed_settled_amount_minor)
  const review_amount = readMinor(body.unmatched_amount_minor)

  return {
    key: spec.key,
    label: spec.label,
    total_amount: intended,
    confirmed_amount: confirmed,
    review_amount,
    intent_count: intended > 0 || confirmed > 0 ? 1 : 0,
    confirmed_count: confirmed > 0 ? 1 : 0,
  }
}

/** Rolling bucket windows aligned to the home chart — each maps to leakage dashboard date filters. */
export function buildLeakageTrendBucketSpecs(range: DisbursementTrendRange): LeakageTrendBucketSpec[] {
  const { from, to } = trendWindowBounds(range)
  const fromDay = startOfUtcDay(from)
  const toDay = startOfUtcDay(to)

  if (range === 'year') {
    const specs: LeakageTrendBucketSpec[] = []
    const anchor = new Date(toDay)
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1))
      const monthEnd = lastDayOfUtcMonth(monthStart)
      const mk = monthKey(monthStart)
      specs.push({
        key: mk,
        label: monthLabel(monthStart),
        from_date: toIsoDate(monthStart),
        to_date: toIsoDate(monthEnd > toDay ? toDay : monthEnd),
      })
    }
    return specs
  }

  if (range === 'quarter') {
    const specs: LeakageTrendBucketSpec[] = []
    for (let cursor = new Date(fromDay); cursor <= toDay; cursor = addUtcDays(cursor, 7)) {
      const weekStart = new Date(cursor)
      const weekEnd = addUtcDays(weekStart, 6)
      const end = weekEnd > toDay ? toDay : weekEnd
      const key = toIsoDate(weekStart)
      specs.push({
        key,
        label: weekStart.toLocaleString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        from_date: key,
        to_date: toIsoDate(end),
      })
    }
    return specs
  }

  // week + month → daily buckets (7 or 30 bars)
  const specs: LeakageTrendBucketSpec[] = []
  for (let d = new Date(fromDay); d <= toDay; d = addUtcDays(d, 1)) {
    const dk = toIsoDate(d)
    specs.push({
      key: dk,
      label: new Date(`${dk}T12:00:00.000Z`).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      from_date: dk,
      to_date: dk,
    })
  }
  return specs
}

async function fetchLeakageWindow(
  tenantId: string,
  spec: LeakageTrendBucketSpec,
): Promise<DisbursementTrendBucket> {
  const base = `${BACKEND_SERVICES.INTELLIGENCE.BASE_URL}${BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.LEAKAGE}`
  const params = new URLSearchParams({
    tenant_id: tenantId,
    from_date: spec.from_date,
    to_date: spec.to_date,
  })

  try {
    const upstream = await fetch(`${base}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      cache: 'no-store',
    })
    if (!upstream.ok) return emptyTrendBucket(spec)

    const body = (await upstream.json()) as LeakageKpiResponse
    if (!body?.data_available) return emptyTrendBucket(spec)
    return mapLeakageToBucket(spec, body)
  } catch {
    return emptyTrendBucket(spec)
  }
}

/**
 * Home chart series: one GET /v1/intelligence/dashboard/leakage per bucket window.
 * Maps total_intended → intended bar, total_observed_settled → bank-confirmed line.
 */
export async function fetchLeakageTrendFromIntelligence(
  tenantId: string,
  range: DisbursementTrendRange,
): Promise<DisbursementTrendBucket[]> {
  const specs = buildLeakageTrendBucketSpecs(range)
  if (!specs.length) return []
  return Promise.all(specs.map((spec) => fetchLeakageWindow(tenantId, spec)))
}
