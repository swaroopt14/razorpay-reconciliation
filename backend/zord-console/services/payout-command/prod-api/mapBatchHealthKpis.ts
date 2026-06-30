import type { BatchHealth, LeakageKpiResolved } from './intelligenceTypes'
import type { PortfolioLeakageViewModel } from '@/features/payout-command/leakage-portfolio/normalizeLeakagePayload'
import { toPortfolioLeakageViewModel } from '@/features/payout-command/leakage-portfolio/normalizeLeakagePayload'
import { coerceMinor } from '@/features/payout-command/leakage-portfolio/utils/formatMinorInr'

function parseCount(raw: number | string | undefined | null): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Maps batch.health projection into ambiguity KPI strip values when a batch is selected. */
export function batchHealthToAmbiguityKpis(health: BatchHealth) {
  const totalCount = parseCount(health.total_count)
  const ambiguousCount = parseCount(health.ambiguous_count)
  const unresolvedCount = parseCount(health.unresolved_count)
  const ambiguityRate =
    totalCount > 0
      ? ambiguousCount / totalCount
      : typeof health.ambiguity_score === 'number'
        ? health.ambiguity_score
        : 0
  const missingRefRate = totalCount > 0 ? unresolvedCount / totalCount : 0

  return {
    ambiguous_intent_count: ambiguousCount,
    ambiguity_rate: ambiguityRate,
    provider_ref_missing_rate: missingRefRate,
    value_at_risk_minor: '',
  }
}

/** Batch-scoped money context from batch_health (variance only — not orphan/short-settled/reversal). */
export function batchHealthToLeakageViewModel(
  health: BatchHealth,
  batchId: string,
  tenantId = '—',
): PortfolioLeakageViewModel {
  const intendedMinor = coerceMinor(health.total_intended_amount_minor)
  const confirmedMinor = coerceMinor(health.total_confirmed_amount_minor)
  const varianceMinor = Math.max(0, coerceMinor(health.total_variance_minor))
  const ambiguousRiskMinor = parseCount(health.ambiguous_count) > 0 ? varianceMinor : 0
  const paymentGapRate = intendedMinor > 0 ? varianceMinor / intendedMinor : 0

  return {
    totalSettledMinor: confirmedMinor,
    intendedMinor,
    underSettlementMinor: 0,
    unmatchedMinor: varianceMinor,
    orphanMinor: 0,
    reversalMinor: 0,
    ambiguousRiskMinor,
    riskAdjustedMinor: varianceMinor,
    openFinancialExceptionValueMinor: null,
    exposureAmountMinor: varianceMinor,
    valueNeedingReviewMinor: varianceMinor,
    paymentGapRate,
    leakageFraction: paymentGapRate,
    riskTier: health.finality_status?.trim() ? String(health.finality_status).trim() : null,
    tenantId,
    snapshotId: `batch:${batchId}`,
    computedAt: health.updated_at ?? '',
    windowStart: '',
    windowEnd: '',
  }
}

/** Merge tenant leakage breakdown with batch variance when a batch is selected. */
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
    orphanMinor: tenantVm.orphanMinor,
    reversalMinor: tenantVm.reversalMinor,
    ambiguousRiskMinor: Math.max(tenantVm.ambiguousRiskMinor, batchVm.ambiguousRiskMinor),
    riskAdjustedMinor: tenantVm.riskAdjustedMinor || batchVm.riskAdjustedMinor,
    openFinancialExceptionValueMinor: tenantVm.openFinancialExceptionValueMinor,
    exposureAmountMinor: tenantVm.exposureAmountMinor,
    valueNeedingReviewMinor: tenantVm.valueNeedingReviewMinor,
    riskTier: tenantVm.riskTier ?? batchVm.riskTier,
  }
}

