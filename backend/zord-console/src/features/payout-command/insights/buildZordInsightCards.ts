import type { DisbursementTrendResponse } from '@/services/payout-command/prod-api/disbursementTrendTypes'
import type { LeakageKpiResolved, PatternsKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { fmtInrFromMinorExact } from '../command-center/commandCenterFormat'
import type { InsightDelta, ZordInsightCard } from './zordInsightCarouselTypes'

function readMinor(value: string | number | undefined | null): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function bucketDelta(buckets: DisbursementTrendResponse['buckets']): InsightDelta | undefined {
  if (!buckets || buckets.length < 2) return undefined
  const a0 = Number(buckets[buckets.length - 2]?.total_amount) || 0
  const a1 = Number(buckets[buckets.length - 1]?.total_amount) || 0
  if (a0 <= 0) return undefined
  const raw = ((a1 - a0) / a0) * 100
  return { pct: Math.abs(raw), dir: raw >= 0 ? 'up' : 'down', label: 'vs prior bucket' }
}

/**
 * Maps live intelligence + disbursement trend payloads into carousel cards.
 * While `kpiLoading` is true, returns [] so the carousel can show a skeleton.
 * When KPIs are ready but there is no signal, returns the two reference slides:
 * Account Insights (empty copy) + Active Mismatch (headline + subtext from parent).
 */
export function buildZordInsightCards(params: {
  tenantReady: boolean
  kpiLoading: boolean
  emptyInsightParagraph: string
  mismatchHeadline: string
  mismatchSubtext: string
  reviewValueMinor: number | null
  mismatchPendingCount: number
  trendInsight: string
  trendSeries: DisbursementTrendResponse | null | undefined
  trendChartReady: boolean
  leakageData: LeakageKpiResolved | null
  patternsData: PatternsKpiResolved | null
}): ZordInsightCard[] {
  const {
    tenantReady,
    kpiLoading,
    emptyInsightParagraph,
    mismatchHeadline,
    mismatchSubtext,
    reviewValueMinor,
    mismatchPendingCount,
    trendInsight,
    trendSeries,
    trendChartReady,
    leakageData,
    patternsData,
  } = params

  if (!tenantReady) return []
  if (kpiLoading) return []

  const hasSignal = Boolean(trendChartReady || leakageData || patternsData)

  if (!hasSignal) {
    return [
      {
        type: 'insight',
        id: 'account-insights',
        label: 'Account Insights',
        paragraph: emptyInsightParagraph,
      },
      {
        type: 'metric',
        id: 'mismatch-value',
        label: 'Value Needing Review',
        valueRupee: 0,
        valueDisplay: mismatchHeadline,
        subtext: mismatchSubtext,
        count: mismatchPendingCount,
        countLabel: 'transactions pending',
      },
    ]
  }

  const cards: ZordInsightCard[] = []

  cards.push({
    type: 'insight',
    id: 'account-insights',
    label: 'Account Insights',
    paragraph: trendInsight,
    delta: trendChartReady ? bucketDelta(trendSeries?.buckets ?? []) : undefined,
  })

  if (leakageData) {
    const mismatchMinor = reviewValueMinor ?? 0
    cards.push({
      type: 'metric',
      id: 'mismatch-value',
      label: 'Value Needing Review',
      valueRupee: mismatchMinor,
      valueDisplay: reviewValueMinor == null ? '—' : fmtInrFromMinorExact(reviewValueMinor),
      subtext: patternsData
        ? `${patternsData.pending_count} intents pending in latest batch signal`
        : reviewValueMinor != null
          ? 'Payment value in review from ambiguity engine'
          : 'No ambiguity value-at-risk data available',
      count: patternsData?.pending_count ?? 0,
      countLabel: 'transactions pending',
    })
  }

  if (trendChartReady && trendSeries?.buckets?.length) {
    const rawSpark = trendSeries.buckets.map((bucket, i) => ({
      w: bucket.label?.trim() || `P${i + 1}`,
      v: Math.max(0, Number(bucket.total_amount) || 0),
    }))
    const totalMinor = rawSpark.reduce((s, p) => s + p.v, 0)
    const maxV = Math.max(...rawSpark.map((s) => s.v), 1)
    const spark = rawSpark.map((s) => ({ w: s.w, v: Math.round((s.v / maxV) * 100) }))

    cards.push({
      type: 'trend',
      id: 'disbursement-trend',
      label: 'Payment Value Trend',
      spark,
      currentValueRupee: totalMinor,
      delta: bucketDelta(trendSeries.buckets),
    })
  }

  if (patternsData && patternsData.total_count > 0) {
    const exposureMinor = leakageData ? readMinor(leakageData.unmatched_amount_minor) : 0
    cards.push({
      type: 'alert',
      id: 'leakage',
      label: 'Payments needing attention',
      count: patternsData.pending_count,
      topPattern: `${patternsData.anomaly_level} · ${(patternsData.batch_anomaly_score * 100).toFixed(0)}% batch signal`,
      exposureRupee: exposureMinor,
    })
  }

  return cards
}
