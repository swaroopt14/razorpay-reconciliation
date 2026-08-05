import type { LeakageKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { coerceMinor } from './utils/formatMinorInr'

function minorOrNull(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export type PortfolioLeakageViewModel = {
  totalSettledMinor: number
  intendedMinor: number
  underSettlementMinor: number | null
  unmatchedMinor: number | null
  orphanMinor: number | null
  reversalMinor: number | null
  ambiguousRiskMinor: number
  riskAdjustedMinor: number
  /** Open financial exception value from API `total_amount_minor` only — null when missing. */
  openFinancialExceptionValueMinor: number | null
  /** Exposure amount — leakage `unmatched_amount_minor`. */
  exposureAmountMinor: number | null
  /** @deprecated use exposureAmountMinor */
  valueNeedingReviewMinor: number | null
  paymentGapRate: number | null
  leakageFraction: number | null
  riskTier: string | null
  tenantId: string
  snapshotId: string
  computedAt: string
  windowStart: string
  windowEnd: string
}

export function toPortfolioLeakageViewModel(leak: LeakageKpiResolved): PortfolioLeakageViewModel {
  const unmatchedMinor = minorOrNull(leak.unmatched_amount_minor)
  const underSettlementMinor = minorOrNull(leak.under_settlement_amount_minor)
  const orphanMinor = minorOrNull(leak.orphan_amount_minor)
  const reversalMinor = minorOrNull(leak.reversal_exposure_minor)
  const ambiguousRiskMinor = coerceMinor(leak.ambiguous_value_at_risk_minor)
  const paymentGapRate =
    leak.leakage_percentage != null && Number.isFinite(Number(leak.leakage_percentage))
      ? Number(leak.leakage_percentage)
      : null
  const totalAmountRaw = leak.total_amount_minor
  const openFinancialExceptionValueMinor =
    totalAmountRaw != null && String(totalAmountRaw).trim() !== '' ? coerceMinor(totalAmountRaw) : null

  return {
    totalSettledMinor: coerceMinor(leak.total_observed_settled_amount_minor),
    intendedMinor: coerceMinor(leak.total_intended_amount_minor),
    underSettlementMinor,
    unmatchedMinor,
    orphanMinor,
    reversalMinor,
    ambiguousRiskMinor,
    riskAdjustedMinor: coerceMinor(leak.risk_adjusted_leakage_minor),
    openFinancialExceptionValueMinor,
    exposureAmountMinor: unmatchedMinor,
    valueNeedingReviewMinor: unmatchedMinor,
    paymentGapRate,
    leakageFraction: paymentGapRate,
    riskTier: leak.risk_tier?.trim() ? leak.risk_tier.trim() : null,
    tenantId: leak.tenant_id,
    snapshotId: leak.snapshot_id?.trim() ? leak.snapshot_id.trim() : '—',
    computedAt: leak.computed_at ?? '',
    windowStart: leak.window_start ?? '',
    windowEnd: leak.window_end ?? '',
  }
}
