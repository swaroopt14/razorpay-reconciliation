/**
 * Demo Finance Controller catalogue for /v1/reconciliation/*.
 * Amounts are paise (Razorpay / outcome-engine minor units).
 */

const NOW = '2026-09-03T11:42:10Z'
const CONNECTOR = 'conn_smoke_razorpay'

function exception({
  id,
  entityType,
  entityId,
  result,
  reason,
  expected,
  observed,
  variance,
  confidence = 0.82,
  status = 'open',
}) {
  return {
    id,
    run_id: 'run_smoke_001',
    tenant_id: '',
    connector_id: CONNECTOR,
    entity_type: entityType,
    entity_id: entityId,
    status,
    reconciliation_result: result,
    reason,
    expected_amount: expected,
    observed_amount: observed,
    variance_amount: variance,
    candidate_ids: [],
    confidence,
    evidence_ids: [`ev_${entityId}`],
    evidence_refs: {},
    created_at: NOW,
    updated_at: NOW,
  }
}

export const SMOKE_EXCEPTIONS = [
  exception({
    id: 'ex_pay_123',
    entityType: 'payment',
    entityId: 'pay_123',
    result: 'UNRESOLVED',
    reason: 'failed_with_bank_movement',
    expected: 1_000_000,
    observed: 1_000_000,
    variance: 1_000_000,
    confidence: 0.82,
  }),
  exception({
    id: 'ex_set_456',
    entityType: 'settlement',
    entityId: 'set_456',
    result: 'VARIANCE',
    reason: 'amount_mismatch',
    expected: 3_000_000,
    observed: 2_750_000,
    variance: 2_500_000,
    confidence: 0.91,
  }),
  exception({
    id: 'ex_pay_utr',
    entityType: 'payment',
    entityId: 'pay_utr_001',
    result: 'CONFLICTED',
    reason: 'shared_utr_or_bank_candidates',
    expected: 200_000,
    observed: 200_000,
    variance: 200_000,
    confidence: 0.64,
  }),
  exception({
    id: 'ex_pay_124',
    entityType: 'payment',
    entityId: 'pay_124',
    result: 'UNRESOLVED',
    reason: 'captured_missing_settlement',
    expected: 50_000,
    observed: 0,
    variance: 50_000,
    confidence: 0.88,
  }),
  exception({
    id: 'ex_pay_opt',
    entityType: 'payment',
    entityId: 'pay_opt_001',
    result: 'UNRESOLVED',
    reason: 'optimizer_settlement_unobserved',
    expected: 20_000,
    observed: 0,
    variance: 20_000,
    confidence: 0.79,
  }),
  exception({
    id: 'ex_pay_amb',
    entityType: 'payment',
    entityId: 'pay_amb_001',
    result: 'AMBIGUOUS',
    reason: 'ambiguous_bank_candidates',
    expected: 15_000,
    observed: 15_000,
    variance: 15_000,
    confidence: 0.51,
  }),
  exception({
    id: 'ex_bank_orphan',
    entityType: 'bank',
    entityId: 'bnk_orphan_001',
    result: 'ORPHAN',
    reason: 'orphan_bank_credit',
    expected: 0,
    observed: 10_000,
    variance: 10_000,
    confidence: 0.7,
  }),
  exception({
    id: 'ex_pay_open',
    entityType: 'payment',
    entityId: 'pay_open_001',
    result: 'UNRESOLVED',
    reason: 'open_status_no_downstream',
    expected: 5_000,
    observed: 0,
    variance: 5_000,
    confidence: 0.6,
  }),
]

