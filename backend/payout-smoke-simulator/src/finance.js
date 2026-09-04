/**
 * Demo Finance Controller catalogue for /v1/reconciliation/*.
 * Amounts are paise (Razorpay / outcome-engine minor units).
 */

import {
  DEMO_PAYOUT_AMOUNTS_INR,
  demoPayeeLabel,
  demoPayoutRef,
} from './demoBatchInr.js'

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
  providerStatus = '',
}) {
  return {
    id,
    run_id: 'run_smoke_001',
    tenant_id: '',
    connector_id: CONNECTOR,
    entity_type: entityType,
    entity_id: entityId,
    status,
    provider_status: providerStatus || undefined,
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
    providerStatus: 'failed',
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
    providerStatus: 'processed',
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
    providerStatus: 'processed',
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
    providerStatus: 'captured',
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
    providerStatus: 'captured',
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
    providerStatus: 'captured',
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
    providerStatus: '',
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
    providerStatus: 'pending',
  }),
  exception({
    id: 'ex_pout_fail_002',
    entityType: 'payout',
    entityId: 'pout_fail_002',
    result: 'UNRESOLVED',
    reason: 'failed_with_bank_movement',
    expected: 2_500_000,
    observed: 2_500_000,
    variance: 2_500_000,
    confidence: 0.9,
    providerStatus: 'failed',
  }),
  exception({
    id: 'ex_pout_gap_010',
    entityType: 'payout',
    entityId: 'pout_gap_010',
    result: 'UNRESOLVED',
    reason: 'payout_missing_bank',
    expected: 8_500_000,
    observed: 0,
    variance: 8_500_000,
    confidence: 0.88,
    providerStatus: 'processed',
  }),
  exception({
    id: 'ex_pout_var_011',
    entityType: 'payout',
    entityId: 'pout_var_011',
    result: 'VARIANCE',
    reason: 'amount_mismatch',
    expected: 5_000_000,
    observed: 4_950_000,
    variance: 50_000,
    confidence: 0.93,
    providerStatus: 'processed',
  }),
]

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
  if (PAYMENTS[paymentId]) return PAYMENTS[paymentId]
  const row = SMOKE_RECON_RESULTS.find((r) => r.payout_id === paymentId || r.payment_id === paymentId)
  if (!row) return null
  const created = new Date((row.created_at || 1717977678) * 1000).toISOString()
  const observations = [
    {
      source: 'razorpay_payout',
      provider_status: 'pending',
      canonical_status: 'created',
      source_event_id: `evt_${row.payout_id}_created`,
      source_hash: `sha256:${row.payout_id}created`,
      observed_at: created,
    },
    {
      source: 'razorpay_payout',
      provider_status: row.status,
      canonical_status: row.status,
      source_event_id: `evt_${row.payout_id}_${row.status}`,
      source_hash: `sha256:${row.payout_id}${row.status}`,
      observed_at: created,
    },
  ]
  if (row.bank) {
    observations.push({
      source: 'bank_statement',
      provider_status: row.status,
      canonical_status: row.status === 'reversed' ? 'reversed' : 'credited',
      source_event_id: `bnk_${row.payout_id}`,
      source_hash: `sha256:bnk${row.payout_id}`,
      observed_at: created,
    })
  }
  return {
    status: row.status,
    provider_status: row.status,
    payment_id: row.payout_id || row.payment_id,
    amount_minor: row.amount_minor,
    currency: row.currency || 'INR',
    captured: row.status === 'processed',
    method: (row.mode || 'NEFT').toLowerCase(),
    order_id: row.reference_id,
    provider: row.payment_provider || 'razorpay',
    provider_created_at: created,
    notes: row.notes || {},
    sources: row.bank ? ['razorpay_payout', 'bank_statement'] : ['razorpay_payout'],
    observations,
    reconciliation: {
      result: row.result,
      reason: row.reason,
      expected_amount: row.amount_minor,
      observed_amount: row.bank ? row.amount_minor : 0,
      variance_amount: row.variance_amount,
      confidence: row.result === 'MATCHED' ? 0.98 : 0.72,
      bank_credit_proven: row.bank === true,
    },
    financial_movement: {
      payment: row.amount_minor,
      settlement: row.settlement ? row.amount_minor : null,
      bank: row.bank ? row.amount_minor : null,
      refund: row.status === 'reversed' ? row.amount_minor : null,
    },
  }
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
  if (ex) {
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
  const row = SMOKE_RECON_RESULTS.find((r) => r.payout_id === entityId || r.payment_id === entityId)
  if (!row) return null
  const matched = row.result === 'MATCHED'
  return {
    data: {
      id: `INV-${String(row.payout_id).replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase()}`,
      exception_id: null,
      entity_type: 'payout',
      entity_id: row.payout_id,
      status: 'completed',
      root_cause: matched
        ? `Provider status ${row.status} is financially accounted. Reconciliation MATCHED.`
        : `${row.error_description || row.reason}. Provider status stays ${row.status}.`,
      recommendation: row.next_steps && row.next_steps !== 'NA'
        ? row.next_steps
        : 'Do not rename the Razorpay payout status. Use reconciliation + bank evidence.',
      confidence: matched ? 0.97 : 0.78,
      financial_impact: row.variance_amount || 0,
      evidence_ids: [`ev_${row.payout_id}`],
      hypotheses: hypothesesFor(row.reason),
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

const RECON_STATUS_BLUEPRINT = [
  ...Array.from({ length: 70 }, () => ({
    status: 'processed',
    reason: 'payout_processed',
    source: 'beneficiary_bank',
    description: 'Payout is processed and the money has been credited into the beneficiary’s account.',
    next_steps: 'NA',
    result: 'MATCHED',
    settlement: true,
    bank: true,
  })),
  { status: 'failed', reason: 'bank_account_closed', source: 'beneficiary_bank', description: 'Payout failed as the beneficiary account is closed. Please contact the beneficiary bank.', next_steps: 'NA', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'bank_account_frozen', source: 'beneficiary_bank', description: 'Payout failed as beneficiary account is frozen. Please contact the beneficiary bank.', next_steps: 'NA', result: 'UNRESOLVED', settlement: false, bank: true, exception_type: 'FAILED_WITH_MONEY_MOVEMENT' },
  { status: 'failed', reason: 'imps_not_allowed', source: 'beneficiary_bank', description: 'IMPS is not enabled on beneficiary account. Please retry with different mode.', next_steps: 'Retry with a different payment mode.', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'invalid_ifsc_code', source: 'beneficiary_bank', description: 'Payout failed as the IFSC code is invalid. Please correct the IFSC code and retry.', next_steps: 'Retry with correct IFSC code.', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'beneficiary_bank_rejected', source: 'beneficiary_bank', description: 'Payout rejected by the beneficiary bank. Please contact the beneficiary bank.', next_steps: 'NA', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'insufficient_funds', source: 'business', description: 'Payout failed due to insufficient funds in your account.', next_steps: 'Add funds to your account and retry.', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'beneficiary_vpa_invalid', source: 'business', description: 'UPI validation failed. If the UPI ID is valid, please retry after sometime.', next_steps: 'Ensure UPI ID is valid and retry.', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'gateway_timeout', source: 'gateway', description: 'Payout timed out at the partner bank. Please retry after 30 min.', next_steps: 'Retry', result: 'UNRESOLVED', settlement: false, bank: true, exception_type: 'FAILED_WITH_MONEY_MOVEMENT' },
  { status: 'failed', reason: 'gateway_down', source: 'gateway', description: 'Payout failed as the partner bank is facing technical issues. Please retry.', next_steps: 'Retry', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'server_error_temporary', source: 'internal', description: 'Payout failed due to temporary technical issue. Please retry.', next_steps: 'Retry', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'reversed', reason: 'beneficiary_bank_rejected', source: 'beneficiary_bank', description: 'Payout rejected by the beneficiary bank. Please contact the beneficiary bank.', next_steps: 'NA', result: 'MATCHED', settlement: true, bank: true, exception_type: null },
  { status: 'reversed', reason: 'beneficiary_bank_failure', source: 'beneficiary_bank', description: 'Payout failed at the beneficiary bank due to a technical issue. Please retry after 30 min.', next_steps: 'Retry', result: 'MATCHED', settlement: true, bank: true, exception_type: null },
  { status: 'failed', reason: 'transaction_limit_exceeded', source: 'beneficiary_bank', description: 'Payout amount greater than the limit supported by the beneficiary account.', next_steps: 'NA', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'amount_limit_exhausted_neft', source: 'business', description: 'The NEFT 24*7 limits for your account has been exhausted. Please retry after sometime.', next_steps: 'Retry', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'npci_beneficiary_timeout', source: 'beneficiary_bank', description: 'Temporary technical issue between NPCI and the beneficiary bank. Please retry after 30 min.', next_steps: 'Retry', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'beneficiary_account_invalid', source: 'business', description: 'Payout failed due to invalid beneficiary account number.', next_steps: 'NA', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'failed', reason: 'gateway_technical_error', source: 'gateway', description: 'Payout failed due to a temporary technical issue at the partner bank. Please retry after 30 min.', next_steps: 'Retry', result: 'VARIANCE', settlement: true, bank: true, exception_type: 'AMOUNT_MISMATCH' },
  { status: 'failed', reason: 'bank_account_invalid', source: 'beneficiary_bank', description: 'Payout failed due to invalid beneficiary account details.', next_steps: 'NA', result: 'MATCHED', settlement: false, bank: false, exception_type: null },
  { status: 'processing', reason: 'payout_bank_processing', source: 'gateway', description: 'Payout is being processed by the partner bank. Please check the final status after (date,time).', next_steps: 'Inform the customer of the delay, reason for the same and by when it will be cleared.', result: 'AMBIGUOUS', settlement: null, bank: false, exception_type: 'SLA_EXCEEDED' },
  { status: 'processing', reason: 'partner_bank_pending', source: 'internal', description: 'Payout is being processed by our partner bank. Please check the final status after (date,time).', next_steps: 'Inform the customer of the delay, reason for the same and by when it will be cleared.', result: 'AMBIGUOUS', settlement: null, bank: false, exception_type: 'SLA_EXCEEDED' },
  { status: 'processing', reason: 'beneficiary_bank_confirmation_pending', source: 'beneficiary_bank', description: 'Confirmation of credit to the beneficiary is pending from beneficiary_bank. Please check the status after (date,time).', next_steps: 'Inform the customer of the delay, reason for the same and by when it will be cleared.', result: 'AMBIGUOUS', settlement: true, bank: null, exception_type: 'SLA_EXCEEDED' },
  { status: 'processing', reason: 'bank_window_closed', source: 'gateway', description: 'The mode window for the day is closed. Please check the status after (date,time).', next_steps: 'Inform the customer of the delay, reason for the same and by when it will be cleared.', result: 'UNRESOLVED', settlement: false, bank: false, exception_type: 'SLA_EXCEEDED' },
  { status: 'processing', reason: 'amount_limit_exhausted', source: 'business', description: 'The (mode) 24*7 limits for your account has been exhausted. Please check the status after (date,time).', next_steps: 'Inform the customer of the delay, reason for the same and by when it will be cleared.', result: 'UNRESOLVED', settlement: false, bank: false, exception_type: 'SLA_EXCEEDED' },
  { status: 'pending', reason: 'pending_approval', source: 'business', description: 'Workflow for the payout is pending approval from the approver(s).', next_steps: 'NA', result: 'UNRESOLVED', settlement: false, bank: false, exception_type: 'PENDING_APPROVAL' },
  { status: 'pending', reason: 'pending_approval', source: 'business', description: 'Workflow for the payout is pending approval from the approver(s).', next_steps: 'NA', result: 'UNRESOLVED', settlement: false, bank: false, exception_type: 'PENDING_APPROVAL' },
  { status: 'pending', reason: 'pending_approval', source: 'business', description: 'Workflow for the payout is pending approval from the approver(s).', next_steps: 'NA', result: 'UNRESOLVED', settlement: false, bank: false, exception_type: 'PENDING_APPROVAL' },
  { status: 'pending', reason: 'pending_approval', source: 'business', description: 'Workflow for the payout is pending approval from the approver(s).', next_steps: 'NA', result: 'UNRESOLVED', settlement: false, bank: false, exception_type: 'PENDING_APPROVAL' },
  { status: 'queued', reason: 'low_balance', source: 'business', description: 'Payout is queued as there is insufficient balance in your account to process the payout.', next_steps: 'NA', result: 'UNRESOLVED', settlement: false, bank: false, exception_type: 'INSUFFICIENT_BALANCE' },
  { status: 'queued', reason: 'gateway_degraded', source: 'gateway', description: 'Payout is queued as Partner bank systems are down.', next_steps: 'NA', result: 'CONFLICTED', settlement: true, bank: true, exception_type: 'GATEWAY_DEGRADED' },
  { status: 'queued', reason: 'syncing_balance', source: 'gateway', description: 'Payout is queued as your balance is being synced with the bank. Please check the status after some time.', next_steps: 'Check status after some time.', result: 'UNRESOLVED', settlement: false, bank: false, exception_type: 'INSUFFICIENT_BALANCE' },
]

function buildSmokeReconResults() {
  const modes = ['IMPS', 'NEFT', 'RTGS', 'UPI']
  const purposes = ['payout', 'salary', 'refund', 'vendor_payout']
  return DEMO_PAYOUT_AMOUNTS_INR.map((rupees, i) => {
    const bp = RECON_STATUS_BLUEPRINT[i % RECON_STATUS_BLUEPRINT.length]
    const amountMinor = Math.round(Number(rupees) * 100)
    const payoutId = `pout_${String(i + 1).padStart(14, '0')}`
    const fa = `fa_${String(i + 1).padStart(14, '0')}`
    const utr =
      bp.status === 'processed' || bp.status === 'reversed' || bp.status === 'processing'
        ? `UTR${String(88000000 + i)}`
        : null
    const variance =
      bp.result === 'MATCHED' ? 0 : bp.result === 'AMBIGUOUS' ? Math.round(amountMinor * 0.02) : bp.result === 'VARIANCE' ? 50_000 : amountMinor
    return {
      payment_id: payoutId,
      payout_id: payoutId,
      entity: 'payout',
      fund_account_id: fa,
      amount_minor: amountMinor,
      currency: 'INR',
      fees: bp.status === 'processed' ? Math.round(amountMinor * 0.002) : 0,
      tax: bp.status === 'processed' ? Math.round(amountMinor * 0.00036) : 0,
      status: bp.status,
      utr,
      mode: modes[i % modes.length],
      purpose: purposes[i % purposes.length],
      reference_id: demoPayoutRef(i),
      narration: `${demoPayeeLabel(i)} fund transfer`,
      batch_id: 'batch-001',
      created_at: 1545383037 + i * 47,
      notes: { batch: 'batch-001', row: String(i + 1) },
      payment_provider: ['razorpay', 'paytm', 'phonepe', 'cashfree', 'payu'][i % 5],
      status_details: {
        description: bp.description,
        source: bp.source,
        reason: bp.reason,
      },
      settlement: bp.settlement,
      bank: bp.bank,
      result: bp.result,
      variance_amount: variance,
      reason: bp.reason,
      exception_type: bp.exception_type ?? null,
      contact: `${demoPayeeLabel(i)} · ${fa}`,
      error_code: bp.reason,
      error_description: bp.description,
      signal_source: bp.source,
      evidence: `${bp.description} · source: ${bp.source}`,
      next_steps: bp.next_steps,
    }
  })
}

const LIFECYCLE_SCENARIOS = [
  { index: 5, id: 'pout_proc_004', rupees: 50_000, status: 'processed', result: 'MATCHED', bank: true, settlement: true, reason: 'payout_processed', source: 'beneficiary_bank', description: 'Payout is processed and the money has been credited into the beneficiary’s account.', mode: 'NEFT', exception_type: null },
  { index: 8, id: 'pout_queue_007', rupees: 30_000, status: 'processed', result: 'MATCHED', bank: true, settlement: true, reason: 'payout_processed', source: 'beneficiary_bank', description: 'Queued, then processed after funds were available.', mode: 'NEFT', exception_type: null },
  { index: 10, id: 'pout_gap_010', rupees: 85_000, status: 'processed', result: 'UNRESOLVED', bank: false, settlement: true, reason: 'payout_missing_bank', source: 'internal', description: 'Provider processed. Bank credit not observed.', mode: 'NEFT', exception_type: 'MISSING_BANK_CREDIT' },
  { index: 11, id: 'pout_var_011', rupees: 50_000, status: 'processed', result: 'VARIANCE', bank: true, settlement: true, reason: 'gateway_technical_error', source: 'gateway', description: 'Processed at ₹50,000. Bank received ₹49,500.', mode: 'NEFT', exception_type: 'AMOUNT_MISMATCH', variance: 50_000 },
  { index: 70, id: 'pout_fail_001', rupees: 10_000, status: 'failed', result: 'MATCHED', bank: false, settlement: false, reason: 'bank_account_closed', source: 'beneficiary_bank', description: 'Failed payout, no money movement.', mode: 'NEFT', exception_type: null },
  { index: 71, id: 'pout_fail_002', rupees: 25_000, status: 'failed', result: 'UNRESOLVED', bank: true, settlement: false, reason: 'bank_account_frozen', source: 'beneficiary_bank', description: 'Failed with source debit. Reversal not observed.', mode: 'IMPS', exception_type: 'FAILED_WITH_MONEY_MOVEMENT' },
  { index: 80, id: 'pout_rev_003', rupees: 15_000, status: 'reversed', result: 'MATCHED', bank: true, settlement: true, reason: 'beneficiary_bank_rejected', source: 'beneficiary_bank', description: 'Failed, then reversed. Amount credited back.', mode: 'IMPS', exception_type: null },
  { index: 81, id: 'pout_rev_005', rupees: 75_000, status: 'reversed', result: 'MATCHED', bank: true, settlement: true, reason: 'beneficiary_bank_failure', source: 'beneficiary_bank', description: 'Processing reversed after beneficiary bank failure.', mode: 'IMPS', exception_type: null },
  { index: 75, id: 'pout_fail_006', rupees: 100_000, status: 'failed', result: 'MATCHED', bank: false, settlement: false, reason: 'insufficient_funds', source: 'business', description: 'Scheduled payout failed due to insufficient balance.', mode: 'NEFT', exception_type: null },
  { index: 97, id: 'pout_cancel_008', rupees: 12_000, status: 'cancelled', result: 'MATCHED', bank: false, settlement: false, reason: 'low_balance', source: 'business', description: 'Queued payout cancelled. No money movement.', mode: 'IMPS', exception_type: null },
  { index: 93, id: 'pout_reject_009', rupees: 40_000, status: 'rejected', result: 'MATCHED', bank: false, settlement: false, reason: 'pending_approval', source: 'business', description: 'Pending payout rejected by approver.', mode: 'NEFT', exception_type: null },
  { index: 82, id: 'pout_fail_012', rupees: 100_000, status: 'reversed', result: 'MATCHED', bank: true, settlement: true, reason: 'beneficiary_bank_failure', source: 'beneficiary_bank', description: 'Failed with debit, later reversed and reconciled.', mode: 'IMPS', exception_type: null },
]

function applyLifecycleScenarios(rows) {
  for (const sc of LIFECYCLE_SCENARIOS) {
    const row = rows[sc.index]
    if (!row) continue
    const amountMinor = Math.round(sc.rupees * 100)
    row.payment_id = sc.id
    row.payout_id = sc.id
    row.amount_minor = amountMinor
    row.status = sc.status
    row.result = sc.result
    row.bank = sc.bank
    row.settlement = sc.settlement
    row.reason = sc.reason
    row.error_code = sc.reason
    row.exception_type = sc.exception_type
    row.mode = sc.mode
    row.utr = sc.status === 'processed' || sc.status === 'reversed' || sc.status === 'processing' ? `HDFC-UTR-${String(8800000000 + sc.index).slice(-10)}` : null
    row.variance_amount = sc.variance ?? (sc.result === 'MATCHED' ? 0 : amountMinor)
    row.status_details = {
      description: sc.description,
      source: sc.source,
      reason: sc.reason,
    }
    row.error_description = sc.description
    row.signal_source = sc.source
    row.evidence = `${sc.description} · source: ${sc.source}`
    row.notes = { ...(row.notes || {}), scenario: sc.id }
  }
  return rows
}

export const SMOKE_RECON_RESULTS = applyLifecycleScenarios(buildSmokeReconResults())

function payoutBucket(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'processed') return 'processed'
  if (s === 'pending' || s === 'queued' || s === 'processing' || s === 'scheduled') return 'review'
  return 'failed'
}

function deriveDemoPayoutKpis(rows) {
  const kpis = {
    scored_count: rows.length,
    processed_count: 0,
    processed_amount_minor: 0,
    review_count: 0,
    review_amount_minor: 0,
    failed_count: 0,
    failed_amount_minor: 0,
    total_amount_minor: 0,
    matched_count: 0,
    exposure_minor: 0,
    result_counts: {},
    exposure_by_reason: [],
  }
  const reasonMap = new Map()
  for (const row of rows) {
    const amt = Number(row.amount_minor) || 0
    kpis.total_amount_minor += amt
    const bucket = payoutBucket(row.status)
    if (bucket === 'processed') {
      kpis.processed_count += 1
      kpis.processed_amount_minor += amt
    } else if (bucket === 'review') {
      kpis.review_count += 1
      kpis.review_amount_minor += amt
    } else {
      kpis.failed_count += 1
      kpis.failed_amount_minor += amt
    }
    const result = String(row.result || 'UNRESOLVED')
    kpis.result_counts[result] = (kpis.result_counts[result] || 0) + 1
    if (result === 'MATCHED') kpis.matched_count += 1
    else {
      const variance = Number(row.variance_amount) || amt
      kpis.exposure_minor += variance
      const reason = row.reason || 'unknown'
      const rec = reasonMap.get(reason) || { reason, count: 0, exposure_minor: 0 }
      rec.count += 1
      rec.exposure_minor += variance
      reasonMap.set(reason, rec)
    }
  }
  kpis.exposure_by_reason = [...reasonMap.values()]
  return kpis
}

export const DEMO_PAYOUT_KPIS = deriveDemoPayoutKpis(SMOKE_RECON_RESULTS)

export const SMOKE_FINANCE_SUMMARY = {
  entity_counts: { payment: 0, payout: DEMO_PAYOUT_KPIS.scored_count, bank: 12 },
  result_counts: DEMO_PAYOUT_KPIS.result_counts,
  exposure_minor: DEMO_PAYOUT_KPIS.failed_amount_minor + DEMO_PAYOUT_KPIS.review_amount_minor,
  exposure_by_reason: DEMO_PAYOUT_KPIS.exposure_by_reason,
  currency: 'INR',
  scored_count: DEMO_PAYOUT_KPIS.scored_count,
  matched_count: DEMO_PAYOUT_KPIS.processed_count,
  payout_kpis: {
    scored_count: DEMO_PAYOUT_KPIS.scored_count,
    processed_count: DEMO_PAYOUT_KPIS.processed_count,
    processed_amount_minor: DEMO_PAYOUT_KPIS.processed_amount_minor,
    review_count: DEMO_PAYOUT_KPIS.review_count,
    review_amount_minor: DEMO_PAYOUT_KPIS.review_amount_minor,
    failed_count: DEMO_PAYOUT_KPIS.failed_count,
    failed_amount_minor: DEMO_PAYOUT_KPIS.failed_amount_minor,
    total_amount_minor: DEMO_PAYOUT_KPIS.total_amount_minor,
  },
}

export const SMOKE_CASH_POSITION = {
  gross_captured_minor: DEMO_PAYOUT_KPIS.total_amount_minor,
  settlement_expected_net_minor: DEMO_PAYOUT_KPIS.processed_amount_minor,
  bank_credited_proven_minor: DEMO_PAYOUT_KPIS.processed_amount_minor,
  in_flight_minor: DEMO_PAYOUT_KPIS.review_amount_minor,
  unresolved_exposure_minor: DEMO_PAYOUT_KPIS.failed_amount_minor + DEMO_PAYOUT_KPIS.review_amount_minor,
  currency: 'INR',
  as_of: NOW,
}

/** Razorpay-style settlement headers + combined recon lines (demo).
 *  Fewer settlement cycles (batch-first UX). Each line carries recon result
 *  so Settlements detail tabs Match / Unresolved / Failed stay aligned with the payout book.
 */
function buildSmokeSettlements() {
  const processed = SMOKE_RECON_RESULTS.filter((r) => r.status === 'processed')
  const review = SMOKE_RECON_RESULTS.filter((r) =>
    ['pending', 'queued', 'processing', 'scheduled'].includes(String(r.status || '').toLowerCase()),
  )
  const failed = SMOKE_RECON_RESULTS.filter((r) =>
    ['failed', 'reversed', 'cancelled', 'rejected'].includes(String(r.status || '').toLowerCase()),
  )

  const chunks = [
    { id: 'setl_00000000000001', status: 'processed', slice: processed.slice(0, 35), dayOffset: -2, label: 'Batch 001 · T+2 settled' },
    { id: 'setl_00000000000002', status: 'processed', slice: processed.slice(35, 70), dayOffset: -1, label: 'Batch 001 · T+1 settled' },
    { id: 'setl_00000000000003', status: 'created', slice: review.slice(0, Math.max(review.length, 1)), dayOffset: 0, label: 'Batch 001 · awaiting bank' },
    { id: 'setl_00000000000004', status: 'failed', slice: failed.slice(0, Math.max(failed.length, 1)), dayOffset: -1, label: 'Batch 001 · failed cycle' },
  ]

  const baseTs = Math.floor(Date.parse(NOW) / 1000)
  const settlements = []
  const reconBySettlement = new Map()

  for (const chunk of chunks) {
    const lines = []
    let gross = 0
    let fees = 0
    let tax = 0
    let matched = 0
    let unresolved = 0
    let failedLines = 0
    for (let i = 0; i < chunk.slice.length; i += 1) {
      const row = chunk.slice[i]
      const amount = Number(row.amount_minor) || 0
      const fee = Number(row.fees) || Math.round(amount * 0.002)
      const taxAmt = Number(row.tax) || Math.round(amount * 0.00036)
      gross += amount
      fees += fee
      tax += taxAmt
      const result = String(row.result || 'UNRESOLVED').toUpperCase()
      const providerStatus = String(row.status || 'pending').toLowerCase()
      /** Same spine as DEMO_PAYOUT_KPIS / payoutBucket — Match · Not resolved · Failed. */
      const bucket = payoutBucket(providerStatus)
      if (bucket === 'processed') matched += 1
      else if (bucket === 'review') unresolved += 1
      else failedLines += 1
      const createdAt = (row.created_at || baseTs) - 3600
      const settledAt = chunk.status === 'processed' ? baseTs + chunk.dayOffset * 86400 : null
      lines.push({
        entity_id: row.payout_id || row.payment_id,
        type: i % 11 === 0 ? 'refund' : i % 17 === 0 ? 'transfer' : 'payment',
        debit: i % 11 === 0 ? amount : 0,
        credit: i % 11 === 0 ? 0 : amount,
        amount,
        fee: fee,
        tax: taxAmt,
        on_hold: chunk.status === 'created' || chunk.status === 'initiated',
        settled: chunk.status === 'processed' && bucket === 'processed',
        created_at: createdAt,
        settled_at: settledAt,
        settlement_id: chunk.id,
        settlement_utr: chunk.status === 'processed' ? `SETLUTR${String(100000 + settlements.length)}` : null,
        payment_id: row.payout_id || row.payment_id,
        order_id: `order_${String(i + 1).padStart(10, '0')}`,
        method: (row.mode || 'NEFT').toLowerCase(),
        card_network: null,
        card_issuer: null,
        card_type: null,
        dispute_id: null,
        description: row.narration || row.error_description || row.reason || 'Settlement line',
        notes: row.notes || {},
        currency: 'INR',
        /** Finance-control fields (not Razorpay settlement status). */
        provider_status: providerStatus,
        reconciliation_result: result,
        reason: row.reason || null,
        variance_amount: Number(row.variance_amount) || 0,
        utr: row.utr || null,
        finance_bucket: bucket === 'processed' ? 'matched' : bucket === 'review' ? 'unresolved' : 'failed',
      })
    }
    const createdAt = baseTs + chunk.dayOffset * 86400 - 7200
    const utr = chunk.status === 'processed' ? `SETLUTR${String(100000 + settlements.length)}` : null
    const net = Math.max(0, gross - fees - tax)
    settlements.push({
      id: chunk.id,
      entity: 'settlement',
      amount: net,
      amount_gross: gross,
      fees,
      tax,
      status: chunk.status,
      utr,
      created_at: createdAt,
      currency: 'INR',
      settlement_schedule: 'Domestic - After 2 days',
      items_count: lines.length,
      batch_label: chunk.label,
      matched_count: matched,
      unresolved_count: unresolved,
      failed_count: failedLines,
    })
    reconBySettlement.set(chunk.id, lines)
  }

  return { settlements, reconBySettlement }
}

const SMOKE_SETTLEMENT_PACK = buildSmokeSettlements()
export const SMOKE_RAZORPAY_SETTLEMENTS = SMOKE_SETTLEMENT_PACK.settlements

export function listRazorpaySettlements({ status } = {}) {
  let rows = SMOKE_RAZORPAY_SETTLEMENTS
  if (status && String(status).toLowerCase() !== 'all') {
    rows = rows.filter((r) => r.status === String(status).toLowerCase())
  }
  const processed = SMOKE_RAZORPAY_SETTLEMENTS.filter((r) => r.status === 'processed')
  const previous = processed[0] || null
  const today = processed.find((r) => {
    const day = new Date((r.created_at || 0) * 1000).toDateString()
    return day === new Date(NOW).toDateString()
  }) || processed[processed.length - 1] || null
  const next = SMOKE_RAZORPAY_SETTLEMENTS.find((r) => r.status === 'created' || r.status === 'initiated') || null
  return {
    entity: 'collection',
    count: rows.length,
    items: rows,
    overview: {
      previous_settlement: previous
        ? { id: previous.id, amount: previous.amount, status: previous.status, utr: previous.utr, created_at: previous.created_at }
        : null,
      today_settlement: today
        ? { id: today.id, amount: DEMO_PAYOUT_KPIS.processed_amount_minor, status: today.status, utr: today.utr, created_at: today.created_at }
        : null,
      next_settlement: next
        ? { id: next.id, amount: next.amount, status: next.status, created_at: next.created_at }
        : null,
      available_balance: DEMO_PAYOUT_KPIS.processed_amount_minor,
      schedule: 'Domestic - After 2 days',
      schedule_active: true,
      payout_kpis: {
        processed_count: DEMO_PAYOUT_KPIS.processed_count,
        processed_amount_minor: DEMO_PAYOUT_KPIS.processed_amount_minor,
        review_count: DEMO_PAYOUT_KPIS.review_count,
        review_amount_minor: DEMO_PAYOUT_KPIS.review_amount_minor,
        failed_count: DEMO_PAYOUT_KPIS.failed_count,
        failed_amount_minor: DEMO_PAYOUT_KPIS.failed_amount_minor,
        total_amount_minor: DEMO_PAYOUT_KPIS.total_amount_minor,
      },
    },
  }
}

export function listSettlementReconCombined({ settlementId } = {}) {
  const id = String(settlementId || '').trim()
  if (!id) {
    return { entity: 'collection', count: 0, items: [], error: 'settlement_id required' }
  }
  const items = SMOKE_SETTLEMENT_PACK.reconBySettlement.get(id) || []
  return {
    entity: 'collection',
    count: items.length,
    settlement_id: id,
    items,
  }
}


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
        id: index === 0 ? 'INV-001' : rec.data.id,
        status: unresolved ? 'unresolved' : 'completed',
        issue: index === 0 ? 'Failed payment with unexplained bank movement' : issueLabel(ex.reason),
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
    const matched = SMOKE_RECON_RESULTS.filter((r) => r.result === 'MATCHED').length
    const exceptions = SMOKE_RECON_RESULTS.filter((r) => r.result !== 'MATCHED').length
    return {
      status: 200,
      body: {
        records: SMOKE_RECON_RESULTS.length,
        matched,
        exceptions,
        results: rows,
      },
    }
  }
  if (method === 'GET' && rest.length === 1 && rest[0] === 'investigations') {
    return { status: 200, body: listInvestigations() }
  }
  if (method === 'GET' && rest[0] === 'investigations' && rest[1]) {
    const list = listInvestigations().investigations
    const found =
      list.find((row) => row.id === rest[1]) || list.find((row) => row.entity_id === rest[1])
    if (!found) return { status: 404, body: { error: 'not_found' } }
    return { status: 200, body: { data: found } }
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
  if (method === 'GET' && rest.join('/') === 'settlements/recon/combined') {
    const settlementId = url.searchParams.get('settlement_id')?.trim() || ''
    return { status: 200, body: listSettlementReconCombined({ settlementId }) }
  }
  if (method === 'GET' && rest.join('/') === 'settlements/list') {
    const status = url.searchParams.get('status')?.trim() || ''
    return { status: 200, body: listRazorpaySettlements({ status }) }
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
