import type { IntentJournalPaymentIntentItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalIntentRow, JournalIntentStatus } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { readIntentQualityScore } from '@/services/payout-command/prod-api/resolveIntentQualityScore'
import { mapJournalIntentDecision } from './mapJournalIntentDecision'

export { mapJournalIntentDecision } from './mapJournalIntentDecision'

export const READINESS_REVIEW_THRESHOLD = 0.7

function formatJournalExecutionAt(iso: string | undefined): string {
  const s = apiTrimmedString(iso)
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatConfidenceLabel(score: number | undefined): string {
  if (score == null || !Number.isFinite(score)) return '—'
  const pct = score <= 1 ? score * 100 : score
  return `${pct.toFixed(0)}%`
}

function resolveProviderHint(item: IntentJournalPaymentIntentItem): string {
  const h =
    apiTrimmedString(item.provider_hint) ||
    apiTrimmedString(item.beneficiary_type) ||
    apiTrimmedString(item.rail_hint)
  if (!h) return '—'
  return h.charAt(0).toUpperCase() + h.slice(1)
}

function parseAmount(raw: string | number | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const n = Number.parseFloat(String(raw ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseSourceRowNum(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.round(raw))
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseInt(raw.trim(), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function resolveRailHint(item: IntentJournalPaymentIntentItem): string {
  const rail = apiTrimmedString(item.rail_hint)
  return rail || '—'
}

function methodFromRail(rail: string): JournalIntentRow['method'] {
  if (rail === '—') return '—'
  const r = rail.toUpperCase()
  if (r.includes('NACH')) return 'NACH'
  if (r.includes('IMPS') || r.includes('UPI') || r.includes('LSM')) return 'LSM'
  return 'Bank Transfer'
}

function beneficiaryNameHint(item: IntentJournalPaymentIntentItem): string | null {
  const raw = (item.beneficiary as { name?: unknown } | undefined)?.name
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return null
}

function buildZordId(requestId: string, batchId: string, index: number): string {
  const source = apiTrimmedString(requestId) || `${batchId}-row-${index + 1}`
  const normalized = source.replace(/[^a-zA-Z0-9]/g, '')
  if (!normalized) return `ZRD-${String(index + 1).padStart(4, '0')}`
  return `ZRD-${normalized.slice(-8).toUpperCase()}`
}

function syntheticRequestId(batchId: string, index: number, item: IntentJournalPaymentIntentItem): string {
  if (apiTrimmedString(item.intent_id)) return apiTrimmedString(item.intent_id)!
  const sourceRowNum = parseSourceRowNum(item.source_row_num)
  if (sourceRowNum != null) return `${batchId}-src-${sourceRowNum}`
  return `${batchId}-row-${index + 1}`
}

function collectReasonCodes(item: IntentJournalPaymentIntentItem): string[] {
  const codes = new Set<string>()
  const push = (raw: unknown) => {
    if (typeof raw === 'string' && raw.trim()) {
      codes.add(raw.trim())
      return
    }
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === 'string' && entry.trim()) codes.add(entry.trim())
        else if (entry && typeof entry === 'object' && 'code' in entry) {
          const code = (entry as { code?: unknown }).code
          if (typeof code === 'string' && code.trim()) codes.add(code.trim())
        }
      }
    }
  }
  push(item.governance_reason_codes)
  push(item.reason_codes)
  push(item.score_reason_codes)
  const dup = apiTrimmedString(item.duplicate_reason_code)
  if (dup) codes.add(dup)
  return [...codes]
}

function buildReviewInfoSummary(item: IntentJournalPaymentIntentItem, fallback: string): string {
  const reasons = collectReasonCodes(item)
  const remediability = apiTrimmedString(item.remediability)
  const parts = [
    apiTrimmedString(item.governance_state),
    apiTrimmedString(item.governance_decision),
    ...reasons,
  ].filter(Boolean)
  if (remediability) parts.push(`remediability:${remediability}`)
  if (item.duplicate_risk_flag) parts.push('duplicate-risk')
  if (parts.length === 0) return fallback
  return parts.join(' · ')
}

/** Map thin payment-intents list item ΓåÆ journal table row. */
export function mapPaymentIntentListItemToRow(
  item: IntentJournalPaymentIntentItem,
  batchId: string,
  index: number,
  sessionTenantId: string,
): JournalIntentRow {
  const amount = parseAmount(item.amount)
  const sourceRowNum = parseSourceRowNum(item.source_row_num)
  const qualityScore = readIntentQualityScore(item)
  const decision = mapJournalIntentDecision(item)
  const provider = resolveProviderHint(item)
  const rail = resolveRailHint(item)
  const requestId = syntheticRequestId(batchId, index, item)
  const zordId = buildZordId(requestId, batchId, index)
  const paymentRef = apiTrimmedString(item.client_payout_ref)
  const clientBatchRef = apiTrimmedString(item.client_batch_ref) || apiTrimmedString(item.batch_id) || batchId
  const referenceFallback = sourceRowNum != null ? `SRC-${sourceRowNum}` : requestId

  let infoSummary = decision.infoSummary
  if (decision.status === 'Needs Review') {
    infoSummary = buildReviewInfoSummary(item, 'Needs Review')
  } else if (decision.status === 'Ready to Process') {
    infoSummary = 'Ready for dispatch'
  } else if (decision.status === 'Decision unavailable') {
    infoSummary = 'Decision unavailable'
  }

  let match = decision.match
  if (decision.status === 'Ready to Process' && typeof qualityScore === 'number') {
    if (qualityScore >= 0.8 || (qualityScore > 1 && qualityScore >= 80)) match = 'Likely Matched'
  }

  return {
    batchId,
    zordId,
    requestId,
    reference: paymentRef || referenceFallback,
    amount,
    method: methodFromRail(rail),
    status: decision.status,
    match,
    lastUpdated: formatJournalExecutionAt(item.intended_execution_at),
    paymentPartner: provider,
    bank: provider,
    paymentMethodDetail: rail !== '—' ? rail : provider,
    engineStatus: decision.engineStatus,
    currency: apiTrimmedString(item.currency ?? 'INR') || 'INR',
    tenantId: apiTrimmedString(item.tenant_id) || apiTrimmedString(sessionTenantId) || '—',
    intendedExecutionAt: formatJournalExecutionAt(item.intended_execution_at),
    provider,
    confidenceScore: qualityScore,
    confidenceLabel: formatConfidenceLabel(qualityScore ?? undefined),
    infoSummary,
    rail,
    sourceRowNum,
    clientBatchRef,
    beneficiaryName: beneficiaryNameHint(item),
  }
}

/** Customer-facing status label for intent journal rows. */
export function intentRowCustomerStatus(status: JournalIntentStatus): string {
  if (status === 'Pending') return 'Awaiting Bank Confirmation'
  if (status === 'Ready to Process') return 'Ready for Dispatch'
  if (status === 'Decision unavailable') return 'Decision unavailable'
  return status
}