export const SMOKE_FINANCE_SUMMARY = {
  entity_counts: { payment: 96, payout: 3, bank: 1 },
  result_counts: {
    MATCHED: 94,
    AMBIGUOUS: 3,
    UNRESOLVED: 2,
    CONFLICTED: 1,
  },
  exposure_minor: 3_800_000,
  exposure_by_reason: [
    { reason: 'amount_mismatch', count: 1, exposure_minor: 2_500_000 },
    { reason: 'failed_with_bank_movement', count: 1, exposure_minor: 1_000_000 },
    { reason: 'shared_utr_or_bank_candidates', count: 1, exposure_minor: 200_000 },
    { reason: 'captured_missing_settlement', count: 1, exposure_minor: 50_000 },
    { reason: 'optimizer_settlement_unobserved', count: 1, exposure_minor: 20_000 },
    { reason: 'ambiguous_bank_candidates', count: 1, exposure_minor: 15_000 },
    { reason: 'orphan_bank_credit', count: 1, exposure_minor: 10_000 },
    { reason: 'open_status_no_downstream', count: 1, exposure_minor: 5_000 },
  ],
  currency: 'INR',
  scored_count: 100,
  matched_count: 94,
}

export const SMOKE_CASH_POSITION = {
  gross_captured_minor: 128_400_000,
  settlement_expected_net_minor: 128_400_000,
  bank_credited_proven_minor: 124_600_000,
  in_flight_minor: 11_200_000,
  unresolved_exposure_minor: 3_800_000,
  currency: 'INR',
  as_of: NOW,
}

