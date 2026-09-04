import { buildAmbiguityMixSegments } from './bubbleMapChart.js'
import {
  ALL_BATCHES,
  BATCHES,
  EVIDENCE_BATCH,
  PACK_BATCH,
  PACK_INTENT_A,
  PACK_INTENT_B,
  PRIMARY_BATCH,
  TENANT_ID,
  UPLOAD_DEMO_BATCH_ID,
  batchPackId,
  intentId,
  parsePositiveInt,
  tenantForEmail,
} from './constants.js'
import {
  hasAnyFullyReadyBatch,
  hasAnySettlementReadyBatch,
  isBatchFullyReady,
  isIntentReady,
  isSettlementReady,
  listFullyReadyBatchIds,
  listIntentReadyBatchIds,
  listSettlementReadyBatchIds,
  markIntentUploaded,
  markSettlementUploaded,
} from './uploadReadiness.js'
import {
  DEMO_PAYOUT_AMOUNTS_INR,
  demoPayeeLabel,
  demoPayoutRef,
  isDemoBatchId,
} from './demoBatchInr.js'

function _randId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

/** Token → email mapping so /v1/auth/refresh and /v1/auth/me can resolve the correct tenant. */
const tokenEmailMap = new Map()

/** Register a token→email mapping (called on login). */
export function registerTokenEmail(token, email) {
  if (token && email) tokenEmailMap.set(token, email.toLowerCase().trim())
}

/** Look up the email for a given Bearer token. */
export function emailForToken(token) {
  if (!token) return null
  return tokenEmailMap.get(token) || null
}

const PROVIDERS = ['razorpay', 'cashfree']

/** Resolve catalogue rows for a stage-specific id list (null = preseed / unrestricted). */
function batchesFromReadyIds(readyIds) {
  if (readyIds === null) return BATCHES
  if (readyIds.length === 0) return []
  // Keep the uploaded batch id — batchMeta must not replace it with a catalogue id.
  return readyIds.map((id) => {
    const meta = batchMeta(id)
    return { ...meta, id: String(id).trim() || meta.id }
  })
}

/** Batches with obligation upload — Intent Journal / pre-settlement lists. */
function activeIntentBatches(request) {
  return batchesFromReadyIds(listIntentReadyBatchIds(request))
}

/** Batches with settlement upload — Settlement Journal lists. */
function activeSettlementBatches(request) {
  return batchesFromReadyIds(listSettlementReadyBatchIds(request))
}

/** Batches with both uploads — match / proof / leakage / overview KPIs. */
function activeBatches(request) {
  return batchesFromReadyIds(listFullyReadyBatchIds(request))
}

function emptyPaginated() {
  return { items: [], pagination: { page: 1, page_size: 0, total: 0 } }
}

function batchMeta(batchId) {
  const id = String(batchId || '').trim()
  if (id === UPLOAD_DEMO_BATCH_ID || id.toUpperCase() === 'BATCH-001') {
    const fromList = BATCHES.find((b) => b.id === UPLOAD_DEMO_BATCH_ID)
    if (fromList) return fromList
    const evidence = ALL_BATCHES.find((b) => b.id === EVIDENCE_BATCH) ?? ALL_BATCHES[0]
    return {
      ...evidence,
      id: UPLOAD_DEMO_BATCH_ID,
      label: 'Batch 001',
      intentCount: 100,
      intentTotalRupees: 1_237_786_756,
      observationCount: 100,
    }
  }
  const known = ALL_BATCHES.find((b) => b.id === batchId) ?? BATCHES.find((b) => b.id === batchId)
  if (known) return known
  // Any other uploaded batch id → full 100-payout demo spine (hackathon sandbox).
  const evidence = ALL_BATCHES.find((b) => b.id === EVIDENCE_BATCH) ?? ALL_BATCHES[0]
  return {
    ...evidence,
    id,
    label: id,
    intentCount: 100,
    intentTotalRupees: 1_237_786_756,
    observationCount: 100,
    settlementTotalRupees: 1_237_786_756,
  }
}

/**
 * Split a rupee total across N rows with every row amount distinct.
 * Deterministic weighted split (weights shuffled so the table doesn't look ascending);
 * the last row absorbs rounding so the sum stays exact.
 */
function distributeAmounts(totalRupees, count) {
  const n = Math.max(1, count)
  const totalCents = Math.round(Number(totalRupees) * 100)
  if (n === 1) return [Number((totalCents / 100).toFixed(2))]

  // Strictly increasing weights guarantee distinct shares; shuffle for a natural-looking order.
  const weights = Array.from({ length: n }, (_, i) => 10 + i * 3)
  let seed = 7
  for (let i = n - 1; i > 0; i -= 1) {
    seed = (seed * 31 + 17) % 97
    const j = seed % (i + 1)
    ;[weights[i], weights[j]] = [weights[j], weights[i]]
  }
  const weightTotal = weights.reduce((a, b) => a + b, 0)

  const amounts = []
  let assignedCents = 0
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1) {
      amounts.push(Number(((totalCents - assignedCents) / 100).toFixed(2)))
      break
    }
    // Round to whole rupees; weight gaps are large enough to keep every amount distinct.
    const cents = Math.round((totalCents * weights[i]) / weightTotal / 100) * 100
    amounts.push(Number((cents / 100).toFixed(2)))
    assignedCents += cents
  }
  return amounts
}

function payoutRef(batchId, rowIndex) {
  const tail = batchId.replace(/^batch-/, '').replace(/-/g, '').slice(-8).toUpperCase()
  return `PAY-${tail}-${String(rowIndex + 1).padStart(3, '0')}`
}

function observationStatusForRow(meta, rowIndex) {
  const settledEnd = meta.settledRows ?? 16
  const pendingEnd = settledEnd + (meta.pendingRows ?? 0)
  if (rowIndex < settledEnd) return 'SETTLED'
  if (rowIndex < pendingEnd) return 'PENDING'
  return 'FAILED'
}

