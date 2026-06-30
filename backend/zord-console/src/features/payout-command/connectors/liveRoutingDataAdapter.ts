import {
  getAmbiguityHeatmap,
  getAmbiguityKpis,
  getLeakageKpis,
  getPatternsKpis,
  getRcaKpis,
  getRecommendationsKpis,
  type IntelligenceDateQuery,
} from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { getLeakageExposureTimeseries } from '@/services/payout-command/prod-api/getLeakageExposureTimeseries'
import {
  getPatternDetail,
  getPatternHistory,
  getRecommendationDetail,
  getRecommendationHistory,
  patternDataFrom,
  recommendationDataFrom,
} from '@/services/payout-command/prod-api/getPatternIntelligence'
import type {
  BatchRiskSignal,
  PatternHistoryResponse,
  PatternSnapshotData,
  RecommendationCard,
  RecommendationSnapshotData,
} from '@/services/payout-command/prod-api/intelligencePatternTypes'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type {
  AmbiguityHeatmapResponse,
  AmbiguityKpiResponse,
  LeakageExposureTimeseriesResponse,
  LeakageKpiResponse,
  MinorAmountField,
  PatternsKpiResponse,
  ProviderDecisionStats,
  RcaKpiResponse,
  RecommendationsKpiResponse,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { mapLeakageComparisonSeries } from '../leakage-portfolio/utils/mapLeakageComparisonSeries'
import type {
  ActionRecommendation,
  ConnectorHealthRow,
  ConnectorStatus,
  CorrelationInsight,
  LeakageCompositionSlice,
  RoutingKpiSnapshot,
  RoutingTimeWindow,
} from './types'
import {
  formatPatternBatchInsight,
  formatRcaConcentration,
  formatRecommendationImpactLabel,
  formatRecommendationTitle,
  formatRiskSignalInsight,
  isDeferredRecommendation,
} from './copy/formatRoutingIntelligence'

type PatternSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string

type SourceQualityPattern = NonNullable<PatternSnapshotData['source_quality_patterns']>[number]
type ProviderQualityPattern = NonNullable<PatternSnapshotData['provider_quality_patterns']>[number]

function readMinor(value: MinorAmountField | undefined | null): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function readMinorOrNull(value: MinorAmountField | undefined | null): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function pct(value: number | undefined | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return clamp(value * 100, 0, 100)
}

function parseRateField(value: number | string | undefined | null): number | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value <= 1 ? value * 100 : value
  }
  const trimmed = String(value).trim().replace('%', '')
  const n = Number.parseFloat(trimmed)
  return Number.isFinite(n) ? n : null
}