const PAYMENTS = {
  pay_123: {
    status: 'failed',
    provider_status: 'failed',
    payment_id: 'pay_123',
    amount_minor: 1_000_000,
    currency: 'INR',
    captured: false,
    method: 'upi',
    order_id: 'order_smoke_123',
    provider: 'razorpay',
    provider_created_at: '2026-09-03T09:12:00Z',
    notes: { description: 'Collection for invoice INV-4412' },
    sources: ['razorpay_payment', 'bank_statement'],
    observations: [
      {
        source: 'razorpay_payment',
        provider_status: 'created',
        canonical_status: 'created',
        source_event_id: 'evt_pay_123_created',
        source_hash: 'sha256:pay123created',
        observed_at: '2026-09-03T09:12:00Z',
      },
      {
        source: 'razorpay_payment',
        provider_status: 'authorized',
        canonical_status: 'authorized',
        source_event_id: 'evt_pay_123_auth',
        source_hash: 'sha256:pay123auth',
        observed_at: '2026-09-03T09:12:04Z',
      },
      {
        source: 'razorpay_payment',
        provider_status: 'failed',
        canonical_status: 'failed',
        source_event_id: 'evt_pay_123_failed',
        source_hash: 'sha256:pay123failed',
        observed_at: '2026-09-03T09:12:11Z',
      },
      {
        source: 'bank_statement',
        provider_status: 'credited',
        canonical_status: 'bank_credited',
        source_event_id: 'bnk_pay_123',
        source_hash: 'sha256:bnkpay123',
        observed_at: '2026-09-03T10:04:00Z',
      },
    ],
    reconciliation: {
      result: 'UNRESOLVED',
      reason: 'failed_with_bank_movement',
      expected_amount: 1_000_000,
      observed_amount: 1_000_000,
      variance_amount: 1_000_000,
      confidence: 0.82,
      bank_credit_proven: true,
    },
    evidence_refs: {
      canonical_payment_id: 'pay_123',
      bank_observation_id: 'bnk_pay_123',
      payment_amount_minor: 1_000_000,
      bank_credit_minor: 1_000_000,
    },
    financial_movement: {
      payment: 1_000_000,
      settlement: null,
      bank: 1_000_000,
      refund: null,
    },
  },
  pay_124: {
    status: 'captured',
    provider_status: 'captured',
    payment_id: 'pay_124',
    amount_minor: 50_000,
    currency: 'INR',
    captured: true,
    method: 'card',
    order_id: 'order_smoke_124',
    provider: 'razorpay',
    provider_created_at: '2026-09-03T08:40:00Z',
    notes: {},
    sources: ['razorpay_payment'],
    observations: [
      {
        source: 'razorpay_payment',
        provider_status: 'captured',
        canonical_status: 'captured',
        source_event_id: 'evt_pay_124_cap',
        source_hash: 'sha256:pay124cap',
        observed_at: '2026-09-03T08:40:12Z',
      },
    ],
    reconciliation: {
      result: 'UNRESOLVED',
      reason: 'captured_missing_settlement',
      expected_amount: 50_000,
      observed_amount: 0,
      variance_amount: 50_000,
      confidence: 0.88,
      bank_credit_proven: false,
    },
    evidence_refs: { canonical_payment_id: 'pay_124', payment_amount_minor: 50_000 },
    financial_movement: {
      payment: 50_000,
      settlement: null,
      bank: null,
      refund: null,
    },
  },
  pay_opt_001: {
    status: 'captured',
    provider_status: 'captured',
    payment_id: 'pay_opt_001',
    amount_minor: 20_000,
    currency: 'INR',
    captured: true,
    method: 'billdesk_optimizer',
    order_id: 'order_opt_001',
    provider: 'razorpay',
    provider_created_at: '2026-09-01T11:00:00Z',
    notes: { processed_by: 'BillDesk Optimizer' },
    sources: ['razorpay_payment'],
    observations: [
      {
        source: 'razorpay_payment',
        provider_status: 'captured',
        canonical_status: 'captured',
        source_event_id: 'evt_opt_cap',
        source_hash: 'sha256:optcap',
        observed_at: '2026-09-01T11:00:08Z',
      },
    ],
    reconciliation: {
      result: 'UNRESOLVED',
      reason: 'optimizer_settlement_unobserved',
      expected_amount: 20_000,
      observed_amount: 0,
      variance_amount: 20_000,
      confidence: 0.79,
      bank_credit_proven: false,
    },
    evidence_refs: { canonical_payment_id: 'pay_opt_001' },
    financial_movement: {
      payment: 20_000,
      settlement: null,
      bank: null,
      refund: null,
    },
  },
  pay_utr_001: {
    status: 'captured',
    provider_status: 'captured',
    payment_id: 'pay_utr_001',
    amount_minor: 200_000,
    currency: 'INR',
    captured: true,
    method: 'netbanking',
    order_id: 'order_utr_001',
    provider: 'razorpay',
    provider_created_at: '2026-09-02T14:20:00Z',
    notes: {},
    sources: ['razorpay_payment', 'bank_statement'],
    observations: [
      {
        source: 'razorpay_payment',
        provider_status: 'captured',
        canonical_status: 'captured',
        source_event_id: 'evt_utr_cap',
        source_hash: 'sha256:utrcap',
        observed_at: '2026-09-02T14:20:09Z',
      },
    ],
    reconciliation: {
      result: 'CONFLICTED',
      reason: 'shared_utr_or_bank_candidates',
      expected_amount: 200_000,
      observed_amount: 200_000,
      variance_amount: 200_000,
      confidence: 0.64,
      bank_credit_proven: false,
    },
    evidence_refs: { canonical_payment_id: 'pay_utr_001' },
    financial_movement: {
      payment: 200_000,
      settlement: 200_000,
      bank: 200_000,
      refund: null,
    },
  },
  pay_amb_001: {
    status: 'captured',
    provider_status: 'captured',
    payment_id: 'pay_amb_001',
    amount_minor: 15_000,
    currency: 'INR',
    captured: true,
    method: 'upi',
    order_id: 'order_amb_001',
    provider: 'razorpay',
    provider_created_at: '2026-09-03T07:00:00Z',
    notes: {},
    sources: ['razorpay_payment'],
    observations: [],
    reconciliation: {
      result: 'AMBIGUOUS',
      reason: 'ambiguous_bank_candidates',
      expected_amount: 15_000,
      observed_amount: 15_000,
      variance_amount: 15_000,
      confidence: 0.51,
      bank_credit_proven: false,
    },
    evidence_refs: { canonical_payment_id: 'pay_amb_001' },
    financial_movement: {
      payment: 15_000,
      settlement: 15_000,
      bank: null,
      refund: null,
    },
  },
  pay_open_001: {
    status: 'authorized',
    provider_status: 'authorized',
    payment_id: 'pay_open_001',
    amount_minor: 5_000,
    currency: 'INR',
    captured: false,
    method: 'card',
    order_id: 'order_open_001',
    provider: 'razorpay',
    provider_created_at: '2026-08-30T10:00:00Z',
    notes: {},
    sources: ['razorpay_payment'],
    observations: [
      {
        source: 'razorpay_payment',
        provider_status: 'authorized',
        canonical_status: 'authorized',
        source_event_id: 'evt_open_auth',
        source_hash: 'sha256:openauth',
        observed_at: '2026-08-30T10:00:04Z',
      },
    ],
    reconciliation: {
      result: 'UNRESOLVED',
      reason: 'open_status_no_downstream',
      expected_amount: 5_000,
      observed_amount: 0,
      variance_amount: 5_000,
      confidence: 0.6,
      bank_credit_proven: false,
    },
    evidence_refs: { canonical_payment_id: 'pay_open_001' },
    financial_movement: {
      payment: 5_000,
      settlement: null,
      bank: null,
      refund: null,
    },
  },
  pay_matched_001: {
    status: 'captured',
    provider_status: 'captured',
    payment_id: 'pay_matched_001',
    amount_minor: 1_000_000,
    currency: 'INR',
    captured: true,
    method: 'upi',
    order_id: 'order_matched_001',
    provider: 'razorpay',
    provider_created_at: '2026-09-02T09:00:00Z',
    notes: {},
    sources: ['razorpay_payment', 'settlement', 'bank_statement'],
    observations: [
      {
        source: 'razorpay_payment',
        provider_status: 'captured',
        canonical_status: 'captured',
        source_event_id: 'evt_m_cap',
        source_hash: 'sha256:mcap',
        observed_at: '2026-09-02T09:00:06Z',
      },
    ],
    reconciliation: {
      result: 'MATCHED',
      reason: 'matched',
      expected_amount: 1_000_000,
      observed_amount: 1_000_000,
      variance_amount: 0,
      confidence: 0.99,
      bank_credit_proven: true,
    },
    evidence_refs: {
      canonical_payment_id: 'pay_matched_001',
      settlement_line_id: 'setl_matched_001',
      bank_observation_id: 'bnk_matched_001',
      payment_amount_minor: 1_000_000,
      settlement_net_minor: 984_000,
      bank_credit_minor: 984_000,
    },
    financial_movement: {
      payment: 1_000_000,
      settlement: 984_000,
      bank: 984_000,
      refund: null,
    },
  },
}

