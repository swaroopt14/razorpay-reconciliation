import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'

export function deriveRiskScore(
  data: PortfolioLeakageViewModel,
  defensibility: DefensibilityKpiResolved | null,
): number {
  const tier = (data.riskTier ?? '').toUpperCase()
  const frac = data.leakageFraction > 1 ? data.leakageFraction / 100 : data.leakageFraction

  if ((tier === 'CLEAN' || tier === 'LOW') && frac < 0.02) return 99
  if (defensibility?.defensibility_score != null && Number.isFinite(defensibility.defensibility_score)) {
    return Math.round(Math.min(65, Math.max(0, defensibility.defensibility_score)))
  }
  if (tier === 'CRITICAL' || tier === 'HIGH') return 27
  if (tier === 'MEDIUM') return 44
  return 55
}
