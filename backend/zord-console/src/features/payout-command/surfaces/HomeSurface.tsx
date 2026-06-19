'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, Brush, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  clamp,
  HOME_CHART_DOMAIN_MAX,
  HOME_QUARTERS,
  HOME_YEAR_OPTIONS,
  type HomeOverviewSnapshot,
  type HomeTimeframe,
} from '@/services/payout-command/model'
import { buildZordInsightCards } from '../insights/buildZordInsightCards'
import { ZordInsightCarousel } from '../insights/ZordInsightCarousel'
import { PaymentCommandCenterBand } from '../command-center/PaymentCommandCenterBand'
import {
  type CommandCenterPeriod,
  type CarouselInsightPeriod,
  commandPeriodToDateRange,
  commandPeriodToTrendRange,
  carouselPeriodToTrendRange,
} from '../command-center/commandCenterPeriod'
import { chartThousandsFromMinor, fmtInrFromMinorExact, parseMinorField } from '../command-center/commandCenterFormat'
import { PAYMENT_COMMAND_CENTER } from '../command-center/paymentCommandCopy'
import { usePaymentCommandDataSources } from '../command-center/usePaymentCommandDataSources'
import {
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_CENTERED,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { ClientChart, Glyph } from '../shared'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { useDisbursementTrend } from '@/services/payout-command/prod-api/useDisbursementTrend'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import { SandboxHomeCredentialsCard } from '../sandbox/SandboxHomeCredentialsCard'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import {
  confirmedMatchedValueMinorFromBatchContract,
  parseMatchConfidence,
  parsePercentValue,
} from '@/features/payout-command/settlement-journal/selectors/resolveSettlementIntelligenceKpis'
import {
  parseMissingReferenceRatePercent,
  useBatchContractKpis,
} from '@/features/payout-command/hooks/useBatchContractKpis'

const TENANT_KPI_EMPTY_CAROUSEL_INSIGHT =
  'No payment data in this period yet. Upload payment instructions or connect bank/settlement files to populate this view.'

function parseMinorStrict(value: string | number | undefined | null): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return parseMinorField(value)
}

