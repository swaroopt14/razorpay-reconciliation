import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'

export type ReviewReason = {
  id: string
  label: string
  severity: 'high' | 'medium' | 'low'
}

/** Thresholds as 0-1 ratios; normalize API values that may already be 0-100. */
const REF_HIGH = 0.05
const REF_MED = 0.02
const RATE_HIGH = 0.08
const RATE_MED = 0.03
const CONF_LOW = 0.5
const CONF_MED = 0.8

function toRatio(value: number): number {
  return value > 1 ? value / 100 : value
}

export function deriveReviewReasons(amb: AmbiguityKpiResolved | null): ReviewReason[] {
  if (!amb) return []

  const reasons: ReviewReason[] = []
  const refRate = toRatio(amb.provider_ref_missing_rate ?? 0)
  const reviewRate = toRatio(amb.ambiguity_rate ?? 0)
  const conf = toRatio(amb.avg_attachment_confidence ?? 0)
  const lowConfRate = amb.low_confidence_rate != null ? toRatio(amb.low_confidence_rate) : Math.max(0, 1 - conf)
  const collisionRate = amb.candidate_collision_rate != null ? toRatio(amb.candidate_collision_rate) : null

  if (refRate > REF_HIGH) {
    reasons.push({ id: 'missing-ref', label: ambiguityCopy.topReasons.missingRef, severity: 'high' })
  } else if (refRate > REF_MED) {
    reasons.push({ id: 'missing-ref', label: ambiguityCopy.topReasons.missingRef, severity: 'medium' })
  }

  if (lowConfRate > 0.25 || conf < CONF_LOW) {
    reasons.push({ id: 'low-conf', label: ambiguityCopy.topReasons.lowConfidence, severity: 'high' })
  } else if (conf < CONF_MED) {
    reasons.push({ id: 'low-conf', label: ambiguityCopy.topReasons.lowConfidence, severity: 'medium' })
  }

  if (reviewRate > RATE_HIGH) {
    reasons.push({ id: 'review-rate', label: ambiguityCopy.topReasons.highReviewRate, severity: 'high' })
  } else if (reviewRate > RATE_MED) {
    reasons.push({ id: 'review-rate', label: ambiguityCopy.topReasons.highReviewRate, severity: 'medium' })
  }

  if (collisionRate != null && collisionRate > 0.05) {
    reasons.push({
      id: 'collision',
      label: ambiguityCopy.topReasons.multipleMatches,
      severity: collisionRate > 0.12 ? 'high' : 'medium',
    })
  }

  const order = { high: 0, medium: 1, low: 2 }
  return reasons.sort((a, b) => order[a.severity] - order[b.severity])
}
