import type {
  AmbiguityKpiResolved,
  LeakageKpiResolved,
  PatternsKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { fmtInrFromMinorExact } from '../command-center/commandCenterFormat'
import { formatLeakageApiPct } from '../shared/formatApiKpiFields'
import type { ZordInsightItem } from '../shared/ZordInsightsPanel'

type MinorField = string | number | null | undefined

function readMinor(value: MinorField): number | null {
  if (value == null || String(value).trim() === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function formatMinor(value: MinorField): string {
  const minor = readMinor(value)
  return minor == null ? '—' : fmtInrFromMinorExact(minor)
}

function riskSeverity(tier: string | undefined): ZordInsightItem['severity'] {
  const normalized = tier?.toUpperCase()
  if (normalized === 'HIGH' || normalized === 'CRITICAL') return 'high'
  if (normalized === 'MEDIUM') return 'medium'
  return 'low'
}

function endpointRiskSeverity(tier: string | undefined): ZordInsightItem['severity'] | undefined {
  const normalized = tier?.toUpperCase()
  if (normalized === 'HIGH' || normalized === 'CRITICAL') return 'high'
  if (normalized === 'MEDIUM') return 'medium'
  if (normalized === 'LOW' || normalized === 'CLEAN') return 'low'
  return undefined
}

function ambiguitySeverity(ambiguity: AmbiguityKpiResolved): ZordInsightItem['severity'] {
  const tier = endpointRiskSeverity(ambiguity.risk_tier)
  if (tier) return tier
  const score = ambiguity.ambiguity_severity_score
  if (score == null || !Number.isFinite(score)) return undefined
  if (score >= 50) return 'high'
  if (score >= 10) return 'medium'
  return 'low'
}

function formatApiPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null
  return `${value}%`
}
const MAX_INSIGHTS = 6

/** Payment Gaps — insight list from leakage and ambiguity APIs only. */
export function buildLeakagePageInsightItems(params: {
  leakage: LeakageKpiResolved | null
  ambiguity: AmbiguityKpiResolved | null
}): ZordInsightItem[] {
  const { leakage, ambiguity } = params
  const items: ZordInsightItem[] = []

  if (ambiguity?.intelligence_headline?.trim()) {
    const body = ambiguity.intelligence_body?.trim()
    items.push({
      title: ambiguity.intelligence_headline.trim(),
      detail: body || '—',
      severity: 'high',
      caseCount: ambiguity.ambiguous_intent_count,
    })
  }

  const openException = formatMinor(leakage?.total_amount_minor)
  if (openException !== '—') {
    items.push({
      title: 'Open financial exception value',
      detail: `${openException} in open exposure (total_amount_minor).`,
      severity: riskSeverity(leakage?.risk_tier),
      ...(ambiguity?.ambiguous_intent_count != null
        ? { caseCount: ambiguity.ambiguous_intent_count }
        : {}),
    })
  }

  if (leakage?.leakage_percentage != null) {
    const gapRate = `${leakage.leakage_percentage}%`
    if (gapRate !== '—') {
      items.push({
        title: 'Payment gap rate',
        detail: `Leakage percentage is ${gapRate} for this scope.`,
        severity: riskSeverity(leakage.risk_tier),
      })
    }
  }

  const unmatched = formatMinor(leakage?.unmatched_amount_minor)
  if (unmatched !== '—') {
    items.push({
      title: 'Unmatched payment value',
      detail: `${unmatched} in intended payments without a settlement link.`,
      severity: 'medium',
      caseCount: ambiguity?.ambiguous_intent_count,
    })
  }

  const shortSettled = formatMinor(leakage?.under_settlement_amount_minor)
  if (shortSettled !== '—') {
    items.push({
      title: 'Short-settled value',
      detail: `${shortSettled} where settlement was below the instructed amount.`,
      severity: 'medium',
    })
  }

  const reversal = formatMinor(leakage?.reversal_exposure_minor)
  if (reversal !== '—') {
    items.push({
      title: 'Reversal exposure',
      detail: `${reversal} exposed to reversal risk.`,
      severity: 'medium',
    })
  }

  if (ambiguity?.ambiguous_intent_count != null && ambiguity.ambiguous_intent_count > 0) {
    items.push({
      title: 'Payments needing review',
      detail: `${ambiguity.ambiguous_intent_count} payment intents need review in this scope.`,
      severity: 'medium',
      caseCount: ambiguity.ambiguous_intent_count,
    })
  }

  return items.slice(0, MAX_INSIGHTS)
}

/** Match Review — insight list from ambiguity API only. */
export function buildMatchReviewInsightItems(params: {
  ambiguity: AmbiguityKpiResolved | null
}): ZordInsightItem[] {
  const { ambiguity } = params
  const items: ZordInsightItem[] = []
  if (!ambiguity) return items
   const severity = ambiguitySeverity(ambiguity)
  const caseCount = ambiguity.ambiguous_intent_count
  const valueAtRisk = formatMinor(ambiguity.value_at_risk_minor)
  if (readMinor(ambiguity.value_at_risk_minor) != null) {
     items.push({
       title: 'Ambiguous match review value',
      detail: `${valueAtRisk} in match-review exposure from ambiguous attachment decisions.`,
      severity,
      caseCount,
    })
  }
  const ambiguityRate = formatApiPercent(ambiguity.ambiguity_rate)
  if (ambiguityRate) {
    items.push({
       title: 'Ambiguity rate',
      detail: `${ambiguityRate} of attachment decisions landed in ambiguous review for this scope.`,
      severity,  
    })
  }
  const lowConfidenceRate = formatApiPercent(ambiguity.low_confidence_rate)
  if (lowConfidenceRate) {
    items.push({
        title: 'Low-confidence signal rate',
      detail: `${lowConfidenceRate} of match signals are below the confidence threshold.`,
      severity, 
    })
  }
  const missingRefRate = formatApiPercent(ambiguity.provider_ref_missing_rate)
  if (missingRefRate) {
    items.push({
       title: 'Missing provider reference rate',
      detail: `${missingRefRate} of payment records are missing provider reference coverage.`,
      severity,
    })
  }
   const candidateCollisionRate = formatApiPercent(ambiguity.candidate_collision_rate)
  if (candidateCollisionRate) {
    items.push({
       title: 'Candidate collision rate',
      detail: `${candidateCollisionRate} of decisions have competing candidate matches.`,
      severity,
    })
  }
   if (caseCount != null) {
    items.push({
       title: 'Payments needing review',
      detail: `${caseCount} payment intents need ambiguity review in this scope.`,
      severity,
    })
  }
    return items.slice(0, MAX_INSIGHTS)
}