const REFUNDS = {
  pay_123: [],
}

const SETTLEMENTS = {
  pay_123: [],
  pay_utr_001: [
    {
      settlement_id: 'set_utr_001',
      payment_id: 'pay_utr_001',
      entity_id: 'pay_utr_001',
      line_type: 'payment',
      amount_minor: 200_000,
      fee_minor: 0,
      tax_minor: 0,
      on_hold: false,
      utr: 'UTR441199',
    },
  ],
  set_456: [
    {
      settlement_id: 'set_456',
      payment_id: 'pay_set_456',
      entity_id: 'set_456',
      line_type: 'payment',
      amount_minor: 3_000_000,
      fee_minor: 0,
      tax_minor: 0,
      on_hold: false,
      utr: 'UTR556677',
    },
  ],
}

const ROOT_CAUSE = {
  failed_with_bank_movement:
    'Payment failed at the PSP lifecycle level, but a corresponding bank movement was detected without a matching settlement/refund record.',
  captured_missing_settlement: 'Payment is captured but no settlement line is linked by payment_id.',
  amount_mismatch: 'A unique UTR matched a bank row whose amount differs from the settlement net.',
  shared_utr_or_bank_candidates: 'More than one plausible bank candidate exists. No match was forced.',
  optimizer_settlement_unobserved:
    'Combined recon will not contain this Optimizer-routed row. Upload the Dashboard Optimizer Single View report.',
  ambiguous_bank_candidates: 'More than one plausible bank candidate exists. No match was forced.',
  orphan_bank_credit: 'A bank CREDIT has no related settlement or payment.',
  open_status_no_downstream:
    'Payment remains in an open Razorpay status with no settlement or bank movement after the age window.',
}

