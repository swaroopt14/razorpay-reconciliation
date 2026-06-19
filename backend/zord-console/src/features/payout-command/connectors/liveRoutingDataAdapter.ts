import {
  getAmbiguityHeatmap,
  getAmbiguityKpis,
  getLeakageKpis,
  getPatternsKpis,
  getRcaKpis,
  getRecommendationsKpis,
  type IntelligenceDateQuery,
} from '@/services/payout-command/prod-api/getIntelligenceKpis'
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
  LeakageKpiResponse,
  MinorAmountField,
  PatternsKpiResponse,
  ProviderDecisionStats,
  RcaKpiResponse,
  RecommendationsKpiResponse,
} from '@/services/payout-command/prod-api/intelligenceTypes'
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

const STALE_AFTER_MINUTES = 15

type PatternSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string

type SourceQualityPattern = NonNullable<PatternSnapshotData['source_quality_patterns']>[number]
type ProviderQualityPattern = NonNullable<PatternSnapshotData['provider_quality_patterns']>[number]

function readMinor(value: MinorAmountField | undefined | null): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
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

function resolveExposureTotals(
  leakage: LeakageKpiResponse | null,
  ambiguity: AmbiguityKpiResponse | null,
  recommendations: RecommendationsKpiResponse | null,
  recommendation: RecommendationSnapshotData | null,
) {
  const totalIntendedMinor = isDataAvailable(leakage) ? readMinor(leakage.total_intended_amount_minor) : 0

  let unconfirmedExposureMinor = 0
  if (isDataAvailable(leakage)) {
    unconfirmedExposureMinor =
      readMinor(leakage.unmatched_amount_minor) +
      readMinor(leakage.under_settlement_amount_minor) +
      readMinor(leakage.orphan_amount_minor) +
      readMinor(leakage.reversal_exposure_minor)
  }
  if (unconfirmedExposureMinor === 0 && isDataAvailable(ambiguity)) {
    unconfirmedExposureMinor = readMinor(ambiguity.value_at_risk_minor)
  }
  if (unconfirmedExposureMinor === 0 && recommendation) {
    unconfirmedExposureMinor = readMinor(recommendation.total_amount_at_stake_minor)
  }
  if (unconfirmedExposureMinor === 0 && recommendation?.cards?.length) {
    unconfirmedExposureMinor = recommendation.cards.reduce(
      (sum, card) => sum + readMinor(card.amount_at_stake_minor),
      0,
    )
  }

  const recommendationImpact =
    readMinor(recommendation?.recommendation_impact_estimate_minor) ||
    (isDataAvailable(recommendations)
      ? readMinor(recommendations.recommendation_impact_estimate_minor)
      : 0)
  const preventableLeakageMinor = recommendationImpact
  return { totalIntendedMinor, moneyAtRiskMinor: unconfirmedExposureMinor, preventableLeakageMinor }
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

function buildLeakageComposition(leakage: LeakageKpiResponse | null): LeakageCompositionSlice[] {
  if (!isDataAvailable(leakage)) return []
  return [
    { key: 'unmatched', label: 'Unmatched', amountMinor: readMinor(leakage.unmatched_amount_minor) },
    { key: 'short_settled', label: 'Short settled', amountMinor: readMinor(leakage.under_settlement_amount_minor) },
    { key: 'unlinked', label: 'Unlinked', amountMinor: readMinor(leakage.orphan_amount_minor) },
    { key: 'reversal', label: 'Reversal', amountMinor: readMinor(leakage.reversal_exposure_minor) },
  ].filter((slice) => slice.amountMinor > 0)
}

/** When leakage KPI buckets are empty, allocate connector-level money-at-risk for the pie chart. */
function buildLeakageCompositionFromConnectors(connectors: ConnectorHealthRow[]): LeakageCompositionSlice[] {
  return connectors
    .filter((row) => row.moneyAtRiskMinor > 0 || row.preventableLeakageMinor > 0)
    .sort((left, right) => right.moneyAtRiskMinor - left.moneyAtRiskMinor)
    .slice(0, 6)
    .map((row) => ({
      key: row.id,
      label: row.connector,
      amountMinor: row.moneyAtRiskMinor > 0 ? row.moneyAtRiskMinor : row.preventableLeakageMinor,
    }))
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
      text: `${weakestSource} has ${missingRefRate.toFixed(1)}% missing references.`,
    })
  }

  const weakestProvider = pattern?.weakest_provider_id
  if (weakestProvider) {
    insights.push({
      id: 'pattern-weakest-provider',
      text: `${providerLabel(weakestProvider)} is the weakest provider signal in the latest pattern snapshot.`,
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
      text: `Leakage is ${(leakage.leakage_percentage * 100).toFixed(1)}% for the selected window.`,
    })
  }

  if (isDataAvailable(ambiguity) && ambiguity.provider_ref_missing_rate > 0) {
    insights.push({
      id: 'provider-ref-missing',
      text: `Provider reference missing rate is ${(ambiguity.provider_ref_missing_rate * 100).toFixed(1)}%.`,
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

/** Preventable share of exposure by recommendation confidence. */
const CONFIDENCE_PREVENTABLE_SHARE: Record<string, number> = { HIGH: 0.9, MEDIUM: 0.65, LOW: 0.4 }

function preventableShare(confidence: string | undefined): number {
  return CONFIDENCE_PREVENTABLE_SHARE[(confidence || '').toUpperCase()] ?? 0.65
}

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
        preventableMinor: impactMinor > 0 ? impactMinor * preventableShare(card.confidence) : 0,
        impactLabel: formatRecommendationImpactLabel(card),
      }
    })
}