export function authEnvelope(opts = {}) {
  // Reuse existing token if provided (refresh/me should not rotate)
  const existingToken = opts.existingAccessToken || null
  const now = Date.now()
  const accessExpires = new Date(now + 60 * 60 * 1000).toISOString()
  const idleExpires = new Date(now + 15 * 60 * 1000).toISOString()
  const absoluteExpires = new Date(now + 8 * 60 * 60 * 1000).toISOString()
  const email =
    typeof opts.email === 'string' && opts.email.trim()
      ? opts.email.trim().toLowerCase()
      : (existingToken ? emailForToken(existingToken) : null) || 'ops.reviewer@zordnet.com'
  const name =
    typeof opts.name === 'string' && opts.name.trim() ? opts.name.trim() : 'Ops Reviewer'
  const role =
    typeof opts.role === 'string' && opts.role.trim() ? opts.role.trim() : 'CUSTOMER_USER'
  const companyName =
    typeof opts.companyName === 'string' && opts.companyName.trim()
      ? opts.companyName.trim()
      : 'Zordnet Operations'
  // Resolve per-user tenant — each email maps to a unique tenant_id.
  const userTenant = tenantForEmail(email)
  const tenantId = opts.tenantId || userTenant.tenant_id
  const tenantName = opts.tenantName || userTenant.tenant_name || companyName
  const workspaceCode = userTenant.workspace_code || 'ZORDNET'
  return {
    user: {
      id: 'usr_ops_reviewer_001',
      email,
      role,
      name,
      tenant_id: tenantId,
      tenant_name: tenantName,
      workspace_code: workspaceCode,
      status: 'ACTIVE',
      mfa_enabled: false,
    },
    session: {
      session_id: `sess_${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,
      tenant_id: tenantId,
      workspace_code: workspaceCode,
      role,
      access_expires_at: accessExpires,
      idle_expires_at: idleExpires,
      absolute_expires_at: absoluteExpires,
    },
    requires_mfa: false,
    access_token: existingToken || _randId('tok_'),
    refresh_token: `ref_${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,
    access_expires_at: accessExpires,
    idle_expires_at: idleExpires,
    absolute_expires_at: absoluteExpires,
  }
}

/** Matches zord-edge GET /v1/session/status — keeps console session manager alive in smoke mode. */
export function sessionStatus() {
  const envelope = authEnvelope()
  return {
    session_id: envelope.session.session_id,
    idle_expires_at: envelope.session.idle_expires_at,
    absolute_expires_at: envelope.session.absolute_expires_at,
  }
}

export function buildPaymentIntents(batchId, request) {
  if (!isIntentReady(batchId, request)) return emptyPaginated()
  const meta = batchMeta(batchId)
  const count = meta.intentCount ?? 20
  const total = meta.intentTotalRupees ?? meta.totalIntendedMinor ?? 1237786756
  const useCanonical = isDemoBatchId(batchId)
  const amounts = useCanonical
    ? DEMO_PAYOUT_AMOUNTS_INR.slice(0, count)
    : distributeAmounts(total, count)
  const day = meta.date ?? '2026-06-12'
  const statusCycle = [
    ...Array.from({ length: 70 }, () => 'processed'),
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'reversed',
    'reversed',
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'failed',
    'processing',
    'processing',
    'processing',
    'processing',
    'processing',
    'pending',
    'pending',
    'pending',
    'pending',
    'queued',
    'queued',
    'queued',
  ]
  const items = []
  const modes = ['IMPS', 'NEFT', 'RTGS', 'UPI']
  const statusDetailByStatus = {
    failed: {
      reason: 'beneficiary_bank_failure',
      source: 'beneficiary_bank',
      description: 'Payout failed at the beneficiary bank due to a technical issue. Please retry after 30 min.',
    },
    reversed: {
      reason: 'beneficiary_bank_rejected',
      source: 'beneficiary_bank',
      description: 'Payout rejected by the beneficiary bank. Please contact the beneficiary bank.',
    },
    processing: {
      reason: 'payout_bank_processing',
      source: 'gateway',
      description: 'Payout is being processed by the partner bank.',
    },
    pending: {
      reason: 'pending_approval',
      source: 'business',
      description: 'Workflow for the payout is pending approval from the approver(s).',
    },
    queued: {
      reason: 'low_balance',
      source: 'business',
      description: 'Payout is queued as there is insufficient balance in your account to process the payout.',
    },
  }
  for (let i = 0; i < count; i += 1) {
    const payee = useCanonical ? demoPayeeLabel(i) : undefined
    const status = useCanonical ? statusCycle[i % statusCycle.length] : i % 7 === 0 ? 'failed' : 'processed'
    const payoutId = `pout_${String(i + 1).padStart(14, '0')}`
    const fundAccountId = `fa_${String(i + 1).padStart(14, '0')}`
    const amountMajor = Number(amounts[i]) || 0
    const amountPaise = Math.round(amountMajor * 100)
    const mode = modes[i % modes.length]
    const utr =
      status === 'processed' || status === 'reversed' || status === 'processing'
        ? `UTR${String(88000000 + i)}`
        : null
    const detail = statusDetailByStatus[status]
    items.push({
      tenant_id: TENANT_ID,
      intent_id: intentId(batchId, i),
      batch_id: batchId,
      batchid: batchId,
      client_batch_ref: batchId,
      client_payout_ref: useCanonical ? payoutId : payoutRef(batchId, i),
      payout_id: payoutId,
      entity: 'payout',
      fund_account_id: fundAccountId,
      amount: amountMajor,
      amount_paise: amountPaise,
      currency: 'INR',
      status,
      utr,
      mode,
      fees: status === 'processed' ? Math.round(amountPaise * 0.002) : 0,
      tax: status === 'processed' ? Math.round(amountPaise * 0.00036) : 0,
      fee_type: null,
      purpose: 'payout',
      created_at: Math.floor(Date.parse(`${day}T09:00:00Z`) / 1000) + i * 47,
      notes: {
        notes_key_1: payee || 'Payout',
        notes_key_2: `Tea, Earl Grey, Hot · row ${i + 1}`,
        batch: batchId,
      },
      status_details: detail
        ? { reason: detail.reason, source: detail.source, description: detail.description }
        : null,
      provider_hint: meta.partner,
      payment_provider: useCanonical
        ? ['razorpay', 'paytm', 'phonepe', 'cashfree', 'payu'][i % 5]
        : meta.partner || 'razorpay',
      beneficiary_type: i % 4 === 0 ? 'UPI' : 'BANK_TRANSFER',
      beneficiary_name: payee,
      intent_quality_score: status === 'failed' || status === 'reversed' ? 0.42 + (i % 5) * 0.03 : 0.78 + (i % 5) * 0.04,
      aggregate_confidence_score: meta.matchConfidence ?? 0.81,
      confidence_score: status === 'processed' ? 0.91 : 0.55,
      source_row_num: i + 1,
      intended_execution_at: `${day}T09:00:00Z`,
      business_state: status === 'processing' || status === 'pending' || status === 'queued' ? 'PROCESSING' : undefined,
      governance_state: status === 'failed' || status === 'reversed' ? 'FLAGGED' : undefined,
      beneficiary: {
        name: payee,
        instrument: { kind: i % 4 === 0 ? 'UPI' : mode },
      },
    })
  }
  return { items, pagination: { page: 1, page_size: items.length, total: items.length } }
}

/** Mirrors intent-engine GET /api/prod/intents/batch-ids (`total_amount` = SUM(amount) per batch). */
export function buildBatchIdsList(request) {
  return {
    items: activeIntentBatches(request)
      .map((b) => {
        const { items } = buildPaymentIntents(b.id, request)
        const total_amount =
          Math.round(items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100) / 100
        return {
          batch_id: b.id,
          total_amount,
          total_count: items.length,
          intent_count: items.length,
        }
      })
      .filter((row) => row.total_count > 0),
  }
}

export function buildDlqItems(batchId, request) {
  if (!isIntentReady(batchId, request)) return emptyPaginated()
  const meta = batchMeta(batchId)
  const count = meta.dlqCount ?? 0
  if (count <= 0) {
    return emptyPaginated()
  }
  const day = meta.date ?? '2026-06-12'
  const reasons = [
    { stage: 'VALIDATION', reason_code: 'MISSING_BENEFICIARY', error_detail: 'Beneficiary account missing' },
    { stage: 'MAPPING', reason_code: 'AMBIGUOUS_AMOUNT', error_detail: 'Amount field ambiguous' },
    { stage: 'VALIDATION', reason_code: 'INVALID_UPI', error_detail: 'UPI handle failed validation' },
  ]
  const items = Array.from({ length: count }, (_, i) => ({
    dlq_id: `dlq-${batchId.slice(-10)}-${String(i + 1).padStart(2, '0')}`,
    tenant_id: TENANT_ID,
    batch_id: batchId,
    client_batch_ref: batchId,
    stage: reasons[i % reasons.length].stage,
    reason_code: reasons[i % reasons.length].reason_code,
    error_detail: reasons[i % reasons.length].error_detail,
    dlq_status: i === 0 ? 'NEEDS_MANUAL_REVIEW' : 'OPEN',
    replayable: true,
    source_row_num: 10 + i,
    created_at: `${day}T10:${String(15 + i).padStart(2, '0')}:00Z`,
  }))
  return { items, pagination: { page: 1, page_size: items.length, total: items.length } }
}

export function buildSettlementObservations(batchId, page, pageSize, request) {
  if (!isSettlementReady(batchId, request)) {
    return { items: [], pagination: { page, page_size: pageSize, total: 0 } }
  }
  const meta = batchMeta(batchId)
  const count = meta.observationCount ?? 20
  const total = meta.settlementTotalRupees ?? 44_000
  const useCanonical = isDemoBatchId(batchId)
  const amounts = useCanonical
    ? Array.from({ length: count }, (_, i) => {
        const base = DEMO_PAYOUT_AMOUNTS_INR[i] ?? 0
        // PAY-0019 short-settlement story (3% under)
        return i === 18 ? Math.round(base * 0.97) : base
      })
    : distributeAmounts(total, count)
  const day = meta.date ?? '2026-06-12'
  const all = []
  for (let i = 0; i < count; i += 1) {
    const provider = meta.partner
    const status = observationStatusForRow(meta, i)
    const mappingConfidence =
      status === 'SETTLED'
        ? meta.matchConfidence ?? 0.85
        : status === 'PENDING'
          ? 0.35 + (i % 4) * 0.05
          : 0.18
    const intentIdx = i % count
    const linkedRef = useCanonical ? demoPayoutRef(intentIdx) : payoutRef(batchId, intentIdx)
    all.push({
      settlement_observation_id: `obs-${batchId}-${String(i + 1).padStart(3, '0')}`,
      tenant_id: TENANT_ID,
      client_batch_id: batchId,
      source_row_ref: String(i + 1),
      source_system: provider,
      provider_reference: provider,
      connector_id: provider,
      amount: amounts[i],
      settled_amount: status === 'SETTLED' ? amounts[i] : null,
      currency_code: 'INR',
      settlement_status: status,
      client_reference_candidate:
        status === 'SETTLED' ? linkedRef : status === 'PENDING' ? `ORPHAN-${String(i + 1).padStart(3, '0')}` : linkedRef,
      bank_reference: status === 'SETTLED' ? `UTR${day.replace(/-/g, '').slice(-6)}${String(i + 1).padStart(4, '0')}` : null,
      observation_timestamp: `${day}T08:00:00Z`,
      value_date: day,
      parse_confidence: 0.88 + (i % 3) * 0.03,
      mapping_confidence: mappingConfidence,
      attachment_readiness_score: status === 'SETTLED' ? 0.9 : 0.55,
      matched_intent_id: status === 'SETTLED' ? intentId(batchId, intentIdx) : null,
      created_at: `${day}T08:00:00Z`,
      updated_at: `${day}T08:05:00Z`,
    })
  }
  const start = (page - 1) * pageSize
  const items = all.slice(start, start + pageSize)
  return {
    items,
    pagination: { page, page_size: pageSize, total: all.length },
  }
}

export function buildSettlementBatchList(page = 1, pageSize = 20, request) {
  const all = activeSettlementBatches(request).map((b) => ({ client_batch_id: b.id }))
  const safePage = Math.max(1, page)
  const safeSize = Math.max(1, Math.min(100, pageSize))
  const start = (safePage - 1) * safeSize
  return {
    items: all.slice(start, start + safeSize),
    pagination: { page: safePage, page_size: safeSize, total: all.length },
  }
}

export function buildSettlementErrors(batchId, request) {
  if (batchId && !isSettlementReady(batchId, request)) return { items: [] }
  if (!batchId && !hasAnySettlementReadyBatch(request)) return { items: [] }
  const bid = batchId || activeSettlementBatches(request)[0]?.id || PRIMARY_BATCH
  return {
    items: [
      {
        source_row_ref: '3',
        error_stage: 'PARSING',
        reason_code: 'EMPTY_RAW_ROW',
        severity: 'LOW',
        client_batch_id: bid,
      },
      {
        source_row_ref: '7',
        error_stage: 'MAPPING',
        reason_code: 'AMOUNT_FORMAT',
        severity: 'MEDIUM',
        client_batch_id: bid,
      },
    ],
    pagination: { page: 1, page_size: 20, total: 2 },
  }
}

function leakageFromBatchMeta(meta) {
  const intended = meta.intentTotalRupees ?? meta.totalIntendedMinor ?? 0
  const settled = meta.settlementTotalRupees ?? 0
  const gap = intended - settled
  const unmatched = gap > 0 ? Math.round(gap * 0.72) : Math.round(intended * 0.015)
  const under = gap > 0 ? Math.round(gap * 0.18) : 0
  const orphan = gap < 0 ? Math.round(Math.abs(gap) * 0.55) : Math.round(intended * 0.006)
  const reversal = Math.round((unmatched + under + orphan) * 0.04)
  return { intended, settled, unmatched, under, orphan, reversal }
}

/** Map smoke catalogue finality to intelligence batch list enums. */
function mapBatchFinalityStatus(finality) {
  if (finality === 'OPEN') return 'REQUIRES_REVIEW'
  if (finality === 'FULLY_SETTLED') return 'SETTLED'
  return finality ?? 'PENDING'
}

function batchUnresolvedMinor(meta) {
  const intended = meta.intentTotalRupees ?? meta.totalIntendedMinor ?? 0
  const settled = meta.settlementTotalRupees ?? 0
  return Math.max(0, intended - settled)
}

function batchMatchConfidencePct(meta) {
  const ratio = meta.matchConfidence ?? 0
  return Math.round(ratio * 1000) / 10
}

export function buildIntelligenceBatches(opts = {}, request) {
  const catalogue = activeBatches(request)
  const limit = opts.limit ? parsePositiveInt(opts.limit, catalogue.length) : catalogue.length
  const status = opts.status?.trim().toUpperCase()

  let batchRows = catalogue.map((b) => {
      const leak = leakageFromBatchMeta(b)
      const leakagePct =
        b.intentTotalRupees > 0 ? Number((leak.unmatched / b.intentTotalRupees).toFixed(4)) : 0
      const finality = mapBatchFinalityStatus(b.finality)
      const settledRows = b.settledRows ?? 12
      const pendingRows = b.pendingRows ?? 0
      const failedRows = b.failedRows ?? 0
      const unresolved = batchUnresolvedMinor(b)
      return {
        batch_id: b.id,
        tenant_id: TENANT_ID,
        finality_status: finality,
        batch_finality_status: finality,
        total_count: b.intentCount,
        success_count: settledRows,
        failed_count: failedRows,
        pending_count: pendingRows,
        source_reference: b.partner,
        status_label: b.label,
        match_confidence: batchMatchConfidencePct(b),
        unresolved_intended_amount_minor: unresolved,
        ambiguous_amount_minor: Math.round(unresolved * 0.18),
        total_intended_amount_minor: b.intentTotalRupees,
        total_variance_minor: b.settlementTotalRupees - b.intentTotalRupees,
        reversal_exposure_minor: leak.reversal,
        predicted_leakage_rate: leakagePct,
        leakage_percentage: leakagePct,
        unmatched_amount_minor: leak.unmatched,
        under_settlement_amount_minor: leak.under,
        orphan_amount_minor: leak.orphan,
      }
    })

  if (status) {
    batchRows = batchRows.filter(
      (row) => row.finality_status === status || row.batch_finality_status === status,
    )
  }

  // Newest batches first — matches production list ordering.
  batchRows = [...batchRows].reverse().slice(0, limit)

  return {
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batches: batchRows,
  }
}

export function buildBatchDetail(batchId) {
  const meta = batchMeta(batchId)
  const leak = leakageFromBatchMeta(meta)
  const variance = meta.settlementTotalRupees - meta.intentTotalRupees
  return {
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batch: {
      batch_id: batchId,
      tenant_id: TENANT_ID,
      source_reference: meta.partner,
      finality_status: mapBatchFinalityStatus(meta.finality),
      batch_finality_status: mapBatchFinalityStatus(meta.finality),
      total_count: meta.intentCount,
      success_count: meta.settledRows ?? 12,
      failed_count: meta.failedRows ?? 1,
      pending_count: meta.pendingRows ?? 2,
      match_confidence: batchMatchConfidencePct(meta),
      unresolved_intended_amount_minor: batchUnresolvedMinor(meta),
      total_confirmed_amount_minor: meta.settlementTotalRupees,
      total_variance_minor: variance,
      missing_ref_count: meta.dlqCount ?? 0,
      settlement_ref_count: meta.observationCount,
      ambiguity_score: 1 - (meta.matchConfidence ?? 0.75),
    },
    batch_health: {
      total_confirmed_amount_minor: meta.settlementTotalRupees,
      total_variance_minor: variance,
      total_intended_amount_minor: meta.intentTotalRupees,
      ambiguity_score: 1 - (meta.matchConfidence ?? 0.75),
      finality_status: meta.finality ?? 'PARTIALLY_SETTLED',
      source_reference: meta.partner,
    },
  }
}

export function buildBatchContract(batchId) {
  const meta = batchMeta(batchId)
  const leak = leakageFromBatchMeta(meta)
  const variance = meta.settlementTotalRupees - meta.intentTotalRupees
  return {
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batch_id: batchId,
    bank_reference_coverage: `${Math.min(99, 88 + (meta.settledRows ?? 12))}.00%`,
    settlement_ref_count: meta.observationCount,
    bank_ref_present_count: meta.settledRows ?? 12,
    client_ref_present_count: Math.max(0, (meta.settledRows ?? 12) - 1),
    client_reference_coverage: `${Math.min(99, 85 + (meta.settledRows ?? 12))}.00%`,
    variance_amount: variance,
    orphan_amount: leak.orphan,
    unmatch_amount: leak.unmatched,
    total_confirmed_amount: meta.settlementTotalRupees,
    original_settled_amount: meta.settlementTotalRupees,
    match_confidence: meta.matchConfidence ?? 0.75,
    missing_reference_rate: `${Math.max(1, meta.pendingRows ?? 2)}.00%`,
    source_reference: meta.partner,
  }
}

const LEAKAGE_DAY_MS = 86_400_000

/** Per-day leakage from dated smoke batches (home trend calls one day at a time). */
function leakageComponentsForDay(dateStr) {
  // Use full-year catalogue so Month/Year charts match master even when BATCHES is capped.
  const batch = ALL_BATCHES.find((b) => b.date === dateStr)
  if (!batch) {
    return { intended: 0, settled: 0, unmatched: 0, under: 0, orphan: 0, reversal: 0 }
  }
  return leakageFromBatchMeta(batch)
}

function* leakageDaysInWindow(fromStr, toStr) {
  const from = new Date(`${fromStr}T00:00:00Z`).getTime()
  const to = new Date(`${toStr}T00:00:00Z`).getTime()
  for (let t = from; t <= to; t += LEAKAGE_DAY_MS) {
    yield new Date(t).toISOString().slice(0, 10)
  }
}

/**
 * Leakage KPIs for a date window or a single batch. The home trend chart calls
 * this once per bucket with from_date=to_date=<day>, so each bar gets that
 * day's own value. With no window (KPI strip) it returns the current calendar
 * month aggregate. With batch_id it returns that batch's scoped snapshot.
 */
export function leakageKpi(fromDate, toDate, batchId, request) {
  if (batchId?.trim() && !isBatchFullyReady(batchId.trim(), request)) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      batch_id: batchId.trim(),
      computed_at: new Date().toISOString(),
      total_intended_amount_minor: 0,
      total_amount_minor: 0,
      unmatched_amount_minor: 0,
      under_settlement_amount_minor: 0,
      orphan_amount_minor: 0,
      reversal_exposure_minor: 0,
      total_observed_settled_amount_minor: 0,
      leakage_percentage: 0,
      exposure_bands: [],
    }
  }
  if (!batchId?.trim() && !hasAnyFullyReadyBatch(request)) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      computed_at: new Date().toISOString(),
      total_intended_amount_minor: 0,
      total_amount_minor: 0,
      unmatched_amount_minor: 0,
      under_settlement_amount_minor: 0,
      orphan_amount_minor: 0,
      reversal_exposure_minor: 0,
      total_observed_settled_amount_minor: 0,
      leakage_percentage: 0,
      exposure_bands: [],
    }
  }
  if (batchId?.trim()) {
    const meta = batchMeta(batchId.trim())
    const sum = leakageFromBatchMeta(meta)
    const totalExposure = sum.unmatched + sum.under + sum.orphan + sum.reversal
    const exposureDenom = totalExposure > 0 ? totalExposure : 1
    const leakagePct = sum.intended > 0 ? Number((sum.unmatched / sum.intended).toFixed(4)) : 0
    const day = meta.date ?? new Date().toISOString().slice(0, 10)
    return {
      data_available: sum.intended > 0 || sum.settled > 0,
      tenant_id: TENANT_ID,
      batch_id: meta.id,
      computed_at: new Date().toISOString(),
      window_start: `${day}T00:00:00Z`,
      window_end: `${day}T23:59:59Z`,
      total_intended_amount_minor: sum.intended,
      total_amount_minor: totalExposure,
      unmatched_amount_minor: sum.unmatched,
      under_settlement_amount_minor: sum.under,
      orphan_amount_minor: sum.orphan,
      reversal_exposure_minor: sum.reversal,
      total_observed_settled_amount_minor: sum.settled,
      ambiguous_value_at_risk_minor: Math.round((sum.unmatched + sum.under) * 0.22),
      risk_adjusted_leakage_minor: Math.round(totalExposure * 0.72),
      leakage_percentage: leakagePct,
      risk_tier: leakagePct >= 0.15 ? 'CRITICAL' : leakagePct >= 0.08 ? 'HIGH' : leakagePct >= 0.05 ? 'MEDIUM' : 'LOW',
      exposure_bands: [
        {
          band: 'Unmatched Payment Value',
          amount_minor: sum.unmatched,
          share_pct: Number(((sum.unmatched / exposureDenom) * 100).toFixed(1)),
        },
        {
          band: 'Short-Settled Value',
          amount_minor: sum.under,
          share_pct: Number(((sum.under / exposureDenom) * 100).toFixed(1)),
        },
        {
          band: 'Unlinked Settlement Value',
          amount_minor: sum.orphan,
          share_pct: Number(((sum.orphan / exposureDenom) * 100).toFixed(1)),
        },
        {
          band: 'Reversal Exposure',
          amount_minor: sum.reversal,
          share_pct: Number(((sum.reversal / exposureDenom) * 100).toFixed(1)),
        },
      ],
      segment_roll_rates: [
        { from_band: 'settled', to_band: 'unmatched', roll_pct: 4.2 },
        { from_band: 'settled', to_band: 'short_settled', roll_pct: 2.1 },
        { from_band: 'short_settled', to_band: 'orphan', roll_pct: 0.8 },
        { from_band: 'orphan', to_band: 'reversal', roll_pct: 0.4 },
      ],
    }
  }

  let from = fromDate
  let to = toDate
  if (!from || !to) {
    const today = new Date()
    const y = today.getUTCFullYear()
    const m = today.getUTCMonth()
    to = today.toISOString().slice(0, 10)
    from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  }

  const sum = { intended: 0, settled: 0, unmatched: 0, under: 0, orphan: 0, reversal: 0 }
  for (const day of leakageDaysInWindow(from, to)) {
    const c = leakageComponentsForDay(day)
    sum.intended += c.intended
    sum.settled += c.settled
    sum.unmatched += c.unmatched
    sum.under += c.under
    sum.orphan += c.orphan
    sum.reversal += c.reversal
  }

  const leakagePct = sum.intended > 0 ? Number((sum.unmatched / sum.intended).toFixed(4)) : 0
  const totalExposure = sum.unmatched + sum.under + sum.orphan + sum.reversal
  const exposureDenom = totalExposure > 0 ? totalExposure : 1
  return {
    data_available: sum.intended > 0 || sum.settled > 0,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    window_start: `${from}T00:00:00Z`,
    window_end: `${to}T23:59:59Z`,
    total_intended_amount_minor: sum.intended,
    total_amount_minor: totalExposure,
    unmatched_amount_minor: sum.unmatched,
    under_settlement_amount_minor: sum.under,
    orphan_amount_minor: sum.orphan,
    reversal_exposure_minor: sum.reversal,
    total_observed_settled_amount_minor: sum.settled,
    ambiguous_value_at_risk_minor: Math.round((sum.unmatched + sum.under) * 0.22),
    risk_adjusted_leakage_minor: Math.round(totalExposure * 0.72),
    leakage_percentage: leakagePct,
    risk_tier: leakagePct >= 0.05 ? 'MEDIUM' : 'LOW',
    exposure_bands: [
      {
        band: 'Unmatched Payment Value',
        amount_minor: sum.unmatched,
        share_pct: Number(((sum.unmatched / exposureDenom) * 100).toFixed(1)),
      },
      {
        band: 'Short-Settled Value',
        amount_minor: sum.under,
        share_pct: Number(((sum.under / exposureDenom) * 100).toFixed(1)),
      },
      {
        band: 'Unlinked Settlement Value',
        amount_minor: sum.orphan,
        share_pct: Number(((sum.orphan / exposureDenom) * 100).toFixed(1)),
      },
      {
        band: 'Reversal Exposure',
        amount_minor: sum.reversal,
        share_pct: Number(((sum.reversal / exposureDenom) * 100).toFixed(1)),
      },
    ],
    segment_roll_rates: [
      { from_band: 'settled', to_band: 'unmatched', roll_pct: 4.2 },
      { from_band: 'settled', to_band: 'short_settled', roll_pct: 2.1 },
      { from_band: 'short_settled', to_band: 'orphan', roll_pct: 0.8 },
      { from_band: 'orphan', to_band: 'reversal', roll_pct: 0.4 },
    ],
  }
}