function parseDecisionSuccessRate(patterns: PatternsKpiResponse | null): number | null {
  if (!patterns) return null
  return parseRateField(patterns.decision_success_rate)
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function windowToDateQuery(window: RoutingTimeWindow): IntelligenceDateQuery {
  const now = new Date()
  const start = new Date(now)
  start.setUTCDate(now.getUTCDate() - (window === '24h' ? 1 : window === '7d' ? 7 : 30))
  return { from_date: dateOnly(start), to_date: dateOnly(now) }
}

function severityToStatus(severity?: PatternSeverity): ConnectorStatus {
  const normalized = (severity || '').toUpperCase()
  if (normalized === 'CRITICAL') return 'Risk'
  if (normalized === 'HIGH') return 'Degraded'
  if (normalized === 'MEDIUM') return 'Stable'
  return 'Healthy'
}

function connectorKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function providerLabel(providerId: string): string {
  return providerId
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function generatedAtFrom(inputs: Array<string | undefined | null>): string {
  const times = inputs
    .map((input) => (input ? new Date(input).getTime() : NaN))
    .filter((time) => Number.isFinite(time))
  if (!times.length) return new Date().toISOString()
  return new Date(Math.max(...times)).toISOString()
}


/** Recommendation card lookup keyed by affected source system / provider. */
function buildCardLookup(cards: RecommendationCard[]): Map<string, RecommendationCard> {
  const byTarget = new Map<string, RecommendationCard>()
  for (const card of cards) {
    for (const target of [card.affected_source_system, card.affected_provider_id]) {
      if (!target) continue
      const key = connectorKey(target)
      if (key && !byTarget.has(key)) byTarget.set(key, card)
    }
  }
  return byTarget
}

function connectorGridAction(status: ConnectorStatus, degradedAction: string): string {
  if (status === 'Healthy' || status === 'Reliable' || status === 'Stable') return 'No action needed'
  return degradedAction
}

function latestPredictedLeakageMinor(
  timeseries: LeakageExposureTimeseriesResponse | null,
): number | null {
  if (!timeseries || !isDataAvailable(timeseries)) return null
  const series = timeseries.series ?? []
  if (series.length === 0) return null
  const last = series[series.length - 1]
  return readMinorOrNull(last.predicted_leakage_minor)
}

function resolveExposureTotals(
  leakage: LeakageKpiResponse | null,
  timeseries: LeakageExposureTimeseriesResponse | null,
  recommendations: RecommendationsKpiResponse | null,
  recommendation: RecommendationSnapshotData | null,
): RoutingKpiSnapshot['apiTotals'] {
  const preventableFallback =
    readMinorOrNull(recommendation?.recommendation_impact_estimate_minor) ??
    (isDataAvailable(recommendations)
      ? readMinorOrNull(recommendations.recommendation_impact_estimate_minor)
      : null)
  const preventableLeakageMinor = latestPredictedLeakageMinor(timeseries) ?? preventableFallback

  if (!isDataAvailable(leakage)) {
    return {
      totalIntendedMinor: null,
      moneyAtRiskMinor: null,
      preventableLeakageMinor,
    }
  }

  return {
    totalIntendedMinor: readMinorOrNull(leakage.total_intended_amount_minor),
    moneyAtRiskMinor: readMinorOrNull(leakage.unmatched_amount_minor),
    preventableLeakageMinor,
  }
}

function applyLiveExposure(
  connectors: ConnectorHealthRow[],
  _leakage: LeakageKpiResponse | null,
  _ambiguity: AmbiguityKpiResponse | null,
  _recommendations: RecommendationsKpiResponse | null,
  _recommendation: RecommendationSnapshotData | null,
): ConnectorHealthRow[] {
  return connectors
}

/** Provider quality patterns → PSP rows for the Connector Grid. */
function providerRows(
  providers: ProviderQualityPattern[] = [],
  cardLookup: Map<string, RecommendationCard>,
): ConnectorHealthRow[] {
  return providers
    .filter((provider) => provider.provider_id)
    .map((provider): ConnectorHealthRow => {
      const failurePct = pct(Math.max(provider.orphan_rate ?? 0, provider.ambiguity_rate ?? 0)) ?? 0
      const successPct = pct(provider.avg_parse_confidence) ?? clamp(100 - failurePct, 0, 100)
      const card = cardLookup.get(connectorKey(provider.provider_id || ''))
      const status = severityToStatus(provider.severity)
      return {
        id: connectorKey(provider.provider_id || 'provider'),
        connector: providerLabel(provider.provider_id || 'Provider'),
        type: 'PSP',
        successPct,
        avgTimeSec: provider.settlement_delay_p95_days ?? 0,
        failurePct,
        status,
        trend: failurePct > 10 ? 'down' : 'flat',
        recommendedAction: connectorGridAction(
          status,
          card?.title?.trim() ||
            ((provider.severity || '').toUpperCase() === 'CRITICAL'
              ? 'Strengthen provider contract'
              : failurePct > 15
                ? 'Request stronger carrier refs'
                : 'Review provider quality signals'),
        ),
        volumeMinor: 0,
        moneyAtRiskMinor: 0,
        preventableLeakageMinor: 0,
      }
    })
}

/** Patterns dashboard by_provider → PSP rows when pattern detail lacks quality arrays. */
function providerRowsFromPatterns(
  byProvider: Record<string, ProviderDecisionStats> | undefined,
): ConnectorHealthRow[] {
  if (!byProvider) return []

  return Object.entries(byProvider)
    .filter(([, stats]) => (stats.total_decisions ?? 0) > 0)
    .map(([providerId, stats]): ConnectorHealthRow => {
      const successPct = parseRateField(stats.decision_success_rate) ?? 0
      const orphanPct = parseRateField(stats.orphan_rate) ?? 0
      const ambiguityPct = parseRateField(stats.ambiguity_rate) ?? 0
      const failurePct = clamp(Math.max(orphanPct, ambiguityPct), 0, 100)
      const status: ConnectorStatus =
        failurePct >= 25 || successPct < 50
          ? 'Risk'
          : failurePct >= 15 || successPct < 70
            ? 'Degraded'
            : 'Healthy'

      return {
        id: connectorKey(providerId),
        connector: providerLabel(providerId),
        type: 'PSP',
        successPct,
        avgTimeSec: 0,
        failurePct,
        status,
        trend: failurePct > 10 ? 'down' : 'flat',
        recommendedAction: connectorGridAction(
          status,
          failurePct > 15 ? 'Review connector match quality' : 'No action needed',
        ),
        volumeMinor: 0,
        moneyAtRiskMinor: 0,
        preventableLeakageMinor: 0,
      }
    })
}

/** Source quality patterns (manual_excel, tally_branch_a, …) → Rail rows for the Connector Grid. */
function sourceRows(
  sources: SourceQualityPattern[] = [],
  cardLookup: Map<string, RecommendationCard>,
): ConnectorHealthRow[] {
  return sources
    .filter((source) => source.source_system)
    .map((source): ConnectorHealthRow => {
      const manualReviewPct = pct(source.manual_review_rate) ?? 0
      const failurePct = pct(source.missing_client_ref_rate) ?? 0
      const successPct = clamp(100 - manualReviewPct, 0, 100)
      const card = cardLookup.get(connectorKey(source.source_system || ''))
      const status = severityToStatus(source.severity)
      return {
        id: `source-${connectorKey(source.source_system || 'source')}`,
        connector: providerLabel(source.source_system || 'Source'),
        type: 'Rail',
        successPct,
        avgTimeSec: 0,
        failurePct,
        status,
        trend: failurePct > 25 ? 'down' : failurePct > 10 ? 'flat' : 'up',
        recommendedAction: connectorGridAction(
          status,
          card?.title?.trim() ||
            (manualReviewPct > 20
              ? 'Escalate source quality issues'
              : failurePct > 10
                ? `Request source patch · ${source.source_system}`
                : 'Review source quality signals'),
        ),
        volumeMinor: readMinor(source.manual_review_amount_minor),
        moneyAtRiskMinor: readMinor(source.manual_review_amount_minor),
        preventableLeakageMinor: 0,
      }
    })
}

/** Leakage KPI exposure_bands or component minors — API fields only. */
function buildLeakageComposition(leakage: LeakageKpiResponse | null): LeakageCompositionSlice[] {
  if (!isDataAvailable(leakage)) return []

  if (leakage.exposure_bands?.length) {
    return leakage.exposure_bands
      .map((band, index) => {
        const amountMinor = readMinor(band.amount_minor)
        if (amountMinor <= 0) return null
        return {
          key: band.band.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `band-${index}`,
          label: band.band,
          amountMinor,
        }
      })
      .filter((slice): slice is LeakageCompositionSlice => slice != null)
  }

  return [
    { key: 'unmatched', label: 'Unmatched', amountMinor: readMinor(leakage.unmatched_amount_minor) },
    { key: 'short_settled', label: 'Short settled', amountMinor: readMinor(leakage.under_settlement_amount_minor) },
    { key: 'unlinked', label: 'Unlinked', amountMinor: readMinor(leakage.orphan_amount_minor) },
    { key: 'reversal', label: 'Reversal', amountMinor: readMinor(leakage.reversal_exposure_minor) },
  ].filter((slice) => slice.amountMinor > 0)
}

function riskSignalInsights(signals: BatchRiskSignal[] | null | undefined): CorrelationInsight[] {
  return (signals ?? [])
    .filter((signal) => signal.signal)
    .slice(0, 3)
    .map((signal) => ({
      id: `risk-${signal.signal}`,
      text: formatRiskSignalInsight(signal),
    }))
}

function buildInsights(
  pattern: PatternSnapshotData | null,
  leakage: LeakageKpiResponse | null,
  ambiguity: AmbiguityKpiResponse | null,
  rca: RcaKpiResponse | null,
): CorrelationInsight[] {
  const insights: CorrelationInsight[] = [...riskSignalInsights(pattern?.risk_signals)]

  if (pattern?.batch_id) {
    insights.push({
      id: 'pattern-batch',
      text: formatPatternBatchInsight(pattern.batch_id, pattern.risk_tier),
    })
  }

  const weakestSource = pattern?.weakest_source_system
  const missingRefRate = pct(pattern?.weakest_source_missing_ref_rate)
  if (weakestSource && missingRefRate != null) {
    insights.push({
      id: 'pattern-weakest-source',
      text: `${missingRefRate.toFixed(1)}% of records in ${weakestSource} are missing a bank reference. Without a UTR or settlement reference, these payments cannot be confirmed or evidenced.`,
    })
  }

  const weakestProvider = pattern?.weakest_provider_id
  if (weakestProvider) {
    insights.push({
      id: 'pattern-weakest-provider',
      text: `${providerLabel(weakestProvider)} has the weakest match signals in this snapshot. Review connector health and reference quality for this provider.`,
    })
  }

  const delayP95 = pattern?.settlement_delay_p95_days
  if (delayP95 && delayP95 > 1) {
    insights.push({
      id: 'pattern-settlement-delay',
      text: `Settlement delay P95 is ${delayP95.toFixed(1)} days.`,
    })
  }

  if (isDataAvailable(leakage) && leakage.leakage_percentage > 0) {
    insights.push({
      id: 'leakage-rate',
      text: `Payment gap rate is ${leakage.leakage_percentage}% for the selected time window.`,
    })
  }

  if (isDataAvailable(ambiguity) && ambiguity.provider_ref_missing_rate > 0) {
    insights.push({
      id: 'provider-ref-missing',
      text: `${(ambiguity.provider_ref_missing_rate * 100).toFixed(1)}% of payment records are missing a provider reference. These records require manual follow-up to confirm settlement.`,
    })
  }

  if (isDataAvailable(rca) && rca.rca_concentration > 0) {
    insights.push({
      id: 'rca-concentration',
      text: formatRcaConcentration(rca.rca_concentration),
    })
  }

  return insights.slice(0, 8)
}

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

/** Ranked recommendation cards → Recommended Actions list. */
function actionsFromCards(cards: RecommendationCard[]): ActionRecommendation[] {
  return [...cards]
    .filter((card) => !isDeferredRecommendation(card))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[(a.priority || '').toUpperCase()] ?? 4
      const pb = PRIORITY_ORDER[(b.priority || '').toUpperCase()] ?? 4
      if (pa !== pb) return pa - pb
      return (b.priority_score ?? 0) - (a.priority_score ?? 0)
    })
    .filter((card) => card.title?.trim() || card.action?.trim())
    .map((card, index) => {
      const impactMinor = readMinor(card.amount_at_stake_minor)
      const title = formatRecommendationTitle(card)
      return {
        id: card.card_id || `rec-card-${index}`,
        title,
        impactMinor,
        impactLabel: formatRecommendationImpactLabel(card),
      }
    })
}

