// Shape contracts for the 5 KPI dashboards + 2 batches endpoints on zord-intelligence (:8089).
// All endpoints return `data_available: false` with a `reason` when the tenant has no events
// yet — the frontend uses that to render empty-state cards instead of zeros.

export type RiskTier = 'CLEAN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type EmptyKpiResponse = {
  data_available: false
  reason?: string
}

export type Resolved<T> = T & {
  data_available: true
  tenant_id: string
  snapshot_id?: string
  computed_at?: string
  window_start?: string
  window_end?: string
}

// ── KPIs 1–6: Leakage ──────────────────────────────────────────────────────
/** Minor amounts may arrive as JSON strings or numbers from zord-intelligence. */
export type MinorAmountField = string | number

export type LeakageKpiResolved = Resolved<{
  total_intended_amount_minor: MinorAmountField
  unmatched_amount_minor: MinorAmountField
  under_settlement_amount_minor: MinorAmountField
  orphan_amount_minor: MinorAmountField
  reversal_exposure_minor: MinorAmountField
  total_observed_settled_amount_minor?: MinorAmountField
  ambiguous_value_at_risk_minor?: MinorAmountField
  risk_adjusted_leakage_minor?: MinorAmountField
  leakage_percentage: number
  risk_tier: RiskTier
  duplicate_risk_count?: number
  duplicate_risk_exposure_minor?: MinorAmountField
}>
export type LeakageKpiResponse = LeakageKpiResolved | EmptyKpiResponse

/** One point on Intended Payment Value — current vs predicted leakage chart. */
export type LeakageExposureTimeseriesPoint = {
  /** ISO date (YYYY-MM-DD) for the bucket. */
  date: string
  /** Observed / realized leakage in minor units (paise). */
  current_leakage_minor: MinorAmountField
  /** Model or forecast leakage in minor units (paise). */
  predicted_leakage_minor: MinorAmountField
  /** When true, point is after `project_start_at` (forecast-only zone). */
  is_future?: boolean
}

export type LeakageExposureGranularity = 'day' | 'week' | 'month'

export type LeakageExposureTimeseriesResolved = Resolved<{
  granularity: LeakageExposureGranularity
  batch_id?: string
  /** Optional vertical marker on chart (e.g. rollout / project start). ISO-8601. */
  project_start_at?: string
  series: LeakageExposureTimeseriesPoint[]
}>

export type LeakageExposureTimeseriesResponse =
  | LeakageExposureTimeseriesResolved
  | EmptyKpiResponse

// ── KPIs 7–10: Ambiguity ──────────────────────────────────────────────────
export type AmbiguityVelocityPoint = {
  period: string
  review_count?: number
  low_confidence_count?: number
  missing_ref_count?: number
}

export type AmbiguityVelocitySeries = {
  day?: AmbiguityVelocityPoint[]
  week?: AmbiguityVelocityPoint[]
  month?: AmbiguityVelocityPoint[]
  year?: AmbiguityVelocityPoint[]
}

export type AmbiguityMixSegment = {
  name: string
  pct: number
}

export type MatchingExecutionHeatmap = {
  y_labels: number[]
  x_labels: string[]
  cells: number[][]
  summary?: string
  intents_under_evaluation_count?: number
}

export type AmbiguityHeatmapBatchRow = {
  batch_id: string
  total_intended_amount_minor?: number
  total_count: number
  finality_status?: string
  exact_match_count: number
  high_confidence_count: number
  ambiguous_count: number
  unresolved_count: number
  conflicted_count: number
  aggregate_score: number
}

export type AmbiguityHeatmapResolved = Resolved<{
  intelligence_mode?: string
  batches: AmbiguityHeatmapBatchRow[]
}>

export type AmbiguityHeatmapResponse = AmbiguityHeatmapResolved | EmptyKpiResponse