/** Deterministic wobble so smoke charts look like real ops data, not flat lines. */
function leakageSeriesWobble(index, amplitude = 0.14) {
  const x =
    Math.sin(index * 0.65) * 0.45 +
    Math.sin(index * 1.37 + 1.2) * 0.32 +
    Math.sin(index * 2.08 + 0.4) * 0.23
  return x * amplitude
}

function isoWeekStart(date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const weekday = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - (weekday - 1))
  return d
}

function addUtcDays(date, days) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

export function leakageExposureTimeseries(granularity = 'day', request) {
  if (!hasAnyFullyReadyBatch(request)) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      computed_at: new Date().toISOString(),
      granularity: granularity === 'week' || granularity === 'month' ? granularity : 'day',
      series: [],
    }
  }
  const resolvedGranularity = granularity === 'week' || granularity === 'month' ? granularity : 'day'
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  /** Build bucket dates oldest → newest (matches zord-intelligence). */
  let bucketDates = []
  if (resolvedGranularity === 'week') {
    let cursor = isoWeekStart(addUtcDays(today, -7 * 11))
    const end = isoWeekStart(today)
    while (cursor <= end) {
      bucketDates.push(formatIsoDate(cursor))
      cursor = addUtcDays(cursor, 7)
    }
  } else if (resolvedGranularity === 'month') {
    let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1))
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    while (cursor <= end) {
      bucketDates.push(formatIsoDate(cursor))
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    }
  } else {
    let cursor = addUtcDays(today, -29)
    while (cursor <= today) {
      bucketDates.push(formatIsoDate(cursor))
      cursor = addUtcDays(cursor, 1)
    }
  }

  const baseCurrent =
    resolvedGranularity === 'month' ? 18_500_000 : resolvedGranularity === 'week' ? 3_800_000 : 540_000
  const basePredicted =
    resolvedGranularity === 'month' ? 42_000_000 : resolvedGranularity === 'week' ? 8_600_000 : 1_260_000
  const currentStep =
    resolvedGranularity === 'month' ? -420_000 : resolvedGranularity === 'week' ? -95_000 : -4_200
  const predictedStep =
    resolvedGranularity === 'month' ? -680_000 : resolvedGranularity === 'week' ? -140_000 : -6_800

  const series = bucketDates.map((date, index) => {
    const wobble = leakageSeriesWobble(index + (resolvedGranularity === 'day' ? 0 : 5))
    const spike = index === Math.floor(bucketDates.length * 0.62) ? 0.11 : 0
    const dip = index === Math.floor(bucketDates.length * 0.38) ? -0.07 : 0
    const factor = 1 + wobble + spike + dip

    const current = Math.round((baseCurrent + currentStep * index) * factor)
    const predicted = Math.round((basePredicted + predictedStep * index) * (1 + wobble * 0.82 + spike * 0.45 + dip * 0.35))

    return {
      date,
      current_leakage_minor: Math.max(Math.round(baseCurrent * 0.55), current),
      predicted_leakage_minor: Math.max(Math.round(basePredicted * 0.62), predicted),
    }
  })

  const projectStart = addUtcDays(today, -12)

  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    window_start: `${series[0].date}T00:00:00Z`,
    window_end: `${series[series.length - 1].date}T23:59:59Z`,
    granularity: resolvedGranularity,
    project_start_at: `${formatIsoDate(projectStart)}T00:00:00Z`,
    series,
  }
}

