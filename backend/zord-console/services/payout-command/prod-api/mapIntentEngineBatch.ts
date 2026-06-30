import type { IntentEngineBatchSidebarItem, PaymentIntentRecord } from './getProdIntentEngineBatches'
import type { ApiDlqRow } from './prodApiTypes'
import type { IntelligenceBatchRow } from './intelligenceTypes'
import { apiTrimmedString } from './coerceApiField'
import { readIntentQualityScore } from '@/services/payout-command/prod-api/resolveIntentQualityScore'
import { formatDlqStatusLabel, parseDlqIntentContext, normalizePspDisplayName } from './mapDlqContext'

export type JournalBatchType = 'Disbursement' | 'Settlement'
export type JournalIntentStatus = 'Ready to Process' | 'Confirmed' | 'Pending' | 'Needs Review' | 'In Progress'
export type JournalIntentMatch = 'Matched' | 'Likely Matched' | 'Awaiting' | 'Mismatch' | 'Not Found'

export type JournalBatchRecord = {
  batchId: string
  type: JournalBatchType
  /** Raw `type` from intent-engine sidebar (e.g. PAYOUT, COLLECTION). */
  apiType: string
  source: string
  totalValue: number
  transactions: number
  confirmedCount: number
  /** Legacy field name — when from engine sidebar, stores rounded count fallback only. */
  highConfidenceCount: number
  /** Batch-level aggregate confidence 0–1 from intent-engine `aggregate_confidence_score`. */
  aggregateConfidenceScore?: number
  mismatchCount: number
  unresolvedCount: number
  intelligenceCounts?: Pick<IntelligenceBatchRow, 'success_count' | 'failed_count' | 'pending_count' | 'finality_status'>
  engineSidebar?: boolean
}

export type JournalIntentRow = {
  batchId: string
  /** Intent-scoped display id for Zord ID column. */
  zordId: string
  /** Intent id (or synthetic id) for drawer selection. */
  requestId: string
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH' | '—'
  rail?: string
  status: JournalIntentStatus
  match: JournalIntentMatch
  lastUpdated: string
  paymentPartner: string
  bank: string
  paymentMethodDetail: string
  engineStatus?: string
  currency?: string
  tenantId: string
  intendedExecutionAt: string
  clientBatchRef?: string
  sourceRowNum?: number | null
  beneficiaryName?: string | null
  provider: string
  confidenceScore: number | null
  confidenceLabel: string
  infoSummary: string
  /** Full engine row for expandable details (not fabricated). */
  rawIntent?: PaymentIntentRecord
}

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

function resolveProvider(intent: PaymentIntentRecord): string {
  const instrument = apiTrimmedString(intent.beneficiary?.instrument?.kind)
  const beneficiaryType = apiTrimmedString(intent.beneficiary_type)
  return instrument || beneficiaryType || '—'
}

