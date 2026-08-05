import type { IntentJournalPaymentIntentItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalIntentRow, JournalIntentStatus } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { readIntentQualityScore } from '@/services/payout-command/prod-api/resolveIntentQualityScore'

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

/** Map thin payment-intents list item → journal table row. */
export function mapPaymentIntentListItemToRow(
  item: IntentJournalPaymentIntentItem,
  batchId: string,
  index: number,
  sessionTenantId: string,
): JournalIntentRow {
  const amount = parseAmount(item.amount)
  const sourceRowNum = parseSourceRowNum(item.source_row_num)
  const qualityScore = readIntentQualityScore(item)
  const status: JournalIntentStatus = 'Ready to Process'
  const provider = resolveProviderHint(item)
  const rail = resolveRailHint(item)
  const requestId = syntheticRequestId(batchId, index, item)
  const zordId = buildZordId(requestId, batchId, index)
  const paymentRef = apiTrimmedString(item.client_payout_ref)
  const clientBatchRef = apiTrimmedString(item.client_batch_ref) || apiTrimmedString(item.batch_id) || batchId
  const referenceFallback = sourceRowNum != null ? `SRC-${sourceRowNum}` : requestId

  return {
    batchId,
    zordId,
    requestId,
    reference: paymentRef || referenceFallback,
    amount,
    method: methodFromRail(rail),
    status,
    match: 'Awaiting',
    lastUpdated: formatJournalExecutionAt(item.intended_execution_at),
    paymentPartner: provider,
    bank: provider,
    paymentMethodDetail: rail !== '—' ? rail : provider,
    engineStatus: undefined,
    currency: apiTrimmedString(item.currency ?? 'INR') || 'INR',
    tenantId: apiTrimmedString(item.tenant_id) || apiTrimmedString(sessionTenantId) || '—',
    intendedExecutionAt: formatJournalExecutionAt(item.intended_execution_at),
    provider,
    confidenceScore: qualityScore,
    confidenceLabel: formatConfidenceLabel(qualityScore ?? undefined),
    infoSummary: 'Ready for dispatch',
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
  return status
}
