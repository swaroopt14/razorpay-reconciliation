import type {
  AmbiguityKpiResolved,
  AmbiguityMixSegment,
  AmbiguityVelocityPoint,
  AmbiguityVelocitySeries,
  IntelligenceBatchRow,
  MatchingExecutionHeatmap,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { formatAmbiguityInr } from './formatAmbiguityInr'

export type VelocityChartRow = {
  period: string
  review: number
  lowConf: number
  missing: number
}

export type TimeframeKey = 'day' | 'week' | 'month' | 'year'

const TF_UI_TO_API: Record<string, TimeframeKey> = {
  Day: 'day',
  Week: 'week',
  Month: 'month',
  Year: 'year',
}

export function uiTimeframeToApi(tf: string): TimeframeKey {
  return TF_UI_TO_API[tf] ?? 'month'
}

function normalizeVelocityPoint(p: AmbiguityVelocityPoint): VelocityChartRow {
  return {
    period: p.period,
    review: p.review_count ?? 0,
    lowConf: p.low_confidence_count ?? 0,
    missing: p.missing_ref_count ?? 0,
  }
}

export function getVelocitySeriesForTimeframe(
  amb: AmbiguityKpiResolved | null,
  tf: string,
): VelocityChartRow[] {
  const key = uiTimeframeToApi(tf)
  const series = amb?.velocity_series?.[key]
  if (!series?.length) return []
  return series.map(normalizeVelocityPoint)
}

export function formatDeltaPct(delta: number | undefined): string | null {
  if (delta == null || !Number.isFinite(delta)) return null
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

export function getKpiDeltas(amb: AmbiguityKpiResolved | null) {
  return {
    ambiguousIntents: formatDeltaPct(amb?.ambiguous_intent_count_delta_pct),
    ambiguityRate: formatDeltaPct(amb?.ambiguity_rate_delta_pct),
    missingRefRate: formatDeltaPct(amb?.provider_ref_missing_rate_delta_pct),
    valueAtRisk: formatDeltaPct(
      amb?.value_at_risk_delta_pct ?? amb?.value_at_risk_delta_pct_from_prior,
    ),
  }
}

export function getValueAtRiskDelta(amb: AmbiguityKpiResolved | null): string | null {
  const delta = amb?.value_at_risk_delta_pct ?? amb?.value_at_risk_delta_pct_from_prior
  return formatDeltaPct(delta)
}

const MIX_COLORS = ['#000000', '#334155', '#64748b', '#00239C', '#94a3b8', '#cbd5e1']

export function getAmbiguityMix(
  amb: AmbiguityKpiResolved | null,
): { segments: AmbiguityMixSegment[]; centerPct: string | null; colors: string[] } {
  if (!amb?.ambiguity_mix_segments?.length) {
    return { segments: [], centerPct: null, colors: [] }
  }

  const center =
    amb.clearing_pct != null ? `${amb.clearing_pct.toFixed(1)}%` : null

  return {
    segments: amb.ambiguity_mix_segments,
    centerPct: center,
    colors: amb.ambiguity_mix_segments.map((_, i) => MIX_COLORS[i % MIX_COLORS.length]),
  }
}

export function getMatchingHeatmap(
  amb: AmbiguityKpiResolved | null,
  heatmapOverride?: MatchingExecutionHeatmap | null,
): MatchingExecutionHeatmap | null {
  return heatmapOverride ?? amb?.matching_execution_heatmap ?? null
}

export function getMatchingSummary(
  amb: AmbiguityKpiResolved | null,
  heatmapOverride?: MatchingExecutionHeatmap | null,
): string | null {
  if (heatmapOverride?.summary) return heatmapOverride.summary
  if (amb?.matching_execution_summary) return amb.matching_execution_summary
  const n = amb?.intents_under_evaluation_count
  if (n != null && n > 0) {
    return `Zord is currently evaluating ${n.toLocaleString('en-IN')} payment intents for ambiguity and missing references.`
  }
  return null
}

export function batchMatchPct(b: IntelligenceBatchRow): number | null {
  if (b.match_confidence_pct != null && Number.isFinite(b.match_confidence_pct)) {
    return Math.round(b.match_confidence_pct)
  }
  if (b.total_count <= 0) return null
  return Math.round((b.success_count / b.total_count) * 100)
}

export function batchDisplayValue(b: IntelligenceBatchRow): string {
  if (b.value_at_risk_minor != null && b.value_at_risk_minor !== '') {
    return formatAmbiguityInr(b.value_at_risk_minor)
  }
  return '—'
}

export function criticalAlertCount(amb: AmbiguityKpiResolved | null): number | null {
  if (amb?.critical_alert_count != null) return amb.critical_alert_count
  if (amb?.ambiguous_intent_count != null) return amb.ambiguous_intent_count
  return null
}