export function ambiguityKpi(request) {
  if (!hasAnyFullyReadyBatch(request)) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      computed_at: new Date().toISOString(),
      value_at_risk_minor: 0,
      avg_attachment_confidence: 0,
      avg_score_margin: 0,
      provider_ref_missing_rate: 0,
      low_confidence_rate: 0,
      carrier_completeness_rate: 0,
      candidate_collision_rate: 0,
      ambiguous_intent_count: 0,
      ambiguity_rate: 0,
      velocity_series: [],
      matching_execution_heatmap: { cells: [], summary: {}, intents_under_evaluation_count: 0 },
      matching_execution_summary: {},
      intents_under_evaluation_count: 0,
      intelligence_headline: 'Upload obligation and settlement files to unlock ambiguity metrics.',
      intelligence_body: 'No batch is ready yet.',
    }
  }
  // Ambiguity KPI strip appends "%" to these fields — use 0–100 scale (not 0–1).
  const providerRefMissingRatePct = 16
  const ambiguityRatePct = 8
  /** Home Match Confidence card displays this value as-is with a % suffix (0–100 scale). */
  const avgAttachmentConfidencePct = 80
  const lowConfidenceRatePct = 18
  const carrierCompletenessRatePct = 84
  const candidateCollisionRatePct = 4
  const matchingExecutionHeatmap = buildMatchingExecutionHeatmap()
  const mix = buildAmbiguityMixSegments({
    providerRefMissingRate: providerRefMissingRatePct / 100,
    ambiguityRate: ambiguityRatePct / 100,
    lowConfidenceRate: lowConfidenceRatePct / 100,
    avgAttachmentConfidence: avgAttachmentConfidencePct / 100,
  })
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    value_at_risk_minor: 250_000,
    avg_attachment_confidence: avgAttachmentConfidencePct,
    /** A7 — avg(WinningScore − RunnerUpScore); Settlement Certainty bucket. */
    avg_score_margin: 0.24,
    provider_ref_missing_rate: providerRefMissingRatePct,
    low_confidence_rate: lowConfidenceRatePct,
    carrier_completeness_rate: carrierCompletenessRatePct,
    candidate_collision_rate: candidateCollisionRatePct,
    ambiguous_intent_count: 12,
    ambiguity_rate: ambiguityRatePct,
    velocity_series: buildAmbiguityVelocitySeries(),
    matching_execution_heatmap: matchingExecutionHeatmap,
    matching_execution_summary: matchingExecutionHeatmap.summary,
    intents_under_evaluation_count: matchingExecutionHeatmap.intents_under_evaluation_count,
    intelligence_headline: '12 intents need provider reference review before dispatch.',
    intelligence_body: 'Missing UTR cluster on Cashfree rail is the top driver this week.',
    total_intended_amount_minor: 34_200_000,
    total_observed_settled_amount_minor: 26_000_000,
    ambiguous_amount_minor: 4_100_000,
    total_variance_minor: 2_200_000,
    reversal_exposure_minor: 1_500_000,
    unresolved_amount_minor: 400_000,
    unresolved_count: 12,
    signal_clarity_subtitle: '₹34.2Cr book across 780 payments · ₹8.4Cr needing match review',
    signal_clarity_roll_rates: [
      { from_band: 'Current', to_band: 'SMA-0', roll_pct: 9 },
      { from_band: 'SMA-0', to_band: 'SMA-1', roll_pct: 18 },
      { from_band: 'SMA-1', to_band: 'SMA-2', roll_pct: 31 },
      { from_band: 'SMA-2', to_band: 'NPA', roll_pct: 22 },
    ],
    signal_clarity_bands: [
      {
        band: 'Current',
        range_label: 'Confirmed settlement',
        amount_minor: 26_000_000,
        item_count: 645,
        share_pct: 76,
        tone: 'green',
      },
      {
        band: 'SMA-0',
        range_label: 'Unclear match value',
        amount_minor: 4_100_000,
        item_count: 67,
        share_pct: 12,
        roll_pct: 9,
        tone: 'lime',
      },
      {
        band: 'SMA-1',
        range_label: 'Settlement variance',
        amount_minor: 2_200_000,
        item_count: 38,
        share_pct: 6.4,
        roll_pct: 18,
        tone: 'amber',
      },
      {
        band: 'SMA-2',
        range_label: 'Reversal exposure',
        amount_minor: 1_500_000,
        item_count: 18,
        share_pct: 4.4,
        roll_pct: 31,
        tone: 'orange',
      },
      {
        band: 'NPA-2',
        range_label: 'Still open',
        amount_minor: 400_000,
        item_count: 12,
        share_pct: 1.2,
        roll_pct: 22,
        tone: 'red',
      },
    ],
    clearing_pct: 82,
    ...mix,
  }
}

const AMBIGUITY_HEATMAP_X_LABELS = ['Exact', 'High', 'Amb', 'Unres', 'Conf']
const AMBIGUITY_HEATMAP_MAX_ROWS = 12

