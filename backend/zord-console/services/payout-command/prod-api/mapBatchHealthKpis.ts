import type { BatchHealth, LeakageKpiResolved } from './intelligenceTypes'
import type { PortfolioLeakageViewModel } from '@/features/payout-command/leakage-portfolio/normalizeLeakagePayload'
import { toPortfolioLeakageViewModel } from '@/features/payout-command/leakage-portfolio/normalizeLeakagePayload'
import { coerceMinor } from '@/features/payout-command/leakage-portfolio/utils/formatMinorInr'

/**
 * CON-P1-22 — batch_health projections must not invent live KPI stand-ins.
 * Missing authoritative fields ⇒ null / Unavailable at the UI layer.
 * Do not map ambiguity_score → rate, unresolved_count → provider-ref rate, or variance → unmatched.
 */

function parseCount(raw: number | string | undefined | null): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export const BATCH_HEALTH_LIVE_KPI_SOURCES = {
  ambiguityRate: 'batch_health.ambiguous_count / batch_health.total_count',
  providerRefMissingRate: null as string | null, // no authoritative field on batch_health
  unmatchedMinor: null as string | null, // do not use total_variance_minor
  intendedMinor: 'batch_health.total_intended_amount_minor',
  confirmedMinor: 'batch_health.total_confirmed_amount_minor',
} as const

/** Maps batch.health into ambiguity strip values when a batch is selected — no score stand-ins. */
export function batchHealthToAmbiguityKpis(health: BatchHealth) {
  const totalCount = parseCount(health.total_count)
  const ambiguousCount = parseCount(health.ambiguous_count)
  const ambiguityRate =
    totalCount != null && totalCount > 0 && ambiguousCount != null
      ? ambiguousCount / totalCount
      : null

  return {
    ambiguous_intent_count: ambiguousCount,
    ambiguity_rate: ambiguityRate,
    /** No authoritative provider-ref-missing rate on batch_health — never substitute unresolved/total. */
    provider_ref_missing_rate: null as number | null,
    value_at_risk_minor: '',
    sources: {
      ambiguity_rate: BATCH_HEALTH_LIVE_KPI_SOURCES.ambiguityRate,
      provider_ref_missing_rate: BATCH_HEALTH_LIVE_KPI_SOURCES.providerRefMissingRate,
    },
    asOf: health.updated_at ?? null,
  }
}

/**
 * Batch-scoped money context from batch_health.
 * Variance is not unmatched / exposure — those stay null unless a true leakage KPI is merged.
 */
export function batchHealthToLeakageViewModel(
  health: BatchHealth,
  batchId: string,
  tenantId = '—',
): PortfolioLeakageViewModel {
  const intendedMinor = coerceMinor(health.total_intended_amount_minor)
  const confirmedMinor = coerceMinor(health.total_confirmed_amount_minor)

  return {
    totalSettledMinor: confirmedMinor,
    intendedMinor,
    underSettlementMinor: null,
    unmatchedMinor: null,
    orphanMinor: null,
    reversalMinor: null,
    ambiguousRiskMinor: 0,
    riskAdjustedMinor: 0,
    openFinancialExceptionValueMinor: null,
    exposureAmountMinor: null,
    valueNeedingReviewMinor: null,
    paymentGapRate: null,
    leakageFraction: null,
    riskTier: health.finality_status?.trim() ? String(health.finality_status).trim() : null,
    tenantId,
    snapshotId: `batch:${batchId}`,
    computedAt: health.updated_at ?? '',
    windowStart: '',
    windowEnd: '',
  }
}

/** Merge tenant leakage breakdown when available — batch health never invents unmatched from variance. */
export function mergeBatchHealthWithTenantLeakage(
  health: BatchHealth,
  batchId: string,
  tenantLeakage: LeakageKpiResolved | null,
  tenantId = '—',
): PortfolioLeakageViewModel {
  const batchVm = batchHealthToLeakageViewModel(health, batchId, tenantId)
  if (!tenantLeakage) return batchVm

  const tenantVm = toPortfolioLeakageViewModel(tenantLeakage)
  return {
    ...batchVm,
    underSettlementMinor: tenantVm.underSettlementMinor,
    unmatchedMinor: tenantVm.unmatchedMinor,
    orphanMinor: tenantVm.orphanMinor,
    reversalMinor: tenantVm.reversalMinor,
    ambiguousRiskMinor: tenantVm.ambiguousRiskMinor,
    riskAdjustedMinor: tenantVm.riskAdjustedMinor,
    openFinancialExceptionValueMinor: tenantVm.openFinancialExceptionValueMinor,
    exposureAmountMinor: tenantVm.exposureAmountMinor,
    valueNeedingReviewMinor: tenantVm.valueNeedingReviewMinor,
    paymentGapRate: tenantVm.paymentGapRate,
    leakageFraction: tenantVm.leakageFraction,
    riskTier: tenantVm.riskTier ?? batchVm.riskTier,
    computedAt: tenantVm.computedAt || batchVm.computedAt,
    snapshotId: tenantVm.snapshotId !== '—' ? tenantVm.snapshotId : batchVm.snapshotId,
  }
}