export function HomeSurface({
  batchId,
  snapshot,
  timeframe,
  onTimeframeChange,
  onYearChange,
  onQuarterChange,
}: {
  /** Optional URL `batch_id` — scopes patterns KPI only. */
  batchId?: string
  snapshot: HomeOverviewSnapshot
  timeframe: HomeTimeframe
  onTimeframeChange: (timeframe: HomeTimeframe) => void
  onYearChange: (year: 2026 | 2027 | 2028) => void
  onQuarterChange: (quarterIndex: number) => void
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [trendAnchorIdx, setTrendAnchorIdx] = useState(0)
  const [commandPeriod, setCommandPeriod] = useState<CommandCenterPeriod>('month')
  const [carouselPeriod, setCarouselPeriod] = useState<CarouselInsightPeriod>('weekly')
  const [heroMetric, setHeroMetric] = useState<'intended' | 'confirmed'>('intended')

  const { tenantId, tenantReady } = useSessionTenant()
  const { mode } = useEnvironment()
  const isSandbox = mode === 'sandbox'

  const intelligenceDateQuery = useMemo(
    () => commandPeriodToDateRange(commandPeriod),
    [commandPeriod],
  )
  const trendRange = commandPeriodToTrendRange(commandPeriod)
  const carouselTrendRange = carouselPeriodToTrendRange(carouselPeriod)

  // Sync the dropdown timeframe to the commandPeriod (which drives the chart/cards API)
  useEffect(() => {
    if (timeframe === 'Week') setCommandPeriod('week')
    else if (timeframe === 'Month') setCommandPeriod('month')
    else if (timeframe === 'Quarter' || timeframe === 'Custom') setCommandPeriod('quarter')
    else if (timeframe === 'Year') setCommandPeriod('year')
    else setCommandPeriod('month')
  }, [timeframe])

  const { data: trendSeries, loading: trendLoading, refresh: refreshTrend } = useDisbursementTrend({ tenantReady, range: trendRange })
  const { data: carouselTrendSeries, loading: carouselTrendLoading, refresh: refreshCarouselTrend } = useDisbursementTrend({
    tenantReady,
    range: carouselTrendRange,
  })

  const { leakage, ambiguity, defensibility, patterns, recommendations, loading, refresh } = useIntelligenceKpis({
    tenantReady,
    batchId,
    dateQuery: intelligenceDateQuery,
  })
  const {
    data: batchContract,
    loading: batchContractLoading,
    refresh: refreshBatchContract,
  } = useBatchContractKpis({ tenantReady, batchId })
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const ambData = isDataAvailable(ambiguity) ? ambiguity : null
  const defData = isDataAvailable(defensibility) ? defensibility : null
  const patternsData = isDataAvailable(patterns) ? patterns : null
  const recsData = isDataAvailable(recommendations) ? recommendations : null

  const handlePageRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshTrend(), refreshCarouselTrend(), refreshBatchContract()])
  }, [refresh, refreshTrend, refreshCarouselTrend, refreshBatchContract])

  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: loading || trendLoading || carouselTrendLoading,
  })

  useEffect(() => {
    if (!isSandbox || !tenantReady || loading || trendLoading) return
    const hasSignals =
      Boolean(leakageData) ||
      Boolean(patternsData) ||
      Boolean(ambData) ||
      Boolean(recsData) ||
      Boolean(trendSeries?.data_available && (trendSeries.buckets?.length ?? 0) > 0)
    if (hasSignals) markSandboxSetupStep('home-signals')
  }, [
    isSandbox,
    tenantReady,
    loading,
    trendLoading,
    leakageData,
    patternsData,
    ambData,
    recsData,
    trendSeries,
  ])

  const trendTotalsMinor = useMemo(() => {
    if (!trendSeries?.data_available || !trendSeries.buckets?.length) return null
    let total = 0
    let intentCount = 0
    for (const b of trendSeries.buckets) {
      total += Number.isFinite(Number(b.total_amount)) ? Number(b.total_amount) : 0
      intentCount += Number.isFinite(Number(b.intent_count)) ? Number(b.intent_count) : 0
    }
    if (total <= 0 && intentCount <= 0) return null
    return { total, intentCount }
  }, [trendSeries])

  const liveTrendChart = useMemo(() => {
    if (!tenantReady || !trendSeries?.data_available || trendSeries.buckets.length < 1) return null
    const rows = trendSeries.buckets.map((b, i) => {
      const minorT = Number(b.total_amount)
      const minorC = Number(b.confirmed_amount)
      const minorR = Number(b.review_amount)
      if (!Number.isFinite(minorT) || !Number.isFinite(minorC) || !Number.isFinite(minorR) || !b.label) {
        return null
      }
      const hasSignal = minorT > 0 || minorC > 0 || minorR > 0 || b.intent_count > 0
      if (!hasSignal) return null
      return {
        point: i,
        barValue: Math.max(0.001, chartThousandsFromMinor(minorT)),
        lineValue: Math.max(0.001, chartThousandsFromMinor(minorC)),
        reviewLineValue: Math.max(0.001, chartThousandsFromMinor(minorR)),
        intendedMinor: minorT,
        confirmedMinor: minorC,
        reviewMinor: minorR,
        label: b.label || '—',
        selected: false,
        isHoliday: false,
      }
    })
    const validRows = rows.filter((row): row is NonNullable<typeof row> => Boolean(row))
    if (!validRows.length) return null
    const maxV = Math.max(0.001, ...validRows.flatMap((r) => [r.barValue, r.lineValue, r.reviewLineValue]))
    const yMax = Math.max(5, Math.ceil((maxV * 1.15) / 5) * 5)
    const ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map((x) => Math.round(x * 1000) / 1000)
    return {
      chartData: validRows,
      axisLabels: validRows.map((r) => r.label),
      yMax,
      ticks,
    }
  }, [tenantReady, trendSeries])

  const chartData = useMemo(() => liveTrendChart?.chartData ?? [], [liveTrendChart])
  const axisLabelsForChart = liveTrendChart?.axisLabels ?? []
  const yDomainMax = liveTrendChart?.yMax ?? HOME_CHART_DOMAIN_MAX
  const yTicks = liveTrendChart?.ticks ?? [0, 50000, 100000, 150000]

  const trendChartReady = Boolean(liveTrendChart && chartData.length > 0)

  useEffect(() => {
    const n = chartData.length
    if (!tenantReady || !trendChartReady || n < 1) return
    setTrendAnchorIdx(clamp(Math.floor(n / 2), 0, Math.max(0, n - 1)))
    setHoverIndex(null)
  }, [tenantReady, commandPeriod, trendChartReady, chartData.length])

  const displayPoint = hoverIndex ?? trendAnchorIdx
  const safePoint = clamp(displayPoint, 0, Math.max(0, chartData.length - 1))
  const selectedRange = trendChartReady
    ? ([0, Math.max(0, chartData.length - 1)] as const)
    : ([0, 0] as const)
  const [selectedRangeStart, selectedRangeEnd] = selectedRange
  const activeRow = chartData[safePoint]
  const totalChartBars = chartData.length
  const rangeLeftPercent = totalChartBars > 0 ? (selectedRangeStart / totalChartBars) * 100 : 0
  const rangeWidthPercent =
    totalChartBars > 0 ? ((selectedRangeEnd - selectedRangeStart + 1) / totalChartBars) * 100 : 100
  const tooltipLeftPercent =
    totalChartBars <= 1
      ? 50
      : clamp((safePoint / Math.max(totalChartBars - 1, 1)) * 100 - 8, 3, 74)
  const monthLabel = activeRow?.label ?? '—'
  const tooltipIntended = activeRow ? fmtInrFromMinorExact(activeRow.intendedMinor) : '—'
  const tooltipConfirmed = activeRow ? fmtInrFromMinorExact(activeRow.confirmedMinor) : '—'
  const tooltipReview = activeRow ? fmtInrFromMinorExact(activeRow.reviewMinor) : '—'

  const chartTags = useMemo(() => {
    const data = chartData
    if (!data.length) return [] as Array<{ leftPct: number; label: string; key: string }>
    let maxBar = 0
    let maxBarI = 0
    let maxGap = 0
    let maxGapI = 0
    let maxReview = 0
    let maxReviewI = 0
    for (let i = 0; i < data.length; i++) {
      if (data[i].barValue > maxBar) {
        maxBar = data[i].barValue
        maxBarI = i
      }
      const gap = data[i].barValue - data[i].lineValue
      if (gap > maxGap) {
        maxGap = gap
        maxGapI = i
      }
      if (data[i].reviewLineValue > maxReview) {
        maxReview = data[i].reviewLineValue
        maxReviewI = i
      }
    }
    const denom = Math.max(data.length - 1, 1)
    const tags: Array<{ key: string; leftPct: number; label: string }> = [
      { key: 'high', leftPct: clamp((maxBarI / denom) * 100, 10, 86), label: PAYMENT_COMMAND_CENTER.chipHighValue },
      { key: 'spike', leftPct: clamp((maxGapI / denom) * 100, 10, 86), label: PAYMENT_COMMAND_CENTER.chipConfirmationGap },
    ]
    if (maxReview > 0) {
      tags.push({
        key: 'review',
        leftPct: clamp((maxReviewI / denom) * 100, 10, 86),
        label: PAYMENT_COMMAND_CENTER.chipReviewNeeded,
      })
    }
    return tags
  }, [chartData])

  const dataSources = usePaymentCommandDataSources({
    tenantReady,
    evidencePackRate: defData?.evidence_pack_rate ?? null,
    auditReadyPct: defData?.audit_ready_pct ?? null,
  })

  const intendedMinor = leakageData
    ? parseMinorField(leakageData.total_intended_amount_minor)
    : trendTotalsMinor && trendTotalsMinor.total > 0
      ? trendTotalsMinor.total
      : null
  const unmatchedMinor = parseMinorStrict(leakageData?.unmatched_amount_minor)
  const underSettlementMinor = parseMinorStrict(leakageData?.under_settlement_amount_minor)
  const orphanMinor = parseMinorStrict(leakageData?.orphan_amount_minor)
  const unlinkedSettlementMinor = orphanMinor
  const reversalMinor = parseMinorStrict(leakageData?.reversal_exposure_minor)
  const observedMinor = parseMinorStrict(leakageData?.total_observed_settled_amount_minor)

  const confirmedMatchedMinor = useMemo(() => {
    if (!batchId?.trim()) return null
    if (batchContractLoading) return null
    return confirmedMatchedValueMinorFromBatchContract(batchContract)
  }, [batchId, batchContract, batchContractLoading])

  const settlementHeroMinor = batchId?.trim() ? (confirmedMatchedMinor ?? observedMinor) : observedMinor

  const bankConfirmedMinor = observedMinor

  const reviewMinor = leakageData != null ? parseMinorField(leakageData.unmatched_amount_minor) : null
  const unmatchedAmountExact =
    leakageData?.unmatched_amount_minor != null && String(leakageData.unmatched_amount_minor).trim() !== ''
      ? String(leakageData.unmatched_amount_minor).trim()
      : null

  const intentCountLabel: number | null =
    patternsData?.total_count != null && patternsData.total_count > 0
      ? patternsData.total_count
      : trendTotalsMinor?.intentCount != null && trendTotalsMinor.intentCount > 0
        ? trendTotalsMinor.intentCount
        : null

  const trendInsight = useMemo(() => {
    if (intendedMinor != null && intendedMinor > 0 && observedMinor != null) {
      const initiated = fmtInrFromMinorExact(intendedMinor)
      const settled = fmtInrFromMinorExact(observedMinor)
      const pct = Math.round((observedMinor / intendedMinor) * 100)
      return `${initiated} was initiated, of which ${settled} has been successfully settled, reflecting ${pct}% settlement completion for the ${carouselPeriod} period.`
    }
    if (carouselTrendSeries?.data_available && carouselTrendSeries.buckets.length >= 2) {
      const totalMinor = carouselTrendSeries.buckets.reduce((s, b) => s + b.total_amount, 0)
      const confirmedMinor = carouselTrendSeries.buckets.reduce((s, b) => s + b.confirmed_amount, 0)
      if (totalMinor > 0) {
        const pct = Math.round((confirmedMinor / totalMinor) * 100)
        return `${fmtInrFromMinorExact(totalMinor)} was initiated, of which ${fmtInrFromMinorExact(confirmedMinor)} has been successfully settled, reflecting ${pct}% settlement completion for the ${carouselPeriod} period.`
      }
    }
    if (leakageData && patternsData) {
      return `${patternsData.pending_count} payments still pending confirmation in the latest batch view.`
    }
    if (patternsData) {
      return `${patternsData.success_count} of ${patternsData.total_count} payments completed in the latest batch signal.`
    }
    return TENANT_KPI_EMPTY_CAROUSEL_INSIGHT
  }, [intendedMinor, observedMinor, carouselTrendSeries, carouselPeriod, leakageData, patternsData])

  const reviewDisplay =
    reviewMinor !== null
      ? fmtInrFromMinorExact(reviewMinor)
      : loading
        ? '…'
        : '—'

  const insightCarouselCards = useMemo(
    () =>
      buildZordInsightCards({
        tenantReady,
        kpiLoading: loading || carouselTrendLoading,
        emptyInsightParagraph: TENANT_KPI_EMPTY_CAROUSEL_INSIGHT,
        mismatchHeadline: reviewDisplay,
        mismatchSubtext:
          leakageData != null
            ? 'Unmatched payment value from the leakage dashboard.'
            : 'No leakage data available for this period.',
        reviewValueMinor: reviewMinor,
        mismatchPendingCount: patternsData?.pending_count ?? ambData?.ambiguous_intent_count ?? 0,
        trendInsight,
        trendSeries: carouselTrendSeries,
        trendChartReady: Boolean(
          carouselTrendSeries?.data_available && (carouselTrendSeries.buckets?.length ?? 0) > 0,
        ),
        leakageData,
        patternsData,
      }),
    [
      tenantReady,
      loading,
      carouselTrendLoading,
      trendInsight,
      carouselTrendSeries,
      leakageData,
      patternsData,
      reviewDisplay,
      reviewMinor,
      ambData?.ambiguous_intent_count,
    ],
  )

  const insightCarouselLoading = Boolean(
    tenantReady && insightCarouselCards.length === 0 && (loading || carouselTrendLoading),
  )

  const matchConfidencePct = useMemo(() => {
    if (batchId?.trim()) {
      if (batchContractLoading) return '…'
      const conf = parseMatchConfidence(batchContract?.match_confidence)
      return conf != null ? `${Math.round(conf * 100)}%` : '—'
    }
    if (ambData) return `${Math.round((ambData.avg_attachment_confidence ?? 0) * 100)}%`
    return loading ? '…' : '—'
  }, [batchId, batchContract, batchContractLoading, ambData, loading])

  const missingRefRate = useMemo(() => {
    if (batchId?.trim()) {
      if (batchContractLoading) return '…'
      return parsePercentValue(batchContract?.missing_reference_rate) ?? '—'
    }
    return ambData ? `${((ambData.provider_ref_missing_rate ?? 0) * 100).toFixed(1)}%` : '—'
  }, [batchId, batchContract, batchContractLoading, ambData])

  const refCompleteness = useMemo(() => {
    if (batchId?.trim()) {
      const missingPct = parseMissingReferenceRatePercent(batchContract?.missing_reference_rate)
      if (missingPct != null) return `${Math.max(0, 100 - missingPct).toFixed(0)}%`
      return batchContractLoading ? '…' : '—'
    }
    if (ambData?.carrier_completeness_rate != null) {
      return `${(ambData.carrier_completeness_rate * 100).toFixed(0)}%`
    }
    return '—'
  }, [batchId, batchContract, batchContractLoading, ambData])

  const proofCoveragePct = defData
    ? `${Math.round((defData.evidence_pack_rate ?? 0) * 100)}%`
    : loading
      ? '…'
      : '—'

  const nextActions = useMemo(() => {
    const actions: Array<{ title: string; description: string; href?: string; emphasis?: boolean }> = []
    if (dataSources.settlementStatus === 'missing') {
      actions.push({
        title: 'Upload bank confirmation file',
        description: 'Required to complete proof for this period.',
        href: '/payout-command-view/today?dock=settlement',
        emphasis: true,
      })
    }
    actions.push({
      title: 'Review payments needing attention',
      description:
        unmatchedAmountExact != null
          ? `${unmatchedAmountExact} currently marked for review.`
          : 'No review value data available for this period.',
      href: '/payout-command-view/today?dock=leakage',
    })
    actions.push({
      title: 'Export payment proof report',
      description: 'Download evidence summary for the selected period.',
      href: '/payout-command-view/today?dock=proof',
    })
    return actions
  }, [dataSources.settlementStatus, unmatchedAmountExact])

  const completionHint =
    dataSources.settlementStatus === 'missing'
      ? 'Upload a bank statement or settlement file for this period.'
      : null

  const lastUpdatedIso = leakageData?.computed_at ?? null
  const lastUpdatedDisplay = lastUpdatedIso
    ? new Date(lastUpdatedIso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null

  const disbursementHeroInner = (
    <div className="flex flex-col items-center justify-center">
      <div className="mx-auto mb-6 flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setHeroMetric('intended')}
          className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
            heroMetric === 'intended'
              ? 'bg-white text-[#000000] shadow-sm ring-1 ring-black/5'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Intended
        </button>
        <button
          type="button"
          onClick={() => setHeroMetric('confirmed')}
          className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
            heroMetric === 'confirmed'
              ? 'bg-white text-[#000000] shadow-sm ring-1 ring-black/5'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Bank-Confirmed
        </button>
      </div>

      <div className="min-h-[110px] text-center">
        {heroMetric === 'intended' ? (
          <>
            <div className={`text-[64px] font-extrabold leading-none tabular-nums text-[#000000] sm:text-[72px]`}>
              {intendedMinor !== null ? fmtInrFromMinorExact(intendedMinor) : loading || trendLoading ? '₹…' : '—'}
            </div>
            <div className="mt-3 text-[18px] font-bold text-[#000000]">Intended Payment Value</div>
            <p className={`mt-2 max-w-xs ${HOME_BODY_IMPERIAL_CENTERED}`}>
              {intentCountLabel != null
                ? `${intentCountLabel} payment instructions received in this period.`
                : loading || trendLoading
                  ? '…'
                  : '—'}
            </p>
          </>
        ) : (
          <>
            <div className={`text-[64px] font-extrabold leading-none tabular-nums text-[#000000] sm:text-[72px]`}>
              {bankConfirmedMinor != null && bankConfirmedMinor > 0
                ? fmtInrFromMinorExact(bankConfirmedMinor)
                : 'Not connected yet'}
            </div>
            <div className="mt-3 text-[18px] font-bold text-[#000000]">Bank-Confirmed Value</div>
            <p className={`mt-2 max-w-xs ${HOME_BODY_IMPERIAL_CENTERED}`}>
              {bankConfirmedMinor != null && bankConfirmedMinor > 0
                ? 'Confirmed from bank/settlement records in this period.'
                : PAYMENT_COMMAND_CENTER.bankPending}
            </p>
          </>
        )}
        <p className={`mt-4 ${HOME_BODY_IMPERIAL_CENTERED}`}>{PAYMENT_COMMAND_CENTER.intendedHelper}</p>
        {lastUpdatedDisplay ? (
          <p className="mt-2 text-[13px] font-medium text-neutral-600">Last updated: {lastUpdatedDisplay}</p>
        ) : null}
      </div>
    </div>
  )

  const trendPanelInner = (
    <>
        <div className="flex flex-wrap items-start justify-between gap-4 min-w-0">
          <div>
            <h2 className={`text-[20px] font-semibold leading-snug tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
              {PAYMENT_COMMAND_CENTER.chartTitle}
            </h2>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL}`}>{PAYMENT_COMMAND_CENTER.chartSubtitle}</p>
            <p className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 ${HOME_BODY_IMPERIAL}`}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#000000]" /> {PAYMENT_COMMAND_CENTER.legendIntended}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#a78bfa]" /> {PAYMENT_COMMAND_CENTER.legendConfirmed}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]" /> {PAYMENT_COMMAND_CENTER.legendReview}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`mr-1 text-[14px] font-medium tracking-[0] ${HOME_TITLE_BLACK}`}>Timeframe</span>
              <select
                value={timeframe}
                onChange={(e) => onTimeframeChange(e.target.value as HomeTimeframe)}
                className="rounded-md border border-[#E5E5E5] bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-800 focus:border-[#000000] focus:outline-none focus:ring-1 focus:ring-black/40"
              >
                <option value="Week">Week</option>
                <option value="Month">Month</option>
                <option value="Quarter">Quarter</option>
                <option value="Year">Year</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
            {trendLoading ? <span className="text-[12px] text-neutral-500">Updating…</span> : null}
          </div>
        </div>
        <div className="relative z-[1] mt-6 min-w-0" onMouseLeave={() => setHoverIndex(null)}>
          {trendChartReady ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 z-[8] bg-white/70"
              style={{
                left: `${rangeLeftPercent}%`,
                width: `${rangeWidthPercent}%`,
                opacity: 0.08,
              }}
              aria-hidden
            />
            <div
              className="pointer-events-auto absolute top-1/2 z-20 w-[15rem] max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-lg border-[0.5px] border-[#E0E0DE] bg-white px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:w-[16.5rem]"
              style={{ left: `clamp(0.5rem, ${tooltipLeftPercent}%, calc(100% - 17rem))` }}
            >
              <button
                type="button"
                className="absolute right-2 top-2 text-[15px] leading-none text-[#888888] hover:text-[#000000]"
                aria-label="Dismiss chart note"
              >
                ×
              </button>
              <div className="text-[11px] font-normal uppercase tracking-[0.06em] text-[#888888]">Date: {monthLabel}</div>
              <div className={`mt-2 space-y-1 ${HOME_BODY_IMPERIAL_SM}`}>
                <p>Intended payments: {tooltipIntended}</p>
                <p>Bank-confirmed: {tooltipConfirmed}</p>
                <p>Needs review: {tooltipReview}</p>
              </div>
              <p className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
                Zord compares your payment instructions with bank/settlement records for this date.
              </p>
            </div>
          <ClientChart className="h-[24rem] w-full md:h-[26rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 28, left: 8, bottom: 8 }}
                barGap={2}
                onMouseMove={(state) => {
                  if (typeof state?.activeTooltipIndex === 'number') {
                    setHoverIndex(state.activeTooltipIndex)
                  }
                }}
              >
                <XAxis hide dataKey="point" />
                <Tooltip
                  shared={false}
                  isAnimationActive={false}
                  cursor={{ fill: 'rgba(15,23,42,0.07)' }}
                  wrapperStyle={{ outline: 'none' }}
                  content={() => null}
                />
                <YAxis
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={14}
                  domain={[0, yDomainMax]}
                  ticks={yTicks}
                  tickFormatter={(value: number) => (value === 0 ? '0' : `₹${value.toFixed(0)}k`)}
                  tick={{ fill: '#000000', fontSize: 11, fontWeight: 500 }}
                />
                <Bar dataKey="barValue" barSize={4} radius={[0, 0, 0, 0]} isAnimationActive>
                  {chartData.map((entry) => (
                    <Cell
                      key={`home-bar-${entry.point}`}
                      fill="#000000"
                      opacity={entry.point === safePoint ? 1 : 0.78}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="lineValue"
                  stroke="#a78bfa"
                  strokeWidth={1.35}
                  dot={false}
                  activeDot={false}
                  strokeLinecap="round"
                  connectNulls
                  isAnimationActive
                />
                <Line
                  type="monotone"
                  dataKey="reviewLineValue"
                  stroke="#f59e0b"
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={false}
                  strokeLinecap="round"
                  connectNulls
                  isAnimationActive
                />
                {chartData.length > 10 && (
                  <Brush
                    dataKey="label"
                    height={28}
                    travellerWidth={6}
                    startIndex={Math.max(0, chartData.length - 14)}
                    endIndex={chartData.length - 1}
                    stroke="#e2e8f0"
                    fill="#f8fafc"
                    tickFormatter={() => ''}
                  >
                    <ComposedChart>
                      <Bar dataKey="barValue" fill="#000000" opacity={0.4} isAnimationActive={false} />
                    </ComposedChart>
                  </Brush>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </ClientChart>
          </>
          ) : tenantReady && trendLoading ? (
            <div className="h-[24rem] w-full animate-pulse rounded-lg bg-slate-100 md:h-[26rem]" aria-busy="true" />
          ) : (
            <div className="flex h-[24rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-white px-4 text-center md:h-[26rem]">
              <Glyph name="chart" className="h-10 w-10 shrink-0 text-black/90" aria-hidden />
              {tenantReady ? (
                <>
                  <span className={`font-semibold ${HOME_TITLE_BLACK}`}>No trend data in this range</span>
                  <span className={`max-w-md ${HOME_BODY_IMPERIAL}`}>
                    Try Week, Month, Quarter, or Year — or wait until intents exist in the selected window. The chart
                    will populate automatically once payments appear.
                  </span>
                </>
              ) : (
                <>
                  <span className={`font-semibold ${HOME_TITLE_BLACK}`}>Workspace required</span>
                  <span className={`max-w-md ${HOME_BODY_IMPERIAL}`}>
                    Sign in and select a workspace to plot intended and confirmed value from the intent ledger. This
                    preview stays empty until a workspace is active.
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {trendChartReady ? (
          <>
        <div className="mt-3 h-[13px] rounded-[4px] bg-[#EBEBEA]">
          <div
            className="relative h-[13px] rounded-[4px] bg-[#C5C5C2]"
            style={{ marginLeft: `${rangeLeftPercent}%`, width: `${rangeWidthPercent}%` }}
          >
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#444444]" />
            <div className="absolute inset-y-0 right-0 w-[3px] bg-[#444444]" />
          </div>
        </div>

        <div
          className="mt-4 grid min-w-0 text-[14px] font-medium tracking-[0] text-[#000000]"
          style={{ gridTemplateColumns: `repeat(${axisLabelsForChart.length}, minmax(0, 1fr))` }}
        >
          {axisLabelsForChart.map((month, i) => (
            <div key={`trend-axis-${i}`} className="text-center">
              {month}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {chartTags.map((tag) => (
            <span
              key={tag.key}
              className={`rounded-full border border-black/10 bg-[#fafafa] px-3 py-1.5 text-[14px] font-medium tracking-[0] ${HOME_TITLE_BLACK}`}
            >
              {tag.label}
            </span>
          ))}
        </div>
          </>
        ) : null}
    </>
  )

  return (
    <div className="mt-0 w-full min-w-0">
        {isSandbox ? (
          <div className="px-4 pt-2 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
              <div className="min-w-0 flex-1 text-center">{disbursementHeroInner}</div>
              <div className="flex w-full shrink-0 justify-center lg:w-auto lg:justify-end lg:self-start lg:pt-1">
                <SandboxHomeCredentialsCard />
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-2 text-center sm:px-6 lg:px-8">{disbursementHeroInner}</div>
        )}

        <div className="mt-6 flex w-full min-h-[48px] items-stretch border-y border-[#e8e8e5] bg-white">
          <div className={`flex w-1/2 min-w-0 items-center border-r border-[#ecece9] px-4 py-3 text-left text-[14px] font-medium tracking-[0] sm:px-6 lg:px-8 ${HOME_TITLE_BLACK}`}>
            <span className="truncate">{snapshot.timeframeLabel}</span>
          </div>
          <div className="flex w-1/2 min-w-0 items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-8">
            {HOME_YEAR_OPTIONS.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => onYearChange(year)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium tracking-[0] transition ${
                  snapshot.selectedYear === year
                    ? 'bg-[#000000] text-white shadow-sm ring-1 ring-black/35'
                    : `border border-[#E5E5E5] bg-white hover:bg-[#f5f5f5] ${HOME_TITLE_BLACK}`
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {timeframe === 'Week' && snapshot.holidayLabels.length > 0 ? (
          <div className="mt-3 px-4 sm:px-6 lg:px-8">
            <div className={`rounded-[0.95rem] border border-[#E5E5E5] bg-white px-3 py-2 ${HOME_BODY_IMPERIAL}`}>
              Holidays included: {snapshot.holidayLabels.join(' • ')}
            </div>
          </div>
        ) : null}

        {timeframe === 'Custom' || timeframe === 'Quarter' ? (
          <div className="mt-3 px-4 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-[1rem] border border-[#E5E5E5] bg-white text-[13px] font-normal tracking-[0]">
              <div className={`grid grid-cols-[1.1fr_2fr_0.8fr] bg-[#f8f8f7] px-3 py-2 text-[14px] font-medium ${HOME_TITLE_BLACK}`}>
                <div>Range</div>
                <div className={HOME_BODY_IMPERIAL_SM}>Months included</div>
                <div>Months</div>
              </div>
              {HOME_QUARTERS.map((quarter, index) => (
                <button
                  key={quarter.name}
                  type="button"
                  onClick={() => onQuarterChange(index)}
                  className={`grid w-full grid-cols-[1.1fr_2fr_0.8fr] px-3 py-2 text-left text-[13px] transition ${
                    quarter.name === snapshot.quarterName ? 'bg-[#eef2f7]' : 'hover:bg-[#fafafa]'
                  }`}
                >
                  <span className={HOME_TITLE_BLACK}>{quarter.name}</span>
                  <span className={HOME_BODY_IMPERIAL_SM}>{quarter.months.join(', ')}</span>
                  <span className={HOME_TITLE_BLACK}>{quarter.months.length}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="relative mt-6 w-full border-b border-[#e5e5e5] bg-white px-4 py-6 sm:px-6 lg:px-8">
          {trendPanelInner}
        </div>

        <section
          className="mt-8 space-y-3 bg-[#f4f4f1] px-2 pb-3 pt-1.5 sm:px-3 lg:px-4"
          aria-labelledby="home-today-command-center-title"
        >
          <PaymentCommandCenterBand
            carouselPeriod={carouselPeriod}
            onCarouselPeriodChange={setCarouselPeriod}
            fullyMatchedValue={
              settlementHeroMinor !== null
                ? fmtInrFromMinorExact(settlementHeroMinor)
                : batchId?.trim() && batchContractLoading
                  ? '…'
                  : loading
                    ? '…'
                    : '—'
            }
            fullyMatchedSub={
              batchId?.trim()
                ? 'Confirmed matched value from batch contract (total_confirmed_amount interim mapping).'
                : 'Settlement value observed from bank or PSP confirmation signals.'
            }
            fullyMatchedFooter={
              batchId?.trim()
                ? 'Batch-scoped confirmed matched value from batch_contract until confirmed_matched_value_minor KPI ships.'
                : 'Observed settlement is the value Zord can link to a bank or settlement outcome — not the same as fully matched intent.'
            }
            awaitingConfirmation={bankConfirmedMinor == null}
            reviewValue={reviewDisplay}
            reviewSub={
              leakageData != null
                ? 'Unmatched intent value from payment-to-settlement matching.'
                : 'No leakage data available for this period.'
            }
            reviewFooter="This is unmatched intent value only — not total review exposure across all exception types."
            unmatchedDisplay={leakageData ? fmtInrFromMinorExact(unmatchedMinor) : '—'}
            shortSettledDisplay={leakageData ? fmtInrFromMinorExact(underSettlementMinor) : '—'}
            unlinkedDisplay={leakageData ? fmtInrFromMinorExact(unlinkedSettlementMinor) : '—'}
            reversalDisplay={leakageData ? fmtInrFromMinorExact(reversalMinor) : '—'}
            reviewHref="/payout-command-view/today?dock=leakage"
            matchConfidencePct={matchConfidencePct}
            matchConfidenceSub="Average match confidence"
            paymentsNeedingReview={
              ambData?.ambiguous_intent_count != null ? String(ambData.ambiguous_intent_count) : '—'
            }
            missingRefRate={missingRefRate}
            refCompleteness={refCompleteness}
            multiMatchRate={
              ambData?.candidate_collision_rate != null
                ? `${(ambData.candidate_collision_rate * 100).toFixed(1)}%`
                : '—'
            }
            proofCoverageDisplay={proofCoveragePct}
            proofSub="Evidence coverage for audit or export"
            proofFooter="Proof-ready payments have enough linked evidence to support audit or dispute export."
            proofReadyRow={defData ? `${Math.round((defData.audit_ready_pct ?? 0) * 100)}% audit-ready` : '—'}
            incompleteProofRow={
              defData
                ? `${Math.max(0, 100 - Math.round((defData.evidence_pack_rate ?? 0) * 100))}% incomplete`
                : '—'
            }
            proofHref="/payout-command-view/today?dock=proof"
            nextActions={{ actions: nextActions, completionHint }}
            insightCarousel={
              <ZordInsightCarousel
                key={`${tenantId || 'no-tenant'}-${carouselPeriod}`}
                tenantReady={tenantReady}
                autoplay
                interval={4000}
                loading={insightCarouselLoading}
                cards={insightCarouselCards}
              />
            }
          />
        </section>

    </div>
  )
}