function buildIntentInfoSummary(intent: PaymentIntentRecord): string {
  const parts = [
    apiTrimmedString(intent.status),
    apiTrimmedString(intent.governance_state),
    apiTrimmedString(intent.business_state),
    apiTrimmedString(intent.client_payout_ref),
  ].filter(Boolean)
  if (intent.duplicate_risk_flag) parts.push('duplicate-risk')
  if (intent.governance?.semantic_valid === false) parts.push('semantic-invalid')
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function buildZordId(requestId: string, batchId: string): string {
  const source = apiTrimmedString(requestId) || batchId
  const normalized = source.replace(/[^a-zA-Z0-9]/g, '')
  if (!normalized) return 'ZRD-UNKNOWN'
  return `ZRD-${normalized.slice(-8).toUpperCase()}`
}

function resolveDlqPaymentMethod(ctx: ReturnType<typeof parseDlqIntentContext>): JournalFailureRow['method'] {
  const raw = (ctx.paymentMethod ?? '').toUpperCase()
  if (!raw) return '—'
  if (raw.includes('NACH')) return 'NACH'
  if (raw.includes('IMPS') || raw.includes('UPI') || raw.includes('LSM')) return 'LSM'
  if (raw.includes('RTGS') || raw.includes('NEFT') || raw.includes('BANK')) return 'Bank Transfer'
  return 'Bank Transfer'
}

function formatDlqUpdatedAt(iso?: string): string {
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

export type JournalFailureRow = {
  batchId: string
  /** DLQ-scoped display id for Zord ID column (same ZRD- format as intents). */
  zordId?: string
  requestId: string
  sourceRowNum?: number | null
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH' | '—'
  currency?: string
  paymentPartner: string
  connectorSubtitle: string
  failureReason: string
  failureStage: 'Validation' | 'Dispatch' | 'Processing' | 'Settlement'
  lastUpdated: string
  action: 'Retry' | 'Fix Details' | 'Investigate' | 'Escalate' | 'Fix Mandate'
  dlqStatus?: string
  dlqStatusLabel?: string
  beneficiaryName?: string | null
  idempotencyKey?: string | null
  inManualReviewQueue?: boolean
}

function inferBatchSource(batchId: string, finality?: string): string {
  const id = batchId.toLowerCase()
  if (id.includes('bulk') || id.includes('upload') || id.includes('file')) return 'Bulk ingest'
  if (finality === 'REQUIRES_REVIEW') return 'Intelligence · review'
  return 'Intelligence'
}

/** Engine in-flight only — used for Billing “processing in Zord” count (GET, no POST). */
export function isZordProcessingPaymentIntent(intent: PaymentIntentRecord): boolean {
  const st = String(intent.status ?? '').toUpperCase()
  const biz = String(intent.business_state ?? '').toUpperCase()
  const gov = String(intent.governance_state ?? '').toUpperCase()
  if (st.includes('FAIL') || st.includes('REJECT') || st.includes('ERROR') || gov === 'FLAGGED') return false
  if (st.includes('CONFIRM') || st.includes('SUCCESS') || st === 'COMPLETED' || st === 'SETTLED') return false
  if (st.includes('PROCESS') || st.includes('DISPAT') || st === 'IN_FLIGHT' || biz === 'PROCESSING') return true
  return false
}

export function mapSidebarItemToBatchRecord(it: IntentEngineBatchSidebarItem): JournalBatchRecord {
  const typeUpper = (it.type ?? '').toUpperCase()
  const batchType: JournalBatchType = typeUpper.includes('SETTLEMENT') ? 'Settlement' : 'Disbursement'
  const tv = Number.parseFloat(String(it.totalValue ?? '').replace(/,/g, ''))
  const totalValue = Number.isFinite(tv) ? tv : 0
  const hcRaw = it.highConfidenceCount
  const aggregateConfidenceScore =
    typeof hcRaw === 'number' && Number.isFinite(hcRaw) && hcRaw <= 1 ? hcRaw : undefined
  const highConfidenceCount =
    aggregateConfidenceScore != null
      ? Math.round(aggregateConfidenceScore * 100)
      : typeof hcRaw === 'number' && Number.isFinite(hcRaw)
        ? Math.round(hcRaw)
        : 0

  return {
    batchId: String(it.batchId ?? '').trim() || '—',
    type: batchType,
    apiType: typeUpper || '—',
    source: 'Intent engine',
    totalValue,
    transactions: it.transactions ?? 0,
    confirmedCount: it.confirmedCount ?? 0,
    highConfidenceCount,
    aggregateConfidenceScore,
    mismatchCount: it.mismatchCount ?? 0,
    unresolvedCount: it.unresolvedCount ?? 0,
    engineSidebar: true,
  }
}

export function mapIntelligenceRowToBatchRecord(b: IntelligenceBatchRow): JournalBatchRecord {
  return {
    batchId: b.batch_id,
    type: 'Disbursement',
    apiType: '—',
    source: inferBatchSource(b.batch_id, b.finality_status),
    totalValue: 0,
    transactions: b.total_count ?? 0,
    confirmedCount: b.success_count ?? 0,
    highConfidenceCount: 0,
    mismatchCount: 0,
    unresolvedCount: 0,
    intelligenceCounts: {
      success_count: b.success_count ?? 0,
      failed_count: b.failed_count ?? 0,
      pending_count: b.pending_count ?? 0,
      finality_status: b.finality_status,
    },
  }
}

export function mapPaymentIntentToIntentRow(
  intent: PaymentIntentRecord,
  batchId: string,
  sessionTenantId?: string,
): JournalIntentRow {
  const raw = intent.amount
  const amount = typeof raw === 'string' ? parseFloat(raw) : Number(raw ?? 0)
  const safe = Number.isFinite(amount) ? amount : 0
  const stRaw = String(intent.status ?? '').trim()
  const gov = String(intent.governance_state ?? '').toUpperCase()
  const biz = String(intent.business_state ?? '').toUpperCase()
  const st = stRaw.toUpperCase()

  let status: JournalIntentStatus = 'Ready to Process'
  if (st.includes('FAIL') || st.includes('REJECT') || st.includes('ERROR') || gov === 'FLAGGED') {
    status = 'Needs Review'
  } else if (st.includes('CONFIRM') || st.includes('SUCCESS') || st === 'COMPLETED' || st === 'SETTLED') {
    status = 'Confirmed'
  } else if (st.includes('PROCESS') || st.includes('DISPAT') || st === 'IN_FLIGHT' || biz === 'PROCESSING') {
    status = 'In Progress'
  } else if (st.includes('PEND') || st.includes('CREAT')) {
    status = 'Pending'
  }

  const conf = intent.aggregate_confidence_score
  let match: JournalIntentMatch = 'Awaiting'
  if (status === 'Confirmed') match = 'Matched'
  else if (status === 'Needs Review') match = 'Not Found'
  else if (typeof conf === 'number' && conf >= 0.8) match = 'Likely Matched'
  else if (typeof conf === 'number' && conf < 0.5) match = 'Mismatch'

  const created = intent.created_at ? new Date(intent.created_at) : new Date()
  const instrument =
    String(intent.beneficiary_type ?? '').trim() ||
    String(intent.beneficiary?.instrument?.kind ?? '').trim()
  let method: JournalIntentRow['method'] = 'Bank Transfer'
  const iu = instrument.toUpperCase()
  if (iu.includes('NACH')) method = 'NACH'
  else if (iu.includes('IMPS') || iu.includes('UPI') || iu.includes('LSM') || iu.includes('INSTA') || iu.includes('NEFT')) {
    method = 'LSM'
  }

  const paymentMethodDetail = [instrument || null, intent.constraints?.execution_window || null]
    .filter(Boolean)
    .join(' · ') || '—'

  const confidenceScore = readIntentQualityScore(intent)

  return {
    batchId,
    zordId: buildZordId(intent.intent_id, batchId),
    requestId: intent.intent_id,
    reference:
      apiTrimmedString(intent.client_payout_ref) ||
      (intent.source_row_num != null ? `SRC-${intent.source_row_num}` : apiTrimmedString(intent.envelope_id)) ||
      intent.intent_id,
    amount: safe,
    method,
    rail: instrument || '—',
    status,
    match,
    lastUpdated: created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    paymentPartner: instrument || '—',
    bank: instrument || '—',
    paymentMethodDetail,
    engineStatus: [stRaw, gov, biz].filter(Boolean).join(' · ') || undefined,
    currency: apiTrimmedString(intent.currency ?? 'INR') || 'INR',
    tenantId: apiTrimmedString(intent.tenant_id) || apiTrimmedString(sessionTenantId) || '—',
    intendedExecutionAt: formatJournalExecutionAt(intent.intended_execution_at),
    clientBatchRef: apiTrimmedString(intent.client_batch_ref) || apiTrimmedString(intent.batchid) || batchId,
    sourceRowNum: intent.source_row_num ?? null,
    beneficiaryName: apiTrimmedString((intent.beneficiary as { name_token?: unknown } | undefined)?.name_token),
    provider: resolveProvider(intent),
    confidenceScore,
    confidenceLabel: formatConfidenceLabel(confidenceScore ?? undefined),
    infoSummary: buildIntentInfoSummary(intent),
    rawIntent: intent,
  }
}

export function mapDlqToFailureRow(row: ApiDlqRow, opts?: { inManualReviewQueue?: boolean }): JournalFailureRow {
  const batchFromIngest = apiTrimmedString(row.client_batch_ref) || apiTrimmedString(row.batch_id)
  const batchId = batchFromIngest || '—'
  const stageRaw = (row.stage ?? '').toLowerCase()
  let failureStage: JournalFailureRow['failureStage'] = 'Processing'
  if (stageRaw.includes('valid')) failureStage = 'Validation'
  else if (stageRaw.includes('dispatch')) failureStage = 'Dispatch'
  else if (stageRaw.includes('settle')) failureStage = 'Settlement'
  const ctx = parseDlqIntentContext(row.intent_context)
  const connector = normalizePspDisplayName(ctx.sourceSystem)
  const connectorSubtitle = connector
  const manualReview =
    opts?.inManualReviewQueue ??
    apiTrimmedString(row.dlq_status) === 'NEEDS_MANUAL_REVIEW'
  return {
    batchId,
    zordId: buildZordId(row.dlq_id, batchId),
    requestId: row.dlq_id,
    sourceRowNum: typeof row.source_row_num === 'number' ? row.source_row_num : null,
    reference: row.dlq_id,
    amount: ctx.amount,
    method: resolveDlqPaymentMethod(ctx),
    currency: ctx.currency ?? 'INR',
    paymentPartner: connector,
    connectorSubtitle,
    failureReason: apiTrimmedString(row.error_detail) || apiTrimmedString(row.reason_code) || '—',
    failureStage,
    lastUpdated: formatDlqUpdatedAt(row.created_at),
    action: row.replayable ? 'Retry' : 'Investigate',
    dlqStatus: row.dlq_status,
    dlqStatusLabel: formatDlqStatusLabel(row.dlq_status),
    beneficiaryName: ctx.beneficiaryName,
    idempotencyKey: ctx.idempotencyKey,
    inManualReviewQueue: manualReview,
  }
}