function buildActions(
  pattern: PatternSnapshotData | null,
  recommendation: RecommendationSnapshotData | null,
  recommendations: RecommendationsKpiResponse | null,
): ActionRecommendation[] {
  const cards = recommendation?.cards ?? []
  if (cards.length) return actionsFromCards(cards).slice(0, 8)

  // Fallback: pattern snapshot's own recommendation + dashboard KPI summary.
  const actions: ActionRecommendation[] = []

  if (pattern?.recommended_action?.trim()) {
    actions.push({
      id: 'action-api-recommended',
      title: pattern.recommended_action.trim(),
      impactMinor: readMinor(pattern.unexplained_variance_amount_minor),
      impactLabel: pattern.risk_tier ? `Risk tier ${pattern.risk_tier}` : 'API recommended action',
    })
  }

  const source = pattern?.source_quality_patterns?.[0]
  if (source?.source_system) {
    actions.push({
      id: 'action-source-patch',
      title: `Patch ${source.source_system} references`,
      impactMinor: readMinor(source.manual_review_amount_minor),
      impactLabel: `${((source.missing_client_ref_rate ?? 0) * 100).toFixed(1)}% refs missing`,
    })
  }

  if (isDataAvailable(recommendations) && recommendations.total_actions > 0) {
    actions.push({
      id: 'action-live-recommendations',
      title: 'Resolve intelligence recommendations',
      impactMinor: readMinor(recommendations.recommendation_impact_estimate_minor),
      impactLabel: `${recommendations.total_actions} open actions`,
    })
  }

  return actions.filter((action) => action.title).slice(0, 8)
}