const RECOMMENDATION = {
  failed_with_bank_movement:
    'Investigate the unmatched bank movement and provider-side transaction outcome. Do not rename the Razorpay status.',
  captured_missing_settlement: 'Wait for settlement recon or backfill settlement lines for this payment_id.',
  amount_mismatch: 'Do not force a match. Review fee/tax/adjustment and the bank amount.',
  shared_utr_or_bank_candidates: 'Finance should pick from the candidate IDs using additional evidence.',
  optimizer_settlement_unobserved: 'MONITOR. Do not chase bank UTR. Do not invent MATCHED.',
  ambiguous_bank_candidates: 'Finance should pick from the candidate IDs using additional evidence.',
  orphan_bank_credit: 'Keep the bank row and search for a missing settlement or payment.',
  open_status_no_downstream: 'Do not rename the Razorpay status. Check later events or backfill.',
}

export function listExceptions({ entityType, reason } = {}) {
  let out = SMOKE_EXCEPTIONS
  if (entityType) {
    out = out.filter((ex) => ex.entity_type === entityType)
  }
  if (reason) {
    out = out.filter((ex) => ex.reason === reason)
  }
  return { exceptions: out }
}

export function getException(id) {
  const ex = SMOKE_EXCEPTIONS.find((row) => row.id === id)
  if (!ex) return null
  return { data: ex }
}

export function getPayment(paymentId) {
  return PAYMENTS[paymentId] ?? null
}

export function listRefunds(paymentId) {
  const list = REFUNDS[paymentId] ?? []
  const out = {
    payment_id: paymentId,
    refunds: list,
    source: 'provider_refund_observations',
  }
  if (list.length === 0) out.error = 'not_found'
  return out
}

export function listSettlements(paymentId) {
  if (!paymentId) {
    return { settlements: Object.values(SETTLEMENTS).flat() }
  }
  return { settlements: SETTLEMENTS[paymentId] ?? [] }
}

export function getEvidence(paymentId) {
  const pay = PAYMENTS[paymentId]
  if (!pay) return null
  return {
    payment_id: paymentId,
    evidence_refs: pay.evidence_refs,
    evidence_ids: pay.evidence_refs ? Object.values(pay.evidence_refs).filter((v) => typeof v === 'string') : [],
  }
}

export function createInvestigation({ exception_id, entity_id, payment_id }) {
  const entityId = entity_id || payment_id
  const ex =
    SMOKE_EXCEPTIONS.find((row) => row.id === exception_id) ||
    SMOKE_EXCEPTIONS.find((row) => row.entity_id === entityId)
  if (!ex) return null
  const reason = ex.reason
  return {
    data: {
      id: `INV-${ex.entity_id.replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase() || '001'}`,
      exception_id: ex.id,
      entity_type: ex.entity_type,
      entity_id: ex.entity_id,
      status: 'completed',
      root_cause: ROOT_CAUSE[reason] || reason,
      recommendation: RECOMMENDATION[reason] || 'Review evidence_refs. Do not change the Razorpay status.',
      confidence: ex.confidence,
      financial_impact: ex.variance_amount,
      evidence_ids: ex.evidence_ids,
      hypotheses: hypothesesFor(reason),
      created_at: NOW,
      updated_at: NOW,
    },
  }
}