function buildActions(recommendation: RecommendationSnapshotData | null): ActionRecommendation[] {
  const cards = recommendation?.cards ?? []
  if (!cards.length) return []
  return actionsFromCards(cards).slice(0, 8)
}

function buildLeakageExposureTrend(
  leakageTimeseries: LeakageExposureTimeseriesResponse | null,
): Pick<RoutingKpiSnapshot, 'leakageExposureTrend' | 'leakageExposureTrendLive'> {
  const mapped = mapLeakageComparisonSeries(leakageTimeseries)
  return {
    leakageExposureTrend: mapped.points,
    leakageExposureTrendLive: mapped.live,
  }
}

export async function getLiveRoutingSnapshot(window: RoutingTimeWindow): Promise<RoutingKpiSnapshot | null> {
  const dateQuery = windowToDateQuery(window)

  const [
    leakage,
    ambiguity,
    patterns,
    recommendations,
    rca,
    heatmap,
    patternDetail,
    patternHistory,
    recommendationDetail,
    recommendationHistory,
    leakageTimeseries,
  ] = await Promise.all([
    getLeakageKpis(dateQuery),
    getAmbiguityKpis(dateQuery),
    getPatternsKpis(),
    getRecommendationsKpis(dateQuery),
    getRcaKpis(dateQuery),
    getAmbiguityHeatmap(),
    getPatternDetail(dateQuery),
    getPatternHistory(dateQuery, 5),
    getRecommendationDetail(dateQuery),
    getRecommendationHistory(dateQuery, 5),
    getLeakageExposureTimeseries({ granularity: 'day' }),
  ])

  const pattern = patternDataFrom(patternDetail, patternHistory)
  const recommendation = recommendationDataFrom(recommendationDetail, recommendationHistory)
  const hasLiveSignal =
    isDataAvailable(leakage) ||
    isDataAvailable(ambiguity) ||
    isDataAvailable(patterns) ||
    isDataAvailable(recommendations) ||
    isDataAvailable(rca) ||
    isDataAvailable(heatmap) ||
    Boolean(pattern) ||
    Boolean(recommendation) ||
    parseDecisionSuccessRate(patterns) != null ||
    Boolean(patterns?.by_provider && Object.keys(patterns.by_provider).length > 0)
  if (!hasLiveSignal) return null

  const cardLookup = buildCardLookup(recommendation?.cards ?? [])
  // The latest snapshot may be batch-scoped (no source/provider quality arrays);
  // fall back to the newest history snapshot that carries them (tenant scope).
  const hasQualityArrays = (data: PatternSnapshotData | null | undefined): boolean =>
    (data?.source_quality_patterns?.length ?? 0) > 0 ||
    (data?.provider_quality_patterns?.length ?? 0) > 0
  const gridPattern = hasQualityArrays(pattern)
    ? pattern
    : ((patternHistory?.snapshots ?? [])
        .map((snapshot) => snapshot.snapshot_json)
        .find((json) => hasQualityArrays(json)) ?? pattern)
  const patternProviderRows = providerRowsFromPatterns(patterns?.by_provider)
  const gridRows = [
    ...(patternProviderRows.length
      ? patternProviderRows
      : providerRows(gridPattern?.provider_quality_patterns, cardLookup)),
    ...sourceRows(gridPattern?.source_quality_patterns, cardLookup),
  ]
  const apiTotals = resolveExposureTotals(leakage, leakageTimeseries, recommendations, recommendation)
  const connectors = applyLiveExposure(gridRows, leakage, ambiguity, recommendations, recommendation)
  const patternsDecisionSuccessRate = parseDecisionSuccessRate(patterns)
  const leakageComposition = buildLeakageComposition(leakage)
  const { leakageExposureTrend, leakageExposureTrendLive } = buildLeakageExposureTrend(leakageTimeseries)

  return {
    apiTotals,
    patternsDecisionSuccessRate: patternsDecisionSuccessRate ?? undefined,
    generatedAtIso: generatedAtFrom([
      isDataAvailable(leakage) ? leakage.computed_at : null,
      isDataAvailable(ambiguity) ? ambiguity.computed_at : null,
      isDataAvailable(patterns) ? patterns.computed_at : null,
      isDataAvailable(recommendations) ? recommendations.computed_at : null,
      isDataAvailable(rca) ? rca.computed_at : null,
      patternDetail?.computed_at,
      pattern?.computed_at,
      patternHistory?.snapshots?.[0]?.created_at,
      recommendationDetail?.computed_at,
      recommendation?.computed_at,
    ]),
    connectors,
    routeCandidates: [],
    correlationInsights: buildInsights(pattern, leakage, ambiguity, rca),
    actionRecommendations: buildActions(recommendation),
    leakageComposition,
    leakageExposureTrend,
    leakageExposureTrendLive,
    drilldowns: [],
  }
}