function addDaysIso(baseDate, days) {
  const date = new Date(`${baseDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildAmbiguityVelocitySeries() {
  const day = Array.from({ length: 14 }, (_, idx) => ({
    period: addDaysIso('2026-07-01', idx),
    review_count: 8 + (idx % 5) + (idx >= 9 ? 2 : 0),
    low_confidence_count: 3 + (idx % 4),
    missing_ref_count: 2 + ((idx + 1) % 3),
  }))

  const week = Array.from({ length: 8 }, (_, idx) => ({
    period: `W${String(idx + 24).padStart(2, '0')}`,
    review_count: 41 + idx * 3 + (idx % 2) * 4,
    low_confidence_count: 18 + idx * 2,
    missing_ref_count: 12 + idx,
  }))

  const month = Array.from({ length: 6 }, (_, idx) => ({
    period: addDaysIso('2026-02-01', idx * 30).slice(0, 7),
    review_count: 144 + idx * 16,
    low_confidence_count: 58 + idx * 7,
    missing_ref_count: 35 + idx * 5,
  }))

  const year = [
    { period: '2023', review_count: 940, low_confidence_count: 355, missing_ref_count: 218 },
    { period: '2024', review_count: 1120, low_confidence_count: 420, missing_ref_count: 246 },
    { period: '2025', review_count: 1288, low_confidence_count: 456, missing_ref_count: 280 },
    { period: '2026', review_count: 780, low_confidence_count: 264, missing_ref_count: 166 },
  ]

  return { day, week, month, year }
}

function heatmapCellIntensity(count, total, columnIndex) {
  const ratio = total > 0 ? count / total : 0
  const healthyColumn = columnIndex === 0 || columnIndex === 1
  if (healthyColumn) {
    if (count <= 0) return 2
    if (ratio >= 0.55) return 0
    if (ratio >= 0.25) return 1
    return 2
  }
  if (count <= 0) return 0
  if (ratio >= 0.22) return 2
  if (ratio >= 0.06) return 1
  return 0
}

function ambiguityHeatmapRows() {
  return BATCHES.map((b, idx) => {
    const total = b.intentCount
    const ambiguous = 2 + (idx % 5)
    const unresolved = 1 + (idx % 4)
    const conflicted = idx % 5 === 0 ? 2 : idx % 7 === 0 ? 1 : 0
    const high = Math.min(Math.max(2, Math.floor(total * 0.22)), total)
    const exact = Math.max(0, total - ambiguous - unresolved - conflicted - high)
    const finality =
      idx % 4 === 0 ? 'REQUIRES_REVIEW' : idx % 3 === 1 ? 'PROCESSING' : 'SETTLED'
    return {
      batch_id: b.id,
      total_intended_amount_minor: b.totalIntendedMinor,
      total_count: total,
      finality_status: finality,
      exact_match_count: exact,
      high_confidence_count: high,
      ambiguous_count: ambiguous,
      unresolved_count: unresolved,
      conflicted_count: conflicted,
      aggregate_score: 0.68 + (idx % 9) * 0.03,
    }
  })
}

function buildMatchingExecutionSummary(rows) {
  const reviewing = rows.filter((row) => row.finality_status === 'REQUIRES_REVIEW').length
  const syncing = rows.filter((row) => row.finality_status === 'PROCESSING').length
  const intents = rows.reduce((sum, row) => sum + row.total_count, 0)
  const avgScore = rows.reduce((sum, row) => sum + row.aggregate_score, 0) / Math.max(1, rows.length)
  const parts = [
    `${rows.length} batches in matching log`,
    syncing > 0 ? `${syncing} syncing` : null,
    reviewing > 0 ? `${reviewing} in review` : null,
    `avg match score ${Math.round(avgScore * 100)}%`,
  ].filter(Boolean)
  return `${parts.join(' · ')} · ${intents.toLocaleString('en-IN')} intents tracked.`
}

function buildMatchingExecutionHeatmap() {
  const allRows = ambiguityHeatmapRows()
  const rows = allRows.slice(0, AMBIGUITY_HEATMAP_MAX_ROWS)
  const cells = rows.map((row) => {
    const total = row.total_count > 0 ? row.total_count : 1
    return [
      heatmapCellIntensity(row.exact_match_count, total, 0),
      heatmapCellIntensity(row.high_confidence_count, total, 1),
      heatmapCellIntensity(row.ambiguous_count, total, 2),
      heatmapCellIntensity(row.unresolved_count, total, 3),
      heatmapCellIntensity(row.conflicted_count, total, 4),
    ]
  })

  return {
    y_labels: rows.map((_, idx) => idx + 1),
    batch_ids: rows.map((row) => row.batch_id),
    x_labels: AMBIGUITY_HEATMAP_X_LABELS,
    cells,
    summary: buildMatchingExecutionSummary(rows),
    intents_under_evaluation_count: allRows.reduce(
      (sum, row) => sum + row.ambiguous_count + row.unresolved_count,
      0,
    ),
    column_totals: [
      rows.reduce((sum, row) => sum + row.exact_match_count, 0),
      rows.reduce((sum, row) => sum + row.high_confidence_count, 0),
      rows.reduce((sum, row) => sum + row.ambiguous_count, 0),
      rows.reduce((sum, row) => sum + row.unresolved_count, 0),
      rows.reduce((sum, row) => sum + row.conflicted_count, 0),
    ],
  }
}

export function ambiguityHeatmap(request) {
  if (!hasAnyFullyReadyBatch(request)) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      intelligence_mode: 'GRADE_A',
      batches: [],
    }
  }
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batches: ambiguityHeatmapRows(),
  }
}

/** Risk-ratio presets so bubble map shows red / yellow / green tiers across recent batches. */
const BUBBLE_MAP_RISK_PCTS = [0, 1.2, 3.5, 7.8, 15.4, 0.6, 4.2, 9.1, 12.5, 2.1]

const BUBBLE_MAP_WINDOW = 24

export function bubbleMap(request) {
  if (!hasAnyFullyReadyBatch(request)) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      intelligence_mode: 'GRADE_A',
      count: 0,
      batches: [],
    }
  }
  const recent = BATCHES.slice(-BUBBLE_MAP_WINDOW)
  const batches = recent.map((b, idx) => {
    const amountValue = b.intentTotalRupees ?? b.totalIntendedMinor ?? 0
    const riskPct = BUBBLE_MAP_RISK_PCTS[idx % BUBBLE_MAP_RISK_PCTS.length]
    const amountAtRisk = riskPct <= 0 ? 0 : Math.round(amountValue * (riskPct / 100))
    return {
      batch_id: b.id,
      amount_value: amountValue,
      amount_at_risk: amountAtRisk,
      batch_date: b.date,
    }
  })

  return {
    data_available: true,
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    count: batches.length,
    batches,
  }
}

export function patternsDashboard(batchId, request) {
  const bid = batchId?.trim() || null
  if ((bid && !isBatchFullyReady(bid, request)) || (!bid && !hasAnyFullyReadyBatch(request))) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      computed_at: new Date().toISOString(),
      ...(bid ? { batch_id: bid } : {}),
      total_count: 0,
      success_count: 0,
      failed_count: 0,
      pending_count: 0,
      ambiguous_count: 0,
      patterns: [],
    }
  }
  const batchIndex = bid ? ALL_BATCHES.findIndex((b) => b.id === bid) : -1
  const meta = bid ? batchMeta(bid) : null
  const known = Boolean(!bid || batchIndex >= 0 || meta)

  const catalogue = activeBatches(request)
  const tenantBatchCount = catalogue.length
  const totalCount = bid ? (meta?.intentCount ?? 100) : Math.max(tenantBatchCount, 100)
  const successCount = bid
    ? (meta?.settledRows ?? 12)
    : catalogue.reduce((sum, b) => sum + (b.settledRows ?? 0), 0)
  const failedCount = bid ? (meta?.failedRows ?? 1) : catalogue.reduce((sum, b) => sum + (b.failedRows ?? 0), 0)
  const pendingCount = bid
    ? (meta?.pendingRows ?? 2)
    : catalogue.reduce((sum, b) => sum + (b.pendingRows ?? 0), 0)
  const ambiguousCount = bid ? 8 + ((batchIndex >= 0 ? batchIndex : 0) % 7) : 18
  const batchRiskScore = bid
    ? Number((0.31 + ((batchIndex >= 0 ? batchIndex : 0) % 6) * 0.04).toFixed(2))
    : 0.39
  const batchQualityScore = bid ? 72 + ((batchIndex >= 0 ? batchIndex : 0) % 5) * 4 : 88
  const orphanCount = bid ? 6 + ((batchIndex >= 0 ? batchIndex : 0) % 4) : 12
  const shortCount = bid ? 4 + ((batchIndex >= 0 ? batchIndex : 0) % 3) : 9
  const ambiguousDriverCount = bid ? 3 + ((batchIndex >= 0 ? batchIndex : 0) % 4) : 7

  return {
    data_available: known,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    ...(bid ? { batch_id: bid } : {}),
    ...(known ? {} : { reason: 'No batch data available for this period' }),
    decision_success_rate: '64.95%',
    by_provider: {
      razorpay: {
        total_decisions: 25,
        successful_decision_count: 22,
        decision_success_rate: '88.00%',
        ambiguity_rate: '0.00%',
        unresolved_decisions: 0,
        orphan_rate: '20.00%',
      },
      cashfree: {
        total_decisions: 17,
        successful_decision_count: 15,
        decision_success_rate: '88.24%',
        ambiguity_rate: '0.00%',
        unresolved_decisions: 0,
        orphan_rate: '5.88%',
      },
    },
    batch_anomaly_score: 0.31,
    anomaly_level: 'MEDIUM',
    batch_risk_score: batchRiskScore,
    batch_quality_score: batchQualityScore,
    risk_tier: 'MEDIUM',
    finality_status: meta?.finality ?? 'PARTIALLY_SETTLED',
    total_count: totalCount,
    success_count: successCount,
    failed_count: failedCount,
    pending_count: pendingCount,
    exact_match_count: Math.max(0, successCount - Math.floor(ambiguousCount / 2)),
    high_confidence_count: Math.max(0, Math.floor(successCount * 0.35)),
    ambiguous_count: ambiguousCount,
    unresolved_count: bid ? 3 + ((batchIndex >= 0 ? batchIndex : 0) % 4) : 9,
    conflicted_count: bid ? 1 + ((batchIndex >= 0 ? batchIndex : 0) % 2) : 4,
    duplicate_risk_rate: bid ? 0.06 + ((batchIndex >= 0 ? batchIndex : 0) % 5) * 0.01 : 0.08,
    duplicate_risk_count: bid ? 2 + ((batchIndex >= 0 ? batchIndex : 0) % 3) : 7,
    value_date_mismatch_count: bid ? 2 + ((batchIndex >= 0 ? batchIndex : 0) % 3) : 5,
    risk_driver_breakdown: [
      { label: 'Orphan settlements', count: orphanCount, share_pct: 42 },
      { label: 'Short settlement', count: shortCount, share_pct: 31 },
      { label: 'Ambiguous match', count: ambiguousDriverCount, share_pct: 27 },
    ],
    network_health_trend: [
      { label: '28 May', success_pct: '82.0%', latency_index: 72 },
      { label: '29 May', success_pct: '84.5%', latency_index: 74 },
      { label: '30 May', success_pct: '86.0%', latency_index: 76 },
      { label: '31 May', success_pct: '88.0%', latency_index: 78 },
      { label: '01 Jun', success_pct: '88.2%', latency_index: 80 },
    ],
  }
}

export function operationsSummary(batchId, request) {
  const bid = batchId?.trim() || null
  if (bid && !isBatchFullyReady(bid, request)) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      batch_id: bid,
      computed_at: new Date().toISOString(),
      settlement_confirmation_coverage_pct: 0,
      confirmed_matched_value_minor: 0,
      total_intended_amount_minor: 0,
      open_exception_queue_count: 0,
      open_exception_queue_value_minor: 0,
      batch_close_readiness: {
        blocked_batch_count: 0,
        close_ready_batch_count: 0,
        blocked_batch_ids: [],
        close_ready_batch_ids: [],
      },
      operations_insights: [],
    }
  }
  if (!bid && !hasAnyFullyReadyBatch(request)) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      computed_at: new Date().toISOString(),
      settlement_confirmation_coverage_pct: 0,
      confirmed_matched_value_minor: 0,
      total_intended_amount_minor: 0,
      open_exception_queue_count: 0,
      open_exception_queue_value_minor: 0,
      batch_close_readiness: {
        blocked_batch_count: 0,
        close_ready_batch_count: 0,
        blocked_batch_ids: [],
        close_ready_batch_ids: [],
      },
      operations_insights: [],
    }
  }
  const scope = bid ? [batchMeta(bid)] : activeBatches(request)
  const leak = bid ? leakageKpi(undefined, undefined, bid, request) : leakageKpi(undefined, undefined, undefined, request)
  const blocked = scope.filter((b) => b.finality === 'OPEN')
  const closeReady = scope.filter((b) => b.finality === 'FULLY_SETTLED')
  const dlqTotal = scope.reduce((sum, b) => sum + (b.dlqCount ?? 0), 0)
  const intended = leak.total_intended_amount_minor ?? 0
  const settled = leak.total_observed_settled_amount_minor ?? 0
  const coverage = intended > 0 ? Number(((settled / intended) * 100).toFixed(1)) : 0
  const exceptionValue = leak.total_amount_minor ?? 0

  return {
    data_available: intended > 0 || settled > 0,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    ...(bid ? { batch_id: bid } : {}),
    window_start: leak.window_start,
    window_end: leak.window_end,
    settlement_confirmation_coverage_pct: coverage,
    confirmed_matched_value_minor: settled,
    total_intended_amount_minor: intended,
    open_exception_queue_count: Math.max(dlqTotal, blocked.length + 2),
    open_exception_queue_value_minor: exceptionValue,
    batch_close_readiness: {
      blocked_batch_count: blocked.length,
      close_ready_batch_count: closeReady.length,
      blocked_batch_ids: blocked.map((b) => b.id),
      close_ready_batch_ids: closeReady.map((b) => b.id),
    },
    operations_insights: [
      {
        title: 'Batches blocked from close',
        detail: blocked.length
          ? `${blocked.length} batch(es) still OPEN and need review before close.`
          : 'No batches are currently blocked from close.',
        severity: blocked.length ? 'high' : 'low',
        case_count: blocked.length,
        href: '/payout-command-view/today?dock=grid',
      },
      {
        title: 'Open financial exceptions',
        detail: `Exception queue value is ₹${Number(exceptionValue).toLocaleString('en-IN')} across ${Math.max(dlqTotal, 1)} case(s).`,
        severity: 'medium',
        case_count: Math.max(dlqTotal, blocked.length + 2),
        href: '/payout-command-view/today?dock=leakage',
      },
      {
        title: 'Settlement confirmation coverage',
        detail: `Bank/settlement confirmation covers ${coverage}% of intended payment value.`,
        severity: coverage < 85 ? 'medium' : 'low',
        case_count: scope.length,
      },
    ],
  }
}

export function exceptionsSummary(batchId, request) {
  const ops = operationsSummary(batchId, request)
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    ...(batchId?.trim() ? { batch_id: batchId.trim() } : {}),
    open_financial_exception_count: ops.open_exception_queue_count,
    open_financial_exception_value_minor: ops.open_exception_queue_value_minor,
  }
}

/** Aggregate manual-review DLQ across journal batches for Payment Operations View. */
export function buildManualReviewDlq(request) {
  const items = BATCHES.flatMap((b) => buildDlqItems(b.id, request).items)
  return {
    items,
    pagination: { page: 1, page_size: items.length, total: items.length },
  }
}

/**
 * Smoke stand-in for zord-prompt-layer POST /query — grounds Ask Zord on Payment
 * Operations View using the same catalogue as leakage / ops summary.
 */
export function promptLayerQuery(body = {}) {
  const query = String(body.query ?? '').trim() || 'Summarize payment operations'
  const batchId = body.ui_context?.batch_id?.trim() || undefined
  const ops = operationsSummary(batchId)
  const amb = ambiguityKpi()
  const patterns = patternsDashboard(batchId)
  const dlq = buildManualReviewDlq()
  const q = query.toLowerCase()

  let answer
  if (q.includes('exception') || q.includes('financial')) {
    answer =
      `There are ${ops.open_exception_queue_count} open financial exception case(s) ` +
      `worth ₹${Number(ops.open_exception_queue_value_minor).toLocaleString('en-IN')}. ` +
      `Next step: open Payment Gaps to clear unmatched and short-settled value.`
  } else if (q.includes('blocked') || q.includes('close')) {
    const blocked = ops.batch_close_readiness.blocked_batch_count
    const ready = ops.batch_close_readiness.close_ready_batch_count
    answer =
      `${blocked} batch(es) are blocked from close and ${ready} are close-ready. ` +
      (blocked
        ? `Blocked ids: ${ops.batch_close_readiness.blocked_batch_ids.slice(0, 3).join(', ')}.`
        : 'No close blockers in the current smoke catalogue.')
  } else if (q.includes('proof') || q.includes('evidence') || q.includes('missing')) {
    answer =
      `Evidence and source probes are available in smoke. Settlement confirmation coverage is ` +
      `${ops.settlement_confirmation_coverage_pct}%. Reference completeness is ` +
      `${Math.round(Number(amb.carrier_completeness_rate))}% and match confidence averages ` +
      `${Math.round(Number(amb.avg_attachment_confidence))}%.`
  } else if (q.includes('review') || q.includes('ambiguous') || q.includes('match')) {
    answer =
      `${amb.ambiguous_intent_count} payment(s) need match review. ` +
      `Manual-review DLQ has ${dlq.pagination.total} item(s). ` +
      `Average attachment confidence is ${Math.round(Number(amb.avg_attachment_confidence))}%. ` +
      `Next step: open Match Review or Intent Journal.`
  } else {
    answer =
      `Payment Operations smoke snapshot: ${patterns.total_count} in-scope rows, ` +
      `₹${Number(ops.total_intended_amount_minor).toLocaleString('en-IN')} intended, ` +
      `₹${Number(ops.confirmed_matched_value_minor).toLocaleString('en-IN')} bank-confirmed ` +
      `(${ops.settlement_confirmation_coverage_pct}% coverage). ` +
      `${ops.batch_close_readiness.blocked_batch_count} batch(es) blocked from close, ` +
      `${dlq.pagination.total} DLQ review item(s). Ask about exceptions, proof gaps, or close readiness for detail.`
  }

  return {
    answer,
    confidence: 'high',
    entities_found: {
      ...(batchId ? { intent_id: intentId(batchId, 0) } : {}),
    },
    citations: [
      {
        source_type: 'operations_summary',
        record_id: batchId || 'tenant',
        chunk_id: 'ops-summary',
        snippet: `coverage ${ops.settlement_confirmation_coverage_pct}% · exceptions ${ops.open_exception_queue_count}`,
        score: 0.94,
      },
      {
        source_type: 'ambiguity',
        record_id: 'ambiguity-kpi',
        chunk_id: 'match-review',
        snippet: `${amb.ambiguous_intent_count} ambiguous intents`,
        score: 0.88,
      },
    ],
    next_actions: [
      'Open Match Review for ambiguous intents',
      'Clear blocked batches before close',
      'Inspect Payment Gaps for exception value',
    ],
  }
}

export function patternDetail(batchId) {
  const bid = batchId || PRIMARY_BATCH
  if (!isBatchFullyReady(bid)) {
    return { data_available: false, tenant_id: TENANT_ID, batch_id: bid }
  }
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    snapshot_type: 'PATTERN',
    snapshot_id: `snap-${bid}`,
    scope_type: 'BATCH',
    scope_ref: bid,
    window_start: '2026-06-01T00:00:00Z',
    window_end: new Date().toISOString(),
    computed_at: new Date().toISOString(),
    model_version: 'zord-v1',
    intelligence_mode: 'GRADE_A',
    data: {
      batch_id: bid,
      risk_tier: 'HIGH',
      anomaly_level: 'ELEVATED',
      finality_status: 'PARTIALLY_SETTLED',
      batch_anomaly_score: 0.71,
      batch_quality_score: 0.62,
      batch_risk_score: 0.68,
      total_count: 120,
      success_count: 88,
      failed_count: 6,
      pending_count: 26,
      ambiguity_score: 0.24,
      ambiguous_count: 14,
      unresolved_count: 9,
      conflicted_count: 3,
      exact_match_count: 52,
      high_confidence_count: 36,
      prepare_and_sign_recommended: true,
      recommended_action: 'Review ambiguous batch before dispatch',
      weakest_source_system: 'manual_excel',
      weakest_source_missing_ref_rate: 0.42,
      weakest_provider_id: batchMeta(bid).partner,
      provider_quality_patterns: [
        {
          severity: 'CRITICAL',
          provider_id: batchMeta(bid).partner,
          orphan_rate: 0.24,
          ambiguity_rate: 0.05,
          avg_carrier_richness: 0.42,
          avg_parse_confidence: 0.59,
          settlement_delay_p95_days: 2,
        },
      ],
      source_quality_patterns: [
        {
          severity: 'HIGH',
          source_system: 'manual_excel',
          manual_review_rate: 0.31,
          missing_client_ref_rate: 0.42,
          low_matchability_rate: 0.4,
          duplicate_risk_rate: 0.12,
          manual_review_amount_minor: 500_000,
        },
      ],
    },
  }
}

export function patternHistory() {
  if (!hasAnyFullyReadyBatch()) {
    return { count: 0, tenant_id: TENANT_ID, intelligence_mode: 'GRADE_A', snapshot_type: 'PATTERN', snapshots: [] }
  }
  return {
    count: 1,
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    snapshot_type: 'PATTERN',
    snapshots: [
      {
        created_at: new Date().toISOString(),
        snapshot_json: {
          weakest_source_system: 'manual_excel',
          weakest_source_missing_ref_rate: 0.42,
          weakest_provider_id: 'cashfree',
          network_success_pct: '88.2%',
          network_latency_index: 80,
        },
      },
    ],
  }
}

export function recommendationsDashboard() {
  if (!hasAnyFullyReadyBatch()) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      computed_at: new Date().toISOString(),
    }
  }
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    total_actions: 3,
    accepted_actions: 1,
    resolved_actions: 1,
    action_acceptance_rate: 0.33,
    action_resolution_rate: 0.33,
    recommendation_impact_estimate_minor: 300_000,
  }
}

export function recommendationDetail() {
  if (!hasAnyFullyReadyBatch()) {
    return { data_available: false, tenant_id: TENANT_ID }
  }
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    snapshot_type: 'RECOMMENDATION',
    data: {
      recommended_action: 'Switch high-failure corridor to alternate PSP',
      provider_id: 'cashfree',
      confidence: 0.82,
      impact_estimate_minor: 180_000,
    },
  }
}

export function defensibilityKpi() {
  if (!hasAnyFullyReadyBatch()) {
    return {
      data_available: false,
      tenant_id: TENANT_ID,
      computed_at: new Date().toISOString(),
    }
  }
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    defensibility_score: 58,
    defensibility_tier: 'STRONG',
    bank_confirmed_rate: 0.72,
    /** Home Proof Readiness card displays this value as-is with a % suffix (0–100 scale). */
    evidence_pack_rate: 75,
    audit_ready_pct: 0.72,
    weak_evidence_count: 4,
    governance_coverage_pct: 0.85,
    replayability_pct: 0.9,
    dispute_ready_pct: 0.65,
    /** Evidence Pack Completeness KPI — ratio or 0–100 both format via normalizePercentRatio. */
    avg_pack_completeness_score: 0.78,
  }
}

/** Match Review Zord intelligence panel — RCA fields distinct from ambiguity KPIs. */
export function rcaKpi(batchId) {
  const bid = batchId?.trim() || null
  if (bid && !isBatchFullyReady(bid)) {
    return { data_available: false, tenant_id: TENANT_ID, computed_at: new Date().toISOString(), batch_id: bid }
  }
  if (!bid && !hasAnyFullyReadyBatch()) {
    return { data_available: false, tenant_id: TENANT_ID, computed_at: new Date().toISOString() }
  }
  const meta = bid ? batchMeta(bid) : null
  const totalSettlements = bid
    ? (meta?.observationCount ?? meta?.intentCount ?? 15)
    : BATCHES.reduce((sum, b) => sum + (b.observationCount ?? b.intentCount ?? 0), 0)
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    ...(bid ? { batch_id: bid } : {}),
    parser_weakness_rate: 0.14,
    weak_parse_count: bid ? 3 : 11,
    mapping_weakness_rate: 0.09,
    weak_mapping_count: bid ? 2 : 7,
    source_system_defect_rate: 0.11,
    source_system_defects: {
      erp_sftp: 0.12,
      bank_settlement: 0.08,
      psp_webhook: 0.15,
    },
    rca_concentration: 0.62,
    total_settlements: totalSettlements,
  }
}

export function packSummary(packId, opts = {}) {
  const batchId = opts.batchId ?? null
  const leafCount = opts.leafCount ?? 9
  return {
    evidence_pack_id: packId,
    tenant_id: TENANT_ID,
    intent_id: opts.intentId ?? null,
    batch_id: batchId,
    client_reference: opts.ref ?? packId,
    client_payout_ref: opts.ref ?? packId,
    mode: opts.mode ?? 'BATCH_PROOF',
    pack_status: 'READY',
    merkle_root: opts.merkleRoot ?? 'a'.repeat(64),
    ruleset_version: '1',
    created_at: opts.createdAt ?? '2026-06-12T09:00:00Z',
    proof_status: opts.proofStatus ?? 'PARTIAL',
    proof_score: opts.proofScore ?? 58,
    leaf_count: leafCount,
    required_leaf_count: 9,
    artifact_count: leafCount,
    pack_completeness_score: opts.proofScore != null ? opts.proofScore / 100 : 0.58,
    settlement_leaf_present_flag: true,
    attachment_decision_leaf_present_flag: true,
    governance_decision: 'Pass',
    verification_status: false,
  }
}

function merkleRootForBatch(batchId) {
  return `${batchId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}batchroot`.padEnd(64, 'b').slice(0, 64)
}

function hashSuffix(root, hexSuffix, missing = false) {
  if (missing) return ''
  return `${root.slice(0, 64 - hexSuffix.length)}${hexSuffix}`.slice(0, 64)
}

/** Nine lineage leaves + proof root for batch Merkle graph (UI shows 9 + H1 + root = 11). */
function buildBatchLineageGraph(batchId) {
  const meta = batchMeta(batchId)
  const root = merkleRootForBatch(batchId)
  const packId = batchPackId(batchId)
  const day = batchId.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? meta?.date ?? '2026-06-12'
  const nodeDefs = [
    { id: 'payment_file', label: 'Original Payment File', node_type: 'SOURCE', suffix: 'aa11111111111111', missing: false },
    { id: 'envelope', label: 'Envelope Hash', node_type: 'SOURCE', suffix: 'aa22222222222222', missing: false },
    { id: 'canonical_intent', label: 'Structured Payment Intent', node_type: 'TRANSFORM', suffix: 'bb11111111111111', missing: false },
    { id: 'governance', label: 'Governance Check', node_type: 'DECISION', suffix: 'bb22222222222222', missing: false },
    { id: 'settlement_file', label: 'Original Settlement File', node_type: 'SOURCE', suffix: 'cc11111111111111', missing: true },
    { id: 'canonical_settlement', label: 'Structured Settlement Observation', node_type: 'TRANSFORM', suffix: 'cc22222222222222', missing: false },
    { id: 'match_decision', label: 'Match Decision', node_type: 'DECISION', suffix: 'dd11111111111111', missing: false },
    { id: 'variance', label: 'Variance Decision', node_type: 'DECISION', suffix: 'dd22222222222222', missing: true },
    { id: 'evidence_summary', label: 'Evidence Summary', node_type: 'TRANSFORM', suffix: 'ee11111111111111', missing: false },
  ]
  const nodes = nodeDefs.map((def) => ({
    id: `${batchId}-${def.id}`,
    label: def.label,
    node_type: def.node_type,
    leaf_hash: hashSuffix(root, def.suffix, def.missing),
    item_ref: def.id.includes('intent') ? intentId(batchId, 0) : batchId,
    schema_version: 'v1',
  }))
  nodes.push({
    id: 'merkle_root',
    label: 'Proof Root',
    node_type: 'SEAL',
    leaf_hash: root,
    item_ref: packId,
    schema_version: 'v1',
  })

  const n = (suffix) => `${batchId}-${suffix}`
  const edges = [
    { from: n('payment_file'), to: n('envelope'), label: 'fingerprint' },
    { from: n('envelope'), to: n('canonical_intent'), label: 'canonicalise' },
    { from: n('canonical_intent'), to: n('governance'), label: 'govern' },
    { from: n('settlement_file'), to: n('canonical_settlement'), label: 'parse settlement' },
    { from: n('canonical_settlement'), to: n('match_decision'), label: 'match' },
    { from: n('match_decision'), to: n('variance'), label: 'variance check' },
    { from: n('governance'), to: n('evidence_summary'), label: 'aggregate intent proof' },
    { from: n('variance'), to: n('evidence_summary'), label: 'aggregate settlement proof' },
    { from: n('evidence_summary'), to: 'merkle_root', label: 'seal batch proof' },
  ]

  return {
    evidence_pack_id: packId,
    tenant_id: TENANT_ID,
    intent_id: '',
    batch_id: batchId,
    merkle_root: root,
    created_at: `${day}T09:00:00Z`,
    nodes,
    edges,
  }
}

function batchIdFromPackId(packId) {
  if (!packId?.startsWith('pack-')) return EVIDENCE_BATCH
  const body = packId.slice('pack-'.length)
  const piMarker = body.indexOf('-pi-')
  if (piMarker > 0) return body.slice(0, piMarker)
  return body
}

function isIntentEvidencePackId(packId) {
  return packId === PACK_INTENT_A || packId === PACK_INTENT_B || (packId?.startsWith('pack-') && packId.includes('-pi-'))
}

function intentPackBatchId(packId) {
  return batchIdFromPackId(packId)
}

function intentPackIndex(packId) {
  const match = packId?.match(/-pi-(\d+)$/)
  if (!match) return packId === PACK_INTENT_B ? 1 : 0
  return Math.max(0, Number.parseInt(match[1], 10) - 1)
}

/** One evidence pack summary per payment intent in the batch (matches intent journal row count). */
function intentEvidencePacksForBatch(batchId) {
  const meta = batchMeta(batchId)
  const count = Math.max(1, meta?.intentCount ?? 15)
  const day = meta?.date ?? '2026-06-12'
  const packs = []
  for (let i = 0; i < count; i += 1) {
    const iid = intentId(batchId, i)
    const score = 64 + ((i * 3) % 29)
    packs.push(
      packSummary(batchPackId(iid), {
        intentId: iid,
        batchId,
        mode: 'INTELLIGENCE_ATTACH',
        ref: payoutRef(batchId, i),
        proofScore: score,
        proofStatus: score >= 80 ? 'READY' : 'PARTIAL',
        createdAt: `${day}T09:${String(Math.min(59, i)).padStart(2, '0')}:00Z`,
        leafCount: 9,
        requiredLeafCount: 9,
      }),
    )
  }
  return packs
}

/** Nine lineage leaves + proof root for per-payment intent attach packs. */
function buildIntentLineageGraph(packId, batchId, intentIndex = 0) {
  const root = `${packId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}intentroot`.padEnd(64, 'c').slice(0, 64)
  const iid = intentId(batchId, intentIndex)
  const nodeDefs = [
    { id: 'payment_file', label: 'Original Payment File', node_type: 'SOURCE', suffix: '1111111111111111', missing: false },
    { id: 'envelope', label: 'Envelope Hash', node_type: 'SOURCE', suffix: '2222222222222222', missing: false },
    { id: 'canonical_intent', label: 'Structured Payment Intent', node_type: 'TRANSFORM', suffix: '3333333333333333', missing: false },
    { id: 'governance', label: 'Governance Check', node_type: 'DECISION', suffix: '4444444444444444', missing: false },
    { id: 'settlement_file', label: 'Original Settlement File', node_type: 'SOURCE', suffix: '5555555555555555', missing: true },
    { id: 'canonical_settlement', label: 'Structured Settlement Observation', node_type: 'TRANSFORM', suffix: '6666666666666666', missing: false },
    { id: 'match_decision', label: 'Match Decision', node_type: 'DECISION', suffix: '7777777777777777', missing: false },
    { id: 'variance', label: 'Variance Decision', node_type: 'DECISION', suffix: '8888888888888888', missing: true },
    { id: 'evidence_summary', label: 'Evidence Summary', node_type: 'TRANSFORM', suffix: '9999999999999999', missing: false },
  ]
  const nodes = nodeDefs.map((def) => ({
    id: `${packId}-${def.id}`,
    label: def.label,
    node_type: def.node_type,
    leaf_hash: hashSuffix(root, def.suffix, def.missing),
    item_ref: def.id.includes('intent') ? iid : payoutRef(batchId, intentIndex),
    schema_version: 'v1',
  }))
  nodes.push({
    id: 'merkle_root',
    label: 'Proof Root',
    node_type: 'SEAL',
    leaf_hash: root,
    item_ref: packId,
    schema_version: 'v1',
  })

  const n = (suffix) => `${packId}-${suffix}`
  const edges = [
    { from: n('payment_file'), to: n('envelope'), label: 'fingerprint' },
    { from: n('envelope'), to: n('canonical_intent'), label: 'canonicalise' },
    { from: n('canonical_intent'), to: n('governance'), label: 'govern' },
    { from: n('settlement_file'), to: n('canonical_settlement'), label: 'parse settlement' },
    { from: n('canonical_settlement'), to: n('match_decision'), label: 'match' },
    { from: n('match_decision'), to: n('variance'), label: 'variance check' },
    { from: n('governance'), to: n('evidence_summary'), label: 'aggregate intent proof' },
    { from: n('variance'), to: n('evidence_summary'), label: 'aggregate settlement proof' },
    { from: n('evidence_summary'), to: 'merkle_root', label: 'seal intent proof' },
  ]

  return {
    evidence_pack_id: packId,
    tenant_id: TENANT_ID,
    intent_id: iid,
    batch_id: batchId,
    merkle_root: root,
    created_at: `${batchMeta(batchId)?.date ?? '2026-06-12'}T10:00:00Z`,
    nodes,
    edges,
  }
}

function packDetailFromLineage(packId, lineage, opts = {}) {
  const leafNodes = lineage.nodes.filter((node) => node.id !== 'merkle_root')
  const index = opts.intentIndex ?? 0
  return {
    evidence_pack_id: packId,
    tenant_id: TENANT_ID,
    intent_id: lineage.intent_id ?? '',
    batch_id: lineage.batch_id ?? EVIDENCE_BATCH,
    contract_id: opts.contractId ?? 'ctr-payroll-inr-v3',
    mode: opts.mode ?? 'BATCH_PROOF',
    pack_status: opts.packStatus ?? 'READY',
    proof_status: opts.proofStatus ?? 'PARTIAL',
    proof_score: opts.proofScore ?? 58,
    merkle_root: lineage.merkle_root,
    ruleset_version: '1',
    created_at: lineage.created_at,
    client_payout_ref: opts.clientPayoutRef ?? null,
    client_reference: opts.clientPayoutRef ?? null,
    amount_minor: opts.amountMinor ?? null,
    match_confidence: opts.matchConfidence ?? null,
    governance_decision: opts.governanceDecision ?? null,
    attachment_decision: opts.attachmentDecision ?? null,
    bank_reference: opts.bankReference ?? null,
    amount_match: opts.amountMatch ?? null,
    value_date_check: opts.valueDateCheck ?? null,
    settlement_leaf_present_flag: opts.settlementLeafPresent ?? false,
    attachment_decision_leaf_present_flag: opts.attachmentLeafPresent ?? true,
    leaf_count: leafNodes.length,
    required_leaf_count: opts.requiredLeafCount ?? leafNodes.length,
    items: leafNodes.map((node) => ({
      type: node.label.replace(/\s+/g, '_').toUpperCase(),
      ref: node.item_ref,
      hash: node.leaf_hash ? `sha256:${node.leaf_hash}` : '',
      leaf_hash: node.leaf_hash || '',
      schema_version: node.schema_version || 'v1',
    })),
  }
}

export function evidencePackDetail(packId) {
  if (isIntentEvidencePackId(packId)) {
    const batchId = intentPackBatchId(packId)
    const index = intentPackIndex(packId)
    const lineage = buildIntentLineageGraph(packId, batchId, index)
    const score = 64 + ((index * 3) % 29)
    const amountRupees = 2_750 + index * 125
    const settled = index % 4 !== 2
    return packDetailFromLineage(packId, lineage, {
      mode: 'INTELLIGENCE_ATTACH',
      intentIndex: index,
      proofScore: score,
      proofStatus: score >= 80 ? 'READY' : 'PARTIAL',
      clientPayoutRef: payoutRef(batchId, index),
      amountMinor: amountRupees * 100,
      matchConfidence: 0.78 + (index % 5) * 0.04,
      governanceDecision: index % 7 === 0 ? 'Review' : 'Pass',
      attachmentDecision: settled ? 'Attached' : 'Pending attach',
      bankReference: settled ? `UTR${202606120000 + index}` : null,
      amountMatch: settled,
      valueDateCheck: index % 5 !== 3,
      settlementLeafPresent: settled,
      attachmentLeafPresent: true,
      requiredLeafCount: 9,
      contractId: 'ctr-payroll-inr-v3',
    })
  }

  const explicitBatch = batchIdFromPackId(packId)
  const batch =
    BATCHES.find((b) => b.id === explicitBatch) ??
    BATCHES.find((b) => batchPackId(b.id) === packId) ??
    batchMeta(explicitBatch)
  const batchId = batch?.id ?? explicitBatch
  const lineage = buildBatchLineageGraph(batchId)
  return packDetailFromLineage(packId, lineage, {
    mode: 'BATCH_PROOF',
    proofScore: 58,
    proofStatus: 'PARTIAL',
    matchConfidence: 0.81,
    governanceDecision: 'Pass',
    attachmentDecision: 'Batch sealed',
    bankReference: `BATCH-UTR-${String(batchId).slice(-8).toUpperCase()}`,
    amountMatch: true,
    valueDateCheck: true,
    settlementLeafPresent: false,
    attachmentLeafPresent: true,
    requiredLeafCount: 6,
    contractId: 'ctr-payroll-inr-v3',
  })
}

export function evidencePackVerify(packId) {
  const pack = evidencePackDetail(packId)
  const computed = pack.merkle_root
  return {
    status: 'VERIFIED',
    evidence_pack_id: packId,
    checked_at: new Date().toISOString(),
    stored_root: computed,
    computed_root: computed,
    explanation: 'Merkle root reproduced from batch lineage fixture.',
  }
}

/** Operational timeline for Evidence Pack Browser — UI hides timelines with < 2 events. */
export function evidencePackTimeline(packId) {
  const timestamp = '2026-07-20T12:45:00Z'
  const steps = [
    ['Payment instruction received from ERP', 'Payment instruction received from ERP'],
    ['File payload fingerprint securely recorded', 'File payload fingerprint securely recorded'],
    ['Structured payment intent schema verified', 'Structured payment intent schema verified'],
    ['Governance and compliance checks passed', 'Governance and compliance checks passed'],
    ['Bank settlement record received', 'Bank settlement record received'],
    ['Bank settlement file received via SFTP', 'Bank settlement file received via SFTP'],
    ['UTR reference auto-matched via reconciliation engine', 'UTR reference auto-matched via reconciliation engine'],
    ['Variance, valuation, and reconciliation completed', 'Variance, valuation, and reconciliation completed'],
    ['Immutable evidence pack successfully compiled', 'Immutable evidence pack successfully compiled'],
  ]
  return {
    evidence_pack_id: packId,
    intent_id: intentId(PRIMARY_BATCH, 0),
    timeline: steps.map(([event, node_id]) => ({ timestamp, event, node_id })),
  }
}

export function evidencePacksList(searchParams) {
  const batchId = searchParams.get('batch_id') || searchParams.get('client_batch_id')
  const intentIdParam = searchParams.get('intent_id')
  const intentsOnly = searchParams.get('intents_only') === '1'
  if (intentIdParam) {
    const piMatch = intentIdParam.match(/^(.*)-pi-(\d+)$/)
    const resolved = piMatch?.[1] ?? PRIMARY_BATCH
    if (!isBatchFullyReady(resolved)) return { packs: [], total: 0 }
    const index = piMatch ? Math.max(0, Number.parseInt(piMatch[2], 10) - 1) : 0
    const iid = intentId(resolved, index)
    return {
      packs: [
        packSummary(batchPackId(iid), {
          intentId: intentIdParam || iid,
          batchId: resolved,
          mode: 'INTELLIGENCE_ATTACH',
          ref: payoutRef(resolved, index),
          proofScore: 72,
          leafCount: 9,
          requiredLeafCount: 9,
        }),
      ],
      total: 1,
    }
  }
  const bid = batchId?.trim()
  if (bid && !isBatchFullyReady(bid)) return { packs: [], total: 0 }
  if (!bid && !hasAnyFullyReadyBatch()) return { packs: [], total: 0 }
  const knownBatch = bid && (BATCHES.some((b) => b.id === bid) || activeBatches().some((b) => b.id === bid))
  if (knownBatch || bid === EVIDENCE_BATCH || bid === PRIMARY_BATCH || (bid && isBatchFullyReady(bid))) {
    const resolved = bid ?? PRIMARY_BATCH
    const meta = batchMeta(resolved)
    const intentPacks = intentEvidencePacksForBatch(resolved)
    if (intentsOnly) {
      return { packs: intentPacks, total: intentPacks.length }
    }
    const pid = batchPackId(resolved)
    const packs = [
      packSummary(pid, {
        batchId: resolved,
        mode: 'BATCH_PROOF',
        ref: `BATCH-${resolved.slice(-10)}`,
        merkleRoot: merkleRootForBatch(resolved),
        proofScore: 58,
        proofStatus: 'PARTIAL',
        createdAt: `${meta.date}T09:00:00Z`,
        leafCount: 6,
        requiredLeafCount: 6,
      }),
      ...intentPacks,
    ]
    return { packs, total: packs.length }
  }
  return {
    packs: BATCHES.map((b) =>
      packSummary(batchPackId(b.id), {
        batchId: b.id,
        mode: 'BATCH_PROOF',
        ref: `REF-${b.date}`,
        leafCount: 6,
        requiredLeafCount: 6,
      }),
    ),
    total: BATCHES.length,
  }
}

export function lineageGraph(scope, id) {
  if (scope === 'batch') {
    const batchId = BATCHES.some((b) => b.id === id) ? id : EVIDENCE_BATCH
    return buildBatchLineageGraph(batchId)
  }
  if (isIntentEvidencePackId(id)) {
    const batchId = intentPackBatchId(id)
    return buildIntentLineageGraph(id, batchId, intentPackIndex(id))
  }
  const batchFromPack = BATCHES.find((b) => batchPackId(b.id) === id)
  if (batchFromPack) {
    return buildBatchLineageGraph(batchFromPack.id)
  }
  const root = `${id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}root`.padEnd(64, 'a').slice(0, 64)
  return {
    evidence_pack_id: id,
    tenant_id: TENANT_ID,
    intent_id: intentId(PRIMARY_BATCH, 0),
    merkle_root: root,
    nodes: [
      {
        id: `${id}-payment_file`,
        label: 'Original Payment File',
        node_type: 'SOURCE',
        leaf_hash: hashSuffix(root, '1111111111111111'),
        item_ref: payoutRef(PRIMARY_BATCH, 0),
        schema_version: 'v1',
      },
      {
        id: `${id}-canonical_intent`,
        label: 'Structured Payment Intent',
        node_type: 'TRANSFORM',
        leaf_hash: hashSuffix(root, '2222222222222222'),
        item_ref: intentId(PRIMARY_BATCH, 0),
        schema_version: 'v1',
      },
      {
        id: `${id}-match_decision`,
        label: 'Match Decision',
        node_type: 'DECISION',
        leaf_hash: hashSuffix(root, '3333333333333333'),
        item_ref: intentId(PRIMARY_BATCH, 0),
        schema_version: 'v1',
      },
      {
        id: 'merkle_root',
        label: 'Proof Root',
        node_type: 'SEAL',
        leaf_hash: root,
      },
    ],
    edges: [
      { from: `${id}-payment_file`, to: `${id}-canonical_intent`, label: 'canonicalise' },
      { from: `${id}-canonical_intent`, to: `${id}-match_decision`, label: 'match' },
      { from: `${id}-match_decision`, to: 'merkle_root', label: 'seal' },
    ],
  }
}

export function intentsListPage(page, pageSize, request) {
  const readyId = activeIntentBatches(request)[0]?.id
  if (!readyId) {
    return { items: [], pagination: { page, page_size: pageSize, total: 0 } }
  }
  const all = buildPaymentIntents(readyId, request).items
  const start = (page - 1) * pageSize
  const slice = all.slice(start, start + pageSize)
  return {
    items: slice,
    pagination: { page, page_size: pageSize, total: all.length },
  }
}

export function settlementObservationsRoute(url, request) {
  const clientBatchId = url.searchParams.get('client_batch_id')?.trim()
  if (!clientBatchId) {
    const page = parsePositiveInt(url.searchParams.get('page'), 1)
    const pageSize = Math.min(100, parsePositiveInt(url.searchParams.get('page_size'), 20))
    return buildSettlementBatchList(page, pageSize, request)
  }
  const page = parsePositiveInt(url.searchParams.get('page'), 1)
  const pageSize = Math.min(100, parsePositiveInt(url.searchParams.get('page_size'), 20))
  return buildSettlementObservations(clientBatchId, page, pageSize, request)
}

export function syncStatus() {
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    connectors: PROVIDERS.map((p) => ({
      connector_id: p,
      status: 'SYNCED',
      last_sync_at: new Date().toISOString(),
    })),
    systems: [],
  }
}

/**
 * POST /v1/bulk-ingest — intent CSV/file accept (console Create Payout / Batch Command Center).
 * Returns the shape expected by zord-console intakeHttpShared parsers.
 */
export function bulkIngestAck(request) {
  const headerBatch =
    request.headers.get('batch-id') ||
    request.headers.get('Batch-ID') ||
    request.headers.get('Batch-Id') ||
    request.headers.get('x-batch-id')
  const batchId = String(headerBatch || '').trim() || UPLOAD_DEMO_BATCH_ID
  markIntentUploaded(batchId, request)
  const total = 20
  const now = new Date().toISOString()
  const results = Array.from({ length: total }, (_, i) => ({
    row: i + 1,
    EnvelopeID: `env-${batchId}-${i + 1}`,
    Trace_id: `tr-${batchId}-${i + 1}`,
    Status: 'ACCEPTED',
    Received_At: now,
  }))
  return {
    batch_id: batchId,
    batchId,
    total,
    accepted: total,
    failed: 0,
    results,
    message: 'Bulk ingest accepted (smoke simulator) — Intent Journal unlocked for this batch',
  }
}

/**
 * POST /v1/settlement/upload — settlement CSV accept (console settlement intake).
 */
export function settlementUploadAck(url, request) {
  const batchId =
    url.searchParams.get('batch_id')?.trim() ||
    url.searchParams.get('client_batch_id')?.trim() ||
    request.headers.get('batch-id')?.trim() ||
    request.headers.get('Batch-Id')?.trim() ||
    UPLOAD_DEMO_BATCH_ID
  markSettlementUploaded(batchId, request)
  return {
    ok: true,
    status: 'ACCEPTED',
    batch_id: batchId,
    client_batch_id: batchId,
    tenant_id: url.searchParams.get('tenant_id') || TENANT_ID,
    psp: url.searchParams.get('psp') || 'razorpay',
    message: 'Settlement file accepted (smoke simulator) — batch data unlocked when obligation was also uploaded',
  }
}

export function notFound(path) {
  return { error: 'smoke_simulator_no_route', path, hint: 'Route not implemented in payout-smoke-simulator' }
}