function hypothesesFor(reason) {
  if (reason === 'failed_with_bank_movement') {
    return [
      { claim: 'Payment settled', verdict: 'CONTRADICTED' },
      { claim: 'Payment refunded', verdict: 'CONTRADICTED' },
      { claim: 'Bank transaction unrelated', verdict: 'POSSIBLE' },
      { claim: 'Unexplained financial movement', verdict: 'SUPPORTED' },
    ]
  }
  if (reason === 'optimizer_settlement_unobserved') {
    return [
      { claim: 'Razorpay combined recon contains this payment', verdict: 'CONTRADICTED' },
      { claim: 'Optimizer Single View not uploaded', verdict: 'SUPPORTED' },
    ]
  }
  return [{ claim: 'Needs finance review', verdict: 'SUPPORTED' }]
}

export const SMOKE_RECON_RESULTS = [
  {
    payment_id: 'pay_001',
    settlement: true,
    bank: true,
    result: 'MATCHED',
    variance_amount: 0,
    reason: 'matched',
  },
  {
    payment_id: 'pay_002',
    settlement: true,
    bank: false,
    result: 'UNRESOLVED',
    variance_amount: 1_000_000,
    reason: 'captured_missing_settlement',
  },
  {
    payment_id: 'pay_003',
    settlement: true,
    bank: true,
    result: 'VARIANCE',
    variance_amount: 250_000,
    reason: 'amount_mismatch',
  },
  {
    payment_id: 'pay_004',
    settlement: null,
    bank: true,
    result: 'AMBIGUOUS',
    variance_amount: 0,
    reason: 'ambiguous_bank_candidates',
  },
  {
    payment_id: 'pay_123',
    settlement: false,
    bank: true,
    result: 'UNRESOLVED',
    variance_amount: 1_000_000,
    reason: 'failed_with_bank_movement',
  },
  {
    payment_id: 'set_456',
    settlement: true,
    bank: true,
    result: 'VARIANCE',
    variance_amount: 2_500_000,
    reason: 'amount_mismatch',
  },
  {
    payment_id: 'pay_utr_001',
    settlement: true,
    bank: true,
    result: 'CONFLICTED',
    variance_amount: 200_000,
    reason: 'shared_utr_or_bank_candidates',
  },
  {
    payment_id: 'pay_124',
    settlement: false,
    bank: false,
    result: 'UNRESOLVED',
    variance_amount: 50_000,
    reason: 'captured_missing_settlement',
  },
  {
    payment_id: 'pay_opt_001',
    settlement: false,
    bank: false,
    result: 'UNRESOLVED',
    variance_amount: 20_000,
    reason: 'optimizer_settlement_unobserved',
  },
  {
    payment_id: 'pay_amb_001',
    settlement: true,
    bank: null,
    result: 'AMBIGUOUS',
    variance_amount: 15_000,
    reason: 'ambiguous_bank_candidates',
  },
  {
    payment_id: 'bnk_orphan_001',
    settlement: false,
    bank: true,
    result: 'ORPHAN',
    variance_amount: 10_000,
    reason: 'orphan_bank_credit',
  },
  {
    payment_id: 'pay_matched_001',
    settlement: true,
    bank: true,
    result: 'MATCHED',
    variance_amount: 0,
    reason: 'matched',
  },
]

function issueLabel(reason) {
  const map = {
    failed_with_bank_movement: 'Money movement',
    amount_mismatch: 'Bank variance',
    shared_utr_or_bank_candidates: 'UTR conflict',
    captured_missing_settlement: 'Missing settlement',
    optimizer_settlement_unobserved: 'Optimizer unobserved',
    ambiguous_bank_candidates: 'Ambiguous',
    orphan_bank_credit: 'Orphan bank',
    open_status_no_downstream: 'Open status',
  }
  return map[reason] || reason
}

export function listInvestigations() {
  return {
    investigations: SMOKE_EXCEPTIONS.map((ex, index) => {
      const rec = createInvestigation({ exception_id: ex.id, entity_id: ex.entity_id })
      const unresolved = index >= 6
      return {
        ...rec.data,
        status: unresolved ? 'unresolved' : 'completed',
        issue: issueLabel(ex.reason),
      }
    }),
  }
}