/** Pattern history snapshots → Network Health Trend; ambiguity heatmap as fallback. */
function buildTrend(
  patternHistory: PatternHistoryResponse | null,
  heatmap: AmbiguityHeatmapResponse | null,
  pattern: PatternSnapshotData | null,
): RoutingKpiSnapshot['networkHealthTrend'] {
  // Only snapshots carrying real batch volume — tenant-scope snapshots have no
  // success/total counts and would plot as misleading 0% points.
  const snapshots = (patternHistory?.snapshots ?? [])
    .filter((snapshot) => (snapshot.snapshot_json?.total_count ?? 0) > 0)
    .slice(0, 5)
    .reverse()

  if (snapshots.length >= 2) {
    const days = snapshots.map((snapshot) => {
      const created = snapshot.created_at ? new Date(snapshot.created_at) : null
      return created && Number.isFinite(created.getTime())
        ? created.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        : null
    })
    // Same-day snapshots need the time to stay distinguishable on the X axis.
    const needsTime = new Set(days.filter((d, i) => d && days.indexOf(d) !== i))

    return snapshots.map((snapshot, index) => {
      const json = snapshot.snapshot_json as PatternSnapshotData
      const total = Math.max(1, json.total_count ?? 1)
      const successPct = clamp(((json.success_count ?? 0) / total) * 100, 0, 100)
      const risk = json.batch_risk_score ?? json.ambiguity_score ?? 0
      const latencyIndex = clamp(90 - risk * 50, 40, 90)
      const created = snapshot.created_at ? new Date(snapshot.created_at) : null
      let label = json.batch_id?.slice(-6) || `S-${index + 1}`
      if (created && Number.isFinite(created.getTime())) {
        const day = days[index] as string
        label = needsTime.has(day)
          ? created.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : day
      }
      return { label, successPct, latencyIndex }
    })
  }

  if (isDataAvailable(heatmap) && heatmap.batches?.length) {
    return heatmap.batches.slice(-7).map((batch, index) => {
      const total = Math.max(1, batch.total_count || 1)
      const successPct = clamp(((batch.exact_match_count + batch.high_confidence_count) / total) * 100, 0, 100)
      const latencyIndex = clamp(80 - (batch.unresolved_count + batch.conflicted_count + batch.ambiguous_count) * 3, 40, 90)
      return {
        label: batch.batch_id?.slice(-6) || `B-${index + 1}`,
        successPct,
        latencyIndex,
      }
    })
  }

  // Single valid snapshot and no heatmap — show the one real point instead of nothing.
  if (snapshots.length === 1) {
    const json = snapshots[0].snapshot_json as PatternSnapshotData
    const total = Math.max(1, json.total_count ?? 1)
    const successPct = clamp(((json.success_count ?? 0) / total) * 100, 0, 100)
    const risk = json.batch_risk_score ?? json.ambiguity_score ?? 0
    return [
      {
        label: json.batch_id?.slice(-6) || 'Latest',
        successPct,
        latencyIndex: clamp(90 - risk * 50, 40, 90),
      },
    ]
  }

  if (pattern && (pattern.total_count ?? 0) > 0) {
    const total = Math.max(1, pattern.total_count ?? 1)
    const successPct = clamp(((pattern.success_count ?? 0) / total) * 100, 0, 100)
    const risk = pattern.batch_risk_score ?? pattern.ambiguity_score ?? 0
    return [
      {
        label: pattern.batch_id?.slice(-6) || 'Latest',
        successPct,
        latencyIndex: clamp(90 - risk * 50, 40, 90),
      },
    ]
  }

  return []
}

/** When pattern history and heatmap lack trend points, derive a snapshot from live connector rows. */
function buildTrendFromConnectors(connectors: ConnectorHealthRow[]): RoutingKpiSnapshot['networkHealthTrend'] {
  if (!connectors.length) return []

  return connectors
    .slice()
    .sort((left, right) => right.volumeMinor - left.volumeMinor)
    .slice(0, 7)
    .map((row) => ({
      label: row.connector.length > 12 ? `${row.connector.slice(0, 12)}…` : row.connector,
      successPct: row.successPct,
      latencyIndex: clamp(100 - row.avgTimeSec * 8 - row.failurePct * 0.5, 40, 95),
    }))
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
  const apiTotals = resolveExposureTotals(leakage, ambiguity, recommendations, recommendation)
  const connectors = applyLiveExposure(gridRows, leakage, ambiguity, recommendations, recommendation)
  const patternsDecisionSuccessRate = parseDecisionSuccessRate(patterns)
  const leakageComposition = (() => {
    const fromLeakage = buildLeakageComposition(leakage)
    return fromLeakage.length > 0 ? fromLeakage : buildLeakageCompositionFromConnectors(connectors)
  })()

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
    staleAfterMinutes: STALE_AFTER_MINUTES,
    connectors,
    routeCandidates: [],
    correlationInsights: buildInsights(pattern, leakage, ambiguity, rca),
    actionRecommendations: buildActions(pattern, recommendation, recommendations),
    leakageComposition,
    networkHealthTrend: (() => {
      const trend = buildTrend(patternHistory, heatmap, pattern)
      return trend.length > 0 ? trend : buildTrendFromConnectors(connectors)
    })(),
    drilldowns: [],
  }
}
