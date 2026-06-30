'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clamp,
  HOME_QUARTERS,
  HOME_YEAR_OPTIONS,
  type HomeOverviewSnapshot,
  type HomeTimeframe,
} from '@/services/payout-command/model'
import { buildZordInsightCards, HOME_ZORD_INSIGHT_SLOT_COUNT } from '../insights/buildZordInsightCards'
import { ZordInsightCarousel } from '../insights/ZordInsightCarousel'
import { PaymentCommandCenterBand } from '../command-center/PaymentCommandCenterBand'
import {
  type CommandCenterPeriod,
  type CarouselInsightPeriod,
  commandPeriodToDateRange,
  commandPeriodToTrendRange,
  carouselPeriodToTrendRange,
} from '../command-center/commandCenterPeriod'
import {
  chartThousandsFromMinor,
  fmtInrFromMinorExact,
  parseMinorField,
} from '../command-center/commandCenterFormat'
import { PaymentTrendPanel } from '../command-center/PaymentTrendPanel'
import { mapDisbursementBucketsToTrendPoints } from '../command-center/paymentTrendChartConfig'
import type { PaymentTrendChartPoint } from '../command-center/PaymentValueTrendChart'
import { PAYMENT_COMMAND_CENTER } from '../command-center/paymentCommandCopy'
import { usePaymentCommandDataSources } from '../command-center/usePaymentCommandDataSources'
import {
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_CENTERED,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { Glyph } from '../shared'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'
import { useDisbursementTrend } from '@/services/payout-command/prod-api/useDisbursementTrend'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import { SandboxHomeCredentialsCard } from '../sandbox/SandboxHomeCredentialsCard'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import { displayApiField, formatKpiMoneyMinor } from '../shared/formatApiKpiFields'

const TENANT_KPI_EMPTY_CAROUSEL_INSIGHT =
  'No payment data in this period yet. Upload payment instructions or connect bank/settlement files to populate this view.'

function homeTimeframeToCommandPeriod(timeframe: HomeTimeframe): CommandCenterPeriod {
  if (timeframe === 'Week') return 'week'
  if (timeframe === 'Year') return 'year'
  if (timeframe === 'Quarter' || timeframe === 'Custom') return 'quarter'
  return 'month'
}

function homeTimeframeToTrendRange(timeframe: HomeTimeframe): DisbursementTrendRange {
  return commandPeriodToTrendRange(homeTimeframeToCommandPeriod(timeframe))
}

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
  const [commandPeriod, setCommandPeriod] = useState<CommandCenterPeriod>(() =>
    homeTimeframeToCommandPeriod(timeframe),
  )
  const [chartPeriod, setChartPeriod] = useState<DisbursementTrendRange>(() =>
    homeTimeframeToTrendRange(timeframe),
  )
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
    if (timeframe === 'Week') {
      setCommandPeriod('week')
      setChartPeriod('week')
    } else if (timeframe === 'Month') {
      setCommandPeriod('month')
      setChartPeriod('month')
    } else if (timeframe === 'Quarter' || timeframe === 'Custom') {
      setCommandPeriod('quarter')
      setChartPeriod('quarter')
    } else if (timeframe === 'Year') {
      setCommandPeriod('year')
      setChartPeriod('year')
    } else {
      setCommandPeriod('month')
      setChartPeriod('month')
    }
  }, [timeframe])

  const { data: trendSeries, loading: trendLoading, refresh: refreshTrend } = useDisbursementTrend({ tenantReady, range: trendRange })
  const {
    data: chartSeriesData,
    loading: chartSeriesLoading,
    refresh: refreshChartSeries,
  } = useDisbursementTrend({ tenantReady, range: chartPeriod })
  const { data: carouselTrendSeries, loading: carouselTrendLoading, refresh: refreshCarouselTrend } = useDisbursementTrend({
    tenantReady,
    range: carouselTrendRange,
  })

  const { leakage, ambiguity, defensibility, patterns, recommendations, loading, refresh } = useIntelligenceKpis({
    tenantReady,
    batchId,
    dateQuery: intelligenceDateQuery,
  })
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const ambData = isDataAvailable(ambiguity) ? ambiguity : null
  const defData = isDataAvailable(defensibility) ? defensibility : null
  const patternsData = isDataAvailable(patterns) ? patterns : null
  const recsData = isDataAvailable(recommendations) ? recommendations : null

  const handlePageRefresh = useCallback(async () => {
    await Promise.all([
      refresh(),
      refreshTrend(),
      refreshChartSeries(),
      refreshCarouselTrend(),
    ])
  }, [refresh, refreshTrend, refreshChartSeries, refreshCarouselTrend])

  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: loading || trendLoading || chartSeriesLoading || carouselTrendLoading,
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

  const chartSeriesStale =
    Boolean(chartSeriesData) && chartSeriesData?.range !== chartPeriod

  const chartSeriesPoints = useMemo((): PaymentTrendChartPoint[] => {
    if (
      !tenantReady ||
      chartSeriesStale ||
      !chartSeriesData?.data_available ||
      !chartSeriesData.buckets?.length
    ) {
      return []
    }
    return mapDisbursementBucketsToTrendPoints(chartSeriesData.buckets)
  }, [tenantReady, chartSeriesData, chartSeriesStale])

  const trendChartReady = chartSeriesPoints.some(
    (p) => p.intendedMinor > 0 || p.confirmedMinor > 0 || p.reviewMinor > 0,
  )

  const chartTags = useMemo(() => {
    const data = chartSeriesPoints.slice(-30)
    if (!data.length) return [] as Array<{ leftPct: number; label: string; key: string }>
    let maxBar = 0
    let maxBarI = 0
    let maxGap = 0
    let maxGapI = 0
    let maxReview = 0
    let maxReviewI = 0
    for (let i = 0; i < data.length; i++) {
      const barK = chartThousandsFromMinor(data[i].intendedMinor)
      const lineK = chartThousandsFromMinor(data[i].confirmedMinor)
      const reviewK = chartThousandsFromMinor(data[i].reviewMinor)
      if (barK > maxBar) {
        maxBar = barK
        maxBarI = i
      }
      const gap = barK - lineK
      if (gap > maxGap) {
        maxGap = gap
        maxGapI = i
      }
      if (reviewK > maxReview) {
        maxReview = reviewK
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
  }, [chartSeriesPoints])

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
        carouselPeriod,
        emptyInsightParagraph: TENANT_KPI_EMPTY_CAROUSEL_INSIGHT,
        trendSeries: carouselTrendSeries,
        trendChartReady: Boolean(
          carouselTrendSeries?.data_available && (carouselTrendSeries.buckets?.length ?? 0) > 0,
        ),
        leakageData,
        ambData,
        defData,
        patternsData,
      }),
    [
      tenantReady,
      loading,
      carouselTrendLoading,
      carouselPeriod,
      carouselTrendSeries,
      leakageData,
      ambData,
      defData,
      patternsData,
    ],
  )

  const insightCarouselLoading = Boolean(
    tenantReady && insightCarouselCards.length === 0 && (loading || carouselTrendLoading),
  )

  const insightCarouselSlots = useMemo(() => {
    const cards = insightCarouselCards.slice(0, HOME_ZORD_INSIGHT_SLOT_COUNT)
    while (cards.length < HOME_ZORD_INSIGHT_SLOT_COUNT) {
      cards.push({
        id: `empty-insight-${cards.length}`,
        type: 'insight' as const,
        label: 'Insights',
        paragraph: TENANT_KPI_EMPTY_CAROUSEL_INSIGHT,
      })
    }
    return cards.map((card, index) => (
      <ZordInsightCarousel
        key={`home-insight-slot-${index}`}
        tenantReady={tenantReady}
        autoplay={false}
        loading={insightCarouselLoading}
        cards={[card]}
      />
    ))
  }, [insightCarouselCards, tenantReady, insightCarouselLoading])

  const matchConfidencePct = useMemo(() => {
    const withPct = (v: string) => (v === '—' || v === '…' ? v : `${v}%`)
    return withPct(displayApiField(ambData?.avg_attachment_confidence, loading))
  }, [ambData, loading])

  const missingRefRate = displayApiField(ambData?.provider_ref_missing_rate, loading)

  const refCompleteness = displayApiField(ambData?.carrier_completeness_rate, loading)

  const multiMatchRate = displayApiField(ambData?.candidate_collision_rate, loading)

  const withPct = (v: string) => (v === '—' || v === '…' ? v : `${v}%`)
  const proofCoveragePct = withPct(displayApiField(defData?.evidence_pack_rate, loading))
  const proofReadyRow = withPct(displayApiField(defData?.audit_ready_pct, loading))
  const incompleteProofRow = displayApiField(defData?.weak_evidence_count, loading)

  const settlementHeroDisplay = loading
    ? '…'
    : formatKpiMoneyMinor(leakageData?.total_observed_settled_amount_minor)

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
      <div className="min-w-0">
        <h2 className={`text-[20px] font-semibold leading-snug tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
          {PAYMENT_COMMAND_CENTER.chartTitle}
        </h2>
        <p className={`mt-1 ${HOME_BODY_IMPERIAL}`}>{PAYMENT_COMMAND_CENTER.chartSubtitle}</p>
      </div>
      <div className="relative z-[1] mt-4 min-w-0">
        {tenantReady ? (
          <PaymentTrendPanel
            className="w-full"
            series={chartSeriesPoints}
            loading={chartSeriesLoading || chartSeriesStale}
            period={chartPeriod}
            onPeriodChange={setChartPeriod}
          />
        ) : (
          <div className="flex h-[24rem] flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-slate-200 bg-[#f3f4f5] px-4 text-center md:h-[26rem]">
            <Glyph name="chart" className="h-10 w-10 shrink-0 text-black/90" aria-hidden />
            <span className={`font-semibold ${HOME_TITLE_BLACK}`}>Workspace required</span>
            <span className={`max-w-md ${HOME_BODY_IMPERIAL}`}>
              Sign in and select a workspace to plot intended and confirmed value from the intent ledger.
            </span>
          </div>
        )}
      </div>

      {trendChartReady ? (
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
            fullyMatchedValue={settlementHeroDisplay}
            fullyMatchedSub="Settlement value confirmed by bank or PSP"
            fullyMatchedFooter="Includes partial matches and linked outcomes. This is not the same as total intended payment value for the batch."
            awaitingConfirmation={false}
            reviewValue={reviewDisplay}
            reviewSub="Payments without a confirmed settlement outcome"
            reviewFooter="Covers payments with no confirmed settlement link. Short-settled, over-settled, unlinked, and reversal amounts are broken out below."
            shortSettledDisplay={loading ? '…' : formatKpiMoneyMinor(leakageData?.under_settlement_amount_minor)}
            overSettledDisplay={loading ? '…' : formatKpiMoneyMinor(leakageData?.over_settlement_amount_minor)}
            unlinkedDisplay={loading ? '…' : formatKpiMoneyMinor(leakageData?.orphan_amount_minor)}
            reversalDisplay={loading ? '…' : formatKpiMoneyMinor(leakageData?.reversal_exposure_minor)}
            reviewHref="/payout-command-view/today?dock=leakage"
            matchConfidencePct={matchConfidencePct}
            matchConfidenceSub="Average match confidence"
            matchConfidenceFooter={undefined}
            paymentsNeedingReview={displayApiField(ambData?.ambiguous_intent_count, loading)}
            missingRefRate={missingRefRate}
            refCompleteness={refCompleteness}
            multiMatchRate={multiMatchRate}
            proofCoverageDisplay={proofCoveragePct}
            proofSub="Evidence coverage for audit or export"
            proofFooter="Proof-ready payments have enough linked evidence to support audit or dispute export."
            proofReadyRow={proofReadyRow}
            incompleteProofRow={incompleteProofRow}
            proofHref="/payout-command-view/today?dock=proof"
            nextActions={{ actions: nextActions, completionHint }}
            insightCarousels={insightCarouselSlots}
          />
        </section>

    </div>
  )
}