export type AmbiguityKpiResolved = Resolved<{
  ambiguous_intent_count: number
  ambiguity_rate: number
  avg_attachment_confidence: number
  provider_ref_missing_rate: number
  value_at_risk_minor: string
  risk_tier: RiskTier
  /** Optional extended KPIs when zord-intelligence ships them. */
  low_confidence_rate?: number
  candidate_collision_rate?: number
  ambiguous_amount_rate?: number
  carrier_completeness_rate?: number
  /** Period-over-period deltas for KPI pills (percent points). */
  ambiguous_intent_count_delta_pct?: number
  ambiguity_rate_delta_pct?: number
  provider_ref_missing_rate_delta_pct?: number
  value_at_risk_delta_pct?: number
  value_at_risk_delta_pct_from_prior?: number
  avg_attachment_confidence_delta_pct?: number
  confidence_trend_label?: string
  /** Stacked bar chart — Ambiguity Velocity. */
  velocity_series?: AmbiguityVelocitySeries
  /** Donut — Ambiguity Mix. When set, overrides derived mix from snapshot rates. */
  ambiguity_mix_segments?: AmbiguityMixSegment[]
  clearing_pct?: number
  /** Heatmap — Matching Execution Log. */
  matching_execution_heatmap?: MatchingExecutionHeatmap
  matching_execution_summary?: string
  intents_under_evaluation_count?: number
  /** Data quality audit card. */
  critical_alert_count?: number
  /** Zord Intelligence panel copy (optional). */
  intelligence_headline?: string
  intelligence_body?: string
}>
export type AmbiguityKpiResponse = AmbiguityKpiResolved | EmptyKpiResponse

// ── KPIs 11–13: Defensibility ─────────────────────────────────────────────
export type DefensibilityTier = 'STRONG' | 'GOOD' | 'WEAK' | 'FRAGILE'
export type DefensibilityKpiResolved = Resolved<{
  evidence_pack_rate: number
  governance_coverage_pct: number
  replayability_pct: number
  defensibility_score: number
  defensibility_tier: DefensibilityTier | string
  audit_ready_pct: number
  dispute_ready_pct: number
  avg_pack_completeness_score?: number
  settlement_evidence_coverage?: number
  attachment_evidence_coverage?: number
  weak_evidence_count?: number
  weak_evidence_rate?: number
}>
export type DefensibilityKpiResponse = DefensibilityKpiResolved | EmptyKpiResponse

// ── KPI 14: Pattern / Batch anomaly ───────────────────────────────────────
export type AnomalyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INSUFFICIENT_DATA' | string
export type FinalityStatus =
  | 'PENDING'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REQUIRES_REVIEW'
  | 'PROCESSING'
  | 'FULLY_SETTLED'
  | string
export type ProviderDecisionStats = {
  total_decisions: number
  successful_decision_count: number
  decision_success_rate: number | string
  ambiguity_rate: number | string
  unresolved_decisions: number
  orphan_rate: number | string
}

export type PatternsKpiResolved = Resolved<{
  batch_id?: string
  batch_anomaly_score: number
  anomaly_level: AnomalyLevel
  anomaly_type?: string
  batch_quality_score?: number
  batch_risk_score: number
  risk_tier: RiskTier | string
  finality_status: FinalityStatus
  total_count: number
  success_count: number
  failed_count: number
  pending_count: number
  exact_match_count?: number
  high_confidence_count?: number
  ambiguous_count?: number
  unresolved_count?: number
  conflicted_count?: number
  duplicate_risk_rate?: number
  duplicate_risk_count?: number
  value_date_mismatch_count?: number
  value_date_mismatch_rate?: number
  settlement_delay_p95_days?: number
  same_beneficiary_amount_density?: number
  /** A9 — tenant-wide decision success rate (present even when data_available is false). */
  decision_success_rate?: number | string
  /** A9 — per-provider breakdown from pattern.provider projections. */
  by_provider?: Record<string, ProviderDecisionStats>
}>
export type PatternsKpiResponse =
  | PatternsKpiResolved
  | (EmptyKpiResponse & {
      tenant_id?: string
      intelligence_mode?: string
      batch_id?: string
      decision_success_rate?: number | string
      by_provider?: Record<string, ProviderDecisionStats>
      batch_anomaly_score?: number
      anomaly_level?: AnomalyLevel
      value_date_mismatch_count?: number
      value_date_mismatch_rate?: number
    })

