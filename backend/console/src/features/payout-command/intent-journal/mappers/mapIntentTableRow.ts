import type { IntentJournalPaymentIntentItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalIntentRow, JournalIntentStatus } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { readIntentQualityScore } from '@/services/payout-command/prod-api/resolveIntentQualityScore'
import { withSpec76Fields } from './enrichIntentSpec76'

export const READINESS_REVIEW_THRESHOLD = 0.7

function formatJournalExecutionAt(iso: string | undefined): string {
  const s = apiTrimmedString(iso)
  if (!s) return '-'
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
  if (score == null || !Number.isFinite(score)) return '-'
  const pct = score <= 1 ? score * 100 : score
  return `${pct.toFixed(0)}%`
}

function resolveProviderHint(item: IntentJournalPaymentIntentItem): string {
  const h =
    apiTrimmedString(item.provider_hint) ||
    apiTrimmedString(item.beneficiary_type) ||
    apiTrimmedString(item.rail_hint)
  if (!h) return '-'
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
  return rail || '-'
}

function methodFromRail(rail: string): JournalIntentRow['method'] {
  if (rail === '-') return '-'
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
  if (apiTrimmedString(item.payout_id)) return apiTrimmedString(item.payout_id)!
  if (apiTrimmedString(item.intent_id)) return apiTrimmedString(item.intent_id)!
  if (apiTrimmedString(item.client_payout_ref)?.startsWith('pout_')) {
    return apiTrimmedString(item.client_payout_ref)!
  }
  const sourceRowNum = parseSourceRowNum(item.source_row_num)
  if (sourceRowNum != null) return `${batchId}-src-${sourceRowNum}`
  return `${batchId}-row-${index + 1}`
}

function journalStatusFromUpstream(rawStatus: string | null | undefined): JournalIntentStatus {
  const st = (rawStatus || '').trim().toLowerCase()
  if (!st) return 'Ready to Process'
  if (st === 'processed' || st === 'confirmed' || st === 'success' || st === 'succeeded') return 'Confirmed'
  if (st === 'processing' || st === 'in_progress' || st === 'in progress') return 'In Progress'
  if (
    st === 'failed' ||
    st === 'reversed' ||
    st === 'cancelled' ||
    st === 'canceled' ||
    st === 'rejected' ||
    st === 'needs_review' ||
    st === 'needs review'
  ) {
    return 'Needs Review'
  }
  if (st === 'pending' || st === 'scheduled' || st === 'queued') return 'Pending'
  return 'Ready to Process'
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
  const upstreamStatus = apiTrimmedString(item.status)
  const status = journalStatusFromUpstream(upstreamStatus)
  const provider = resolveProviderHint(item)
  const paymentProvider =
    apiTrimmedString(item.payment_provider) || apiTrimmedString(item.provider_hint) || provider
  const modeHint = apiTrimmedString(item.mode)
  const rail = modeHint || resolveRailHint(item)
  const requestId = syntheticRequestId(batchId, index, item)
  const zordId = buildZordId(requestId, batchId, index)
  const payoutId = apiTrimmedString(item.payout_id) || (requestId.startsWith('pout_') ? requestId : null)
  const paymentRef = payoutId || apiTrimmedString(item.client_payout_ref)
  const clientBatchRef = apiTrimmedString(item.client_batch_ref) || apiTrimmedString(item.batch_id) || batchId
  const referenceFallback = sourceRowNum != null ? `SRC-${sourceRowNum}` : requestId
  const businessState = apiTrimmedString(item.business_state)
  const governanceState = apiTrimmedString(item.governance_state)
  const engineStatus = [upstreamStatus, governanceState, businessState].filter(Boolean).join(' · ') || undefined
  const infoSummary =
    [upstreamStatus, governanceState, businessState, paymentRef].filter(Boolean).join(' · ') || 'Ready for dispatch'

  const base: JournalIntentRow = {
    batchId,
    zordId,
    requestId,
    reference: paymentRef || referenceFallback,
    amount,
    method: methodFromRail(rail),
    status,
    match: status === 'Confirmed' ? 'Matched' : status === 'Needs Review' ? 'Not Found' : 'Awaiting',
    lastUpdated: formatJournalExecutionAt(item.intended_execution_at),
    paymentPartner: paymentProvider,
    bank: paymentProvider,
    paymentMethodDetail: rail !== '-' ? rail : paymentProvider,
    engineStatus,
    currency: apiTrimmedString(item.currency ?? 'INR') || 'INR',
    tenantId: apiTrimmedString(item.tenant_id) || apiTrimmedString(sessionTenantId) || '-',
    intendedExecutionAt: formatJournalExecutionAt(item.intended_execution_at),
    provider: paymentProvider,
    confidenceScore: qualityScore,
    confidenceLabel: formatConfidenceLabel(qualityScore ?? undefined),
    infoSummary,
    rail,
    sourceRowNum,
    clientBatchRef,
    beneficiaryName: beneficiaryNameHint(item),
    rawIntent: {
      intent_id: requestId,
      status: upstreamStatus || undefined,
      business_state: businessState || undefined,
      governance_state: governanceState || undefined,
      client_payout_ref: paymentRef || undefined,
      beneficiary_type: apiTrimmedString(item.beneficiary_type) || undefined,
      amount,
      currency: apiTrimmedString(item.currency ?? 'INR') || 'INR',
      // Razorpay payout extras (consumed by PayoutDetailDrawer)
      payout_id: payoutId || undefined,
      id: payoutId || undefined,
      fund_account_id: apiTrimmedString(item.fund_account_id) || undefined,
      utr: apiTrimmedString(item.utr) || undefined,
      mode: modeHint || undefined,
      fees: typeof item.fees === 'number' ? item.fees : undefined,
      tax: typeof item.tax === 'number' ? item.tax : undefined,
      fee_type: item.fee_type ?? undefined,
      purpose: apiTrimmedString(item.purpose) || undefined,
      created_at: typeof item.created_at === 'number' ? item.created_at : undefined,
      amount_paise: typeof item.amount_paise === 'number' ? item.amount_paise : undefined,
      notes: item.notes ?? undefined,
      status_details: item.status_details ?? undefined,
      payment_provider: paymentProvider || undefined,
      provider_hint: paymentProvider || undefined,
    } as JournalIntentRow['rawIntent'],
  }
  return withSpec76Fields(base, index)
}

/** Customer-facing status label for intent journal rows (Spec 7.6 lifecycle preferred). */
export function intentRowCustomerStatus(status: JournalIntentStatus): string {
  if (status === 'Pending') return 'Dispatched'
  if (status === 'Ready to Process') return 'Ready to seal'
  if (status === 'Needs Review') return 'Needs review'
  if (status === 'Confirmed') return 'Dispatched'
  if (status === 'In Progress') return 'Sealed'
  return status
}