export const SMOKE_EVALUATION = {
  dataset_records: 100,
  reconciliation_rate: 0.92,
  exception_detection_rate: 1,
  exception_resolution_rate: 0.75,
  false_resolution_rate: 0,
  financial_accuracy: 1,
  evidence_grounding: 0.996,
}

export function handleFinanceRequest(method, pathname, url, body) {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  // /v1/reconciliation/...
  if (parts[0] !== 'v1' || parts[1] !== 'reconciliation') return null

  const rest = parts.slice(2)
  const paymentId = url.searchParams.get('payment_id')?.trim() || ''
  const entityType = url.searchParams.get('entity_type')?.trim() || ''
  const reason = url.searchParams.get('reason')?.trim() || ''

  if (method === 'GET' && rest.length === 1 && rest[0] === 'summary') {
    return { status: 200, body: SMOKE_FINANCE_SUMMARY }
  }
  if (method === 'GET' && rest.length === 1 && rest[0] === 'cash-position') {
    return { status: 200, body: SMOKE_CASH_POSITION }
  }
  if (method === 'GET' && rest.length === 1 && rest[0] === 'results') {
    const filter = url.searchParams.get('result')?.trim().toUpperCase() || ''
    let rows = SMOKE_RECON_RESULTS
    if (filter && filter !== 'ALL') {
      rows = rows.filter((row) => row.result === filter)
    }
    return {
      status: 200,
      body: {
        records: 100,
        matched: SMOKE_FINANCE_SUMMARY.matched_count,
        exceptions: SMOKE_EXCEPTIONS.length,
        results: rows,
      },
    }
  }
  if (method === 'GET' && rest.length === 1 && rest[0] === 'investigations') {
    return { status: 200, body: listInvestigations() }
  }
  if (method === 'GET' && rest.length === 1 && rest[0] === 'evaluation') {
    return { status: 200, body: SMOKE_EVALUATION }
  }
  if (method === 'POST' && rest[0] === 'run') {
    return {
      status: 200,
      body: {
        run_id: 'run_smoke_001',
        status: 'completed',
        payment_count: 100,
        matched_count: 94,
        exception_count: 8,
      },
    }
  }
  if (method === 'GET' && rest.length === 1 && rest[0] === 'exceptions') {
    return { status: 200, body: listExceptions({ entityType, reason }) }
  }
  if (method === 'GET' && rest[0] === 'exceptions' && rest[1]) {
    const found = getException(rest[1])
    if (!found) return { status: 404, body: { error: 'not_found' } }
    return { status: 200, body: found }
  }
  if (method === 'GET' && rest[0] === 'payments' && rest[1] && rest[2] === 'evidence') {
    const found = getEvidence(rest[1])
    if (!found) return { status: 404, body: { error: 'not_found' } }
    return { status: 200, body: found }
  }
  if (method === 'GET' && rest[0] === 'payments' && rest[1]) {
    const found = getPayment(rest[1])
    if (!found) return { status: 404, body: { error: 'not_found' } }
    return { status: 200, body: found }
  }
  if (method === 'GET' && rest[0] === 'refunds') {
    return { status: 200, body: listRefunds(paymentId) }
  }
  if (method === 'GET' && rest[0] === 'settlements') {
    return { status: 200, body: listSettlements(paymentId) }
  }
  if (method === 'POST' && rest[0] === 'investigations') {
    const rec = createInvestigation(body || {})
    if (!rec) return { status: 404, body: { error: 'not_found' } }
    return { status: 200, body: rec }
  }
  if (method === 'GET' && rest[0] === 'investigations' && rest[1]) {
    const rec = createInvestigation({ exception_id: '', entity_id: rest[1] })
    if (!rec) return { status: 404, body: { error: 'not_found' } }
    return { status: 200, body: rec }
  }

  return { status: 404, body: { error: 'not_found', path: pathname } }
}
