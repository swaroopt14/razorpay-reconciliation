import type { LeakageKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { coerceMinor } from './utils/formatMinorInr'

export type PortfolioLeakageViewModel = {
  totalSettledMinor: number
  intendedMinor: number
  underSettlementMinor: number
  unmatchedMinor: number
  orphanMinor: number
  reversalMinor: number
  ambiguousRiskMinor: number
  riskAdjustedMinor: number
  /** Value needing review — leakage `unmatched_amount_minor` only. */
  valueNeedingReviewMinor: number
  paymentGapRate: number
  leakageFraction: number
  riskTier: string
  tenantId: string
  snapshotId: string
  computedAt: string
  windowStart: string
  windowEnd: string
}

export function toPortfolioLeakageViewModel(leak: LeakageKpiResolved): PortfolioLeakageViewModel {
  const unmatchedMinor = coerceMinor(leak.unmatched_amount_minor)
  const underSettlementMinor = coerceMinor(leak.under_settlement_amount_minor)
  const orphanMinor = coerceMinor(leak.orphan_amount_minor)
  const reversalMinor = coerceMinor(leak.reversal_exposure_minor)
  const ambiguousRiskMinor = coerceMinor(leak.ambiguous_value_at_risk_minor)
  const paymentGapRate = leak.leakage_percentage ?? 0

  return {
    totalSettledMinor: coerceMinor(leak.total_observed_settled_amount_minor),
    intendedMinor: coerceMinor(leak.total_intended_amount_minor),
    underSettlementMinor,
    unmatchedMinor,
    orphanMinor,
    reversalMinor,
    ambiguousRiskMinor,
    riskAdjustedMinor: coerceMinor(leak.risk_adjusted_leakage_minor),
    valueNeedingReviewMinor: unmatchedMinor,
    paymentGapRate,
    leakageFraction: paymentGapRate,
    riskTier: leak.risk_tier ?? 'N/A',
    tenantId: leak.tenant_id,
    snapshotId: leak.snapshot_id ?? '—',
    computedAt: leak.computed_at ?? '',
    windowStart: leak.window_start ?? '',
    windowEnd: leak.window_end ?? '',
  }
}
