import type {
  BatchRiskSignal,
  RecommendationCard,
} from '@/services/payout-command/prod-api/intelligencePatternTypes'

const RISK_SIGNAL_HEADLINES: Record<string, string> = {
  HIGH_AMBIGUITY: 'Match ambiguity near limit',
  UNRESOLVED_OR_MISSING_REF_RATE: 'Missing payment references',
  SETTLEMENT_GAP: 'Settlement not confirmed',
  HIGH_VARIANCE_RATIO: 'Payment variance above limit',
}

const RCA_CLUSTER_LABELS: Record<string, string> = {
  OSL: 'Over-settlement',
  OVER_SETTLEMENT: 'Over-settlement',
  USL: 'Short-settlement',
  UNDER_SETTLEMENT: 'Short-settlement',
}

function severityHeadline(severity: string | undefined): string {
  const normalized = (severity || 'INFO').toUpperCase()
  if (normalized === 'CRITICAL') return 'CRITICAL'
  if (normalized === 'HIGH') return 'HIGH'
  if (normalized === 'MEDIUM') return 'WATCH'
  if (normalized === 'LOW') return 'INFO'
  return normalized
}

function pctLabel(value: number | undefined | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 100)
}

function ownerLabel(card: RecommendationCard): string {
  const owner = card.action_owner?.trim()
  return owner ? `Owner: ${owner}` : 'Owner: Finance Ops'
}

export function isDeferredRecommendation(card: RecommendationCard): boolean {
  const haystack = [card.title, card.action, card.reason, card.expected_improvement]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes('replay-equivalent') || haystack.includes('replay equivalent')
}

export function formatRiskSignalInsight(signal: BatchRiskSignal): string {
  const code = (signal.signal || '').toUpperCase()
  const headline = severityHeadline(signal.severity)
  const valuePct = pctLabel(signal.value)
  const thresholdPct = pctLabel(signal.threshold)

  if (code === 'HIGH_AMBIGUITY' && valuePct != null && thresholdPct != null) {
    return `${headline}: Match ambiguity at ${valuePct}% (review limit: ${thresholdPct}%). Payments with more than one possible settlement match require manual confirmation before close.`
  }

  if (code === 'UNRESOLVED_OR_MISSING_REF_RATE' && valuePct != null && thresholdPct != null) {
    return `${headline}: Missing payment references at ${valuePct}% (safe limit: ${thresholdPct}%). Payments without a bank or UTR reference cannot be confirmed or evidenced by Zord.`
  }

  if (code === 'SETTLEMENT_GAP' && valuePct != null && thresholdPct != null) {
    return `${headline}: Settlement gap at ${valuePct}% of this batch (limit: ${thresholdPct}%). The bank or settlement file may be pending upload, or funds have not yet settled.`
  }

  if (code === 'HIGH_VARIANCE_RATIO' && valuePct != null && thresholdPct != null) {
    return `${headline}: Payment variance at ${valuePct}% (limit: ${thresholdPct}%). Settled amounts differ from instructed values. Review variance before batch close.`
  }

  const label = RISK_SIGNAL_HEADLINES[code] || code.replace(/_/g, ' ').toLowerCase()
  if (valuePct != null && thresholdPct != null) {
    return `${headline}: ${label} at ${valuePct}% (limit: ${thresholdPct}%).`
  }
  return `${headline}: ${label}.`
}

export function formatPatternBatchInsight(batchId: string, riskTier: string | undefined): string {
  return `Batch ${batchId} analysis complete. Overall risk level: ${(riskTier || 'Unknown').toUpperCase()}`
}

export function formatRcaConcentration(pct: number): string {
  const rounded = Math.round(pct)
  return `${rounded}% of issues trace back to source data errors in uploaded payout or settlement files. Correcting the source file will resolve the majority of these cases.`
}

type FormattedRecommendation = {
  headline: string
  body: string
}

function formatSettlementMatch(rawTitle: string): FormattedRecommendation | null {
  const match = rawTitle.match(/(\d+)\s+intents?\s+have\s+no\s+settlement\s+match/i)
  if (!match) return null
  return {
    headline: `${match[1]} payments have no matching settlement`,
    body: 'Upload the settlement/bank file for this batch, or review these payments for non-receipt.',
  }
}

function formatAuditReady(rawTitle: string): FormattedRecommendation | null {
  const match = rawTitle.match(/only\s+([\d.]+)%\s+of\s+payments\s+are\s+audit-ready/i)
  if (!match) return null
  const pct = Math.round(Number.parseFloat(match[1]))
  return {
    headline: `Only ${pct}% of payments are audit-ready`,
    body: 'Add missing references and confirmations to raise audit-readiness before close.',
  }
}

function formatEvidenceGap(rawTitle: string): FormattedRecommendation | null {
  if (!/evidence gap|pack coverage|missing leaf/i.test(rawTitle)) return null
  return {
    headline: 'No evidence packs generated yet',
    body: 'Generate evidence packs so payments are dispute- and audit-ready.',
  }
}

function formatRcaCluster(rawTitle: string): FormattedRecommendation | null {
  const match = rawTitle.match(/RCA\s+Cluster:\s*([A-Z0-9_]+)(?:\s*\(([^)]+)\))?/i)
  if (!match) return null
  const code = match[1].toUpperCase()
  const label = RCA_CLUSTER_LABELS[code] || RCA_CLUSTER_LABELS[match[2]?.toUpperCase() || ''] || 'Payment variance'
  return {
    headline: `Top issue: ${label}`,
    body: 'Some vendors received more than the instructed amount. Review for duplicate or excess payouts.',
  }
}

function formatRecommendationParts(card: RecommendationCard): FormattedRecommendation {
  const raw = card.title?.trim() || card.action?.trim() || 'Recommendation'
  return (
    formatSettlementMatch(raw) ||
    formatAuditReady(raw) ||
    formatEvidenceGap(raw) ||
    formatRcaCluster(raw) || {
      headline: raw.replace(/missing leaf rate/gi, 'incomplete evidence').replace(/RCA\s+Cluster/gi, 'Root cause'),
      body: card.reason?.trim() || card.expected_improvement?.trim() || 'Review this recommendation with finance ops.',
    }
  )
}

export function formatRecommendationTitle(card: RecommendationCard): string {
  const priority = (card.priority || 'MEDIUM').toUpperCase()
  const { headline } = formatRecommendationParts(card)
  return `${priority} · ${headline}`
}

export function formatRecommendationImpactLabel(card: RecommendationCard): string {
  const { body } = formatRecommendationParts(card)
  return `${body} · ${ownerLabel(card)}`
}