// ── Batch contract dashboard (settlement journal KPIs) ────────────────────
export type BatchContractKpiResponse = {
  tenant_id: string
  intelligence_mode?: string
  batch_id: string
  bank_reference_coverage?: string | null
  settlement_ref_count?: number
  bank_ref_present_count?: number
  client_ref_present_count?: number
  client_reference_coverage?: string | null
  variance_amount?: MinorAmountField
  orphan_amount?: MinorAmountField
  unmatch_amount?: MinorAmountField
  total_confirmed_amount?: MinorAmountField
  match_confidence?: number | null
  missing_reference_rate?: string | number
}

// ── KPIs 15–16: Recommendations ───────────────────────────────────────────
export type RecommendationsKpiResolved = Resolved<{
  action_acceptance_rate: number
  action_resolution_rate: number
  total_actions: number
  accepted_actions: number
  resolved_actions: number
  recommendation_priority_score?: number
  recommendation_impact_estimate_minor?: MinorAmountField
}>
export type RecommendationsKpiResponse = RecommendationsKpiResolved | EmptyKpiResponse

// ── RCA dashboard (R4–R8) ─────────────────────────────────────────────────
export type RcaKpiResolved = Resolved<{
  parser_weakness_rate: number
  weak_parse_count: number
  mapping_weakness_rate: number
  weak_mapping_count: number
  source_system_defect_rate: number
  source_system_defects?: Record<string, number>
  rca_concentration: number
  total_settlements: number
}>
export type RcaKpiResponse = RcaKpiResolved | EmptyKpiResponse

// ── Batches list ──────────────────────────────────────────────────────────
export type IntelligenceBatchRow = {
  batch_id: string
  tenant_id: string
  /** Settlement source / partner label from batch_contracts (when present). */
  source_reference?: string | null
  finality_status: FinalityStatus
  batch_finality_status?: FinalityStatus
  total_count: number
  success_count: number
  failed_count: number
  pending_count: number
  /** When batches list includes ambiguity projections. */
  match_confidence_pct?: number
  value_at_risk_minor?: MinorAmountField
  unmatched_amount_minor?: MinorAmountField
  unexplained_variance_minor?: MinorAmountField
  total_variance_minor?: MinorAmountField
  total_confirmed_amount_minor?: MinorAmountField
  total_intended_amount_minor?: MinorAmountField
  orphan_amount_minor?: MinorAmountField
  missing_ref_count?: number
  settlement_ref_count?: number
  bank_ref_present_count?: number
  ambiguity_score?: number | null
  status_label?: string
}
export type BatchesListResponse = {
  tenant_id: string
  intelligence_mode: string
  status_filter: string
  batches: IntelligenceBatchRow[]
}

// ── Single batch detail (row + projection) ────────────────────────────────
export type BatchHealth = {
  total_count?: number
  success_count?: number
  failed_count?: number
  pending_count?: number
  reversed_count?: number
  partial_recon_count?: number
  total_intended_amount_minor: string | number
  total_confirmed_amount_minor: string | number
  total_variance_minor: string | number
  ambiguity_score: number
  exact_match_count?: number
  high_confidence_count?: number
  ambiguous_count?: number
  unresolved_count?: number
  conflicted_count?: number
  aggregate_score?: number
  finality_status: FinalityStatus | string
  updated_at?: string
}
export type BatchDetailResponse = {
  tenant_id: string
  intelligence_mode: string
  batch: IntelligenceBatchRow
  batch_health: BatchHealth | null
}

export function isDataAvailable<T extends EmptyKpiResponse | { data_available: true }>(
  res: T | null | undefined,
): res is Exclude<T, EmptyKpiResponse> {
  return Boolean(res && (res as { data_available?: boolean }).data_available === true)
}
