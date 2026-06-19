import { buildAmbiguityMixSegments } from './bubbleMapChart.js'
import {
  BATCHES,
  EVIDENCE_BATCH,
  PACK_BATCH,
  PACK_INTENT_A,
  PACK_INTENT_B,
  PRIMARY_BATCH,
  TENANT_ID,
  intentId,
  parsePositiveInt,
} from './constants.js'

const PROVIDERS = ['razorpay', 'cashfree']
const STATUSES = ['SETTLED', 'SETTLED', 'SETTLED', 'PENDING', 'FAILED']

function batchMeta(batchId) {
  return BATCHES.find((b) => b.id === batchId) ?? BATCHES[0]
}

export function authEnvelope() {
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  return {
    user: {
      id: 'smoke-user-001',
      email: 'reviewer@smoke.local',
      role: 'CUSTOMER_USER',
      name: 'Smoke Reviewer',
      tenant_id: TENANT_ID,
      tenant_name: 'Smoke Tenant',
      workspace_code: 'SMOKE',
      status: 'ACTIVE',
      mfa_enabled: false,
    },
    session: {
      session_id: 'smoke-session-001',
      tenant_id: TENANT_ID,
      workspace_code: 'SMOKE',
      role: 'CUSTOMER_USER',
      access_expires_at: expires,
    },
    requires_mfa: false,
    access_token: 'smoke-access-token',
    refresh_token: 'smoke-refresh-token',
    access_expires_at: expires,
  }
}

export function buildPaymentIntents(batchId) {
  const meta = batchMeta(batchId)
  const items = []
  for (let i = 0; i < meta.intentCount; i += 1) {
    const amount = 1500 + (i % 17) * 237.5
    items.push({
      tenant_id: TENANT_ID,
      intent_id: intentId(batchId, i),
      batch_id: batchId,
      batchid: batchId,
      client_batch_ref: batchId,
      client_payout_ref: `PAY-${batchId.slice(-5).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      amount,
      currency: 'INR',
      provider_hint: meta.partner,
      beneficiary_type: i % 4 === 0 ? 'UPI' : 'BANK_TRANSFER',
      intent_quality_score: 0.72 + (i % 5) * 0.04,
      aggregate_confidence_score: 0.81,
      confidence_score: 0.79,
      source_row_num: i + 1,
      intended_execution_at: '2026-06-01T09:00:00Z',
      beneficiary: {
        instrument: { kind: i % 4 === 0 ? 'UPI' : 'NEFT' },
      },
    })
  }
  return { items, pagination: { page: 1, page_size: items.length, total: items.length } }
}

/** Mirrors intent-engine GET /api/prod/intents/batch-ids (`total_amount` = SUM(amount) per batch). */
export function buildBatchIdsList() {
  return {
    items: BATCHES.map((b) => {
      const { items } = buildPaymentIntents(b.id)
      const total_amount = items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
      return { batch_id: b.id, total_amount }
    }),
  }
}

export function buildDlqItems(batchId) {
  const batchIndex = BATCHES.findIndex((b) => b.id === batchId)
  if (batchIndex < 0 || batchIndex > 2) {
    return { items: [], pagination: { page: 1, page_size: 0, total: 0 } }
  }
  const items = [
    {
      dlq_id: 'dlq-smoke-001',
      tenant_id: TENANT_ID,
      batch_id: batchId,
      client_batch_ref: batchId,
      stage: 'VALIDATION',
      reason_code: 'MISSING_BENEFICIARY',
      error_detail: 'Beneficiary account missing for row 12',
      dlq_status: 'OPEN',
      replayable: true,
      source_row_num: 12,
      created_at: '2026-06-01T10:15:00Z',
    },
    {
      dlq_id: 'dlq-smoke-002',
      tenant_id: TENANT_ID,
      batch_id: batchId,
      client_batch_ref: batchId,
      stage: 'MAPPING',
      reason_code: 'AMBIGUOUS_AMOUNT',
      error_detail: 'Amount field ambiguous on row 19',
      dlq_status: 'OPEN',
      replayable: true,
      source_row_num: 19,
      created_at: '2026-06-01T10:18:00Z',
    },
  ]
  return { items, pagination: { page: 1, page_size: items.length, total: items.length } }
}

export function buildSettlementObservations(batchId, page, pageSize) {
  const meta = batchMeta(batchId)
  const all = []
  for (let i = 0; i < meta.observationCount; i += 1) {
    const provider = meta.partner
    const status = STATUSES[i % STATUSES.length]
    const amount = 1200 + (i % 13) * 185.25
    all.push({
      settlement_observation_id: `obs-${batchId}-${String(i + 1).padStart(3, '0')}`,
      tenant_id: TENANT_ID,
      client_batch_id: batchId,
      source_row_ref: String(i + 1),
      source_system: provider,
      provider_reference: provider,
      connector_id: provider,
      amount,
      settled_amount: status === 'SETTLED' ? amount : null,
      currency_code: 'INR',
      settlement_status: status,
      client_reference_candidate: `PAY-${batchId.slice(-5).toUpperCase()}-${String((i % meta.intentCount) + 1).padStart(3, '0')}`,
      bank_reference: status === 'SETTLED' ? `UTR${batchId.slice(-4)}${String(i + 1).padStart(4, '0')}` : null,
      observation_timestamp: '2026-06-02T08:00:00Z',
      value_date: '2026-06-02',
      parse_confidence: 0.88 + (i % 3) * 0.03,
      mapping_confidence: 0.91,
      attachment_readiness_score: 0.85,
      matched_intent_id: status === 'SETTLED' ? intentId(batchId, i % meta.intentCount) : null,
      created_at: '2026-06-02T08:00:00Z',
      updated_at: '2026-06-02T08:05:00Z',
    })
  }
  const start = (page - 1) * pageSize
  const items = all.slice(start, start + pageSize)
  return {
    items,
    pagination: { page, page_size: pageSize, total: all.length },
  }
}

export function buildSettlementBatchList() {
  return {
    items: BATCHES.map((b) => ({ client_batch_id: b.id })),
    pagination: { page: 1, page_size: 20, total: BATCHES.length },
  }
}

export function buildSettlementErrors(batchId) {
  const bid = batchId || PRIMARY_BATCH
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

export function buildIntelligenceBatches() {
  return {
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batches: BATCHES.map((b) => ({
      batch_id: b.id,
      tenant_id: TENANT_ID,
      finality_status: b.finality,
      total_count: b.intentCount,
      source_reference: b.partner,
    })),
  }
}

export function buildBatchDetail(batchId) {
  const meta = batchMeta(batchId)
  const confirmed = meta.totalIntendedMinor / 100 - 388.32
  return {
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batch: {
      batch_id: batchId,
      tenant_id: TENANT_ID,
      source_reference: meta.partner,
      total_count: meta.intentCount,
      success_count: Math.floor(meta.intentCount * 0.86),
      failed_count: 2,
      pending_count: meta.intentCount - Math.floor(meta.intentCount * 0.86) - 2,
      total_confirmed_amount_minor: confirmed,
      total_variance_minor: -388.32,
      missing_ref_count: 1,
      settlement_ref_count: meta.observationCount,
      ambiguity_score: 0.75,
    },
    batch_health: {
      total_confirmed_amount_minor: confirmed,
      total_variance_minor: -388.32,
      total_intended_amount_minor: meta.totalIntendedMinor / 100,
      ambiguity_score: 0.75,
      finality_status: batchId === PRIMARY_BATCH ? meta.finality ?? 'PARTIALLY_SETTLED' : meta.finality ?? 'FULLY_SETTLED',
      source_reference: meta.partner,
    },
  }
}

export function buildBatchContract(batchId) {
  const meta = batchMeta(batchId)
  const confirmed = meta.totalIntendedMinor / 100 - 388.32
  return {
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batch_id: batchId,
    bank_reference_coverage: '96.00%',
    settlement_ref_count: meta.observationCount,
    bank_ref_present_count: meta.observationCount - 2,
    client_ref_present_count: meta.observationCount - 1,
    client_reference_coverage: '98.00%',
    variance_amount: -388.32,
    orphan_amount: 22_381.29,
    unmatch_amount: 1200,
    total_confirmed_amount: confirmed,
    match_confidence: 0.75,
    missing_reference_rate: '2.00%',
    source_reference: meta.partner,
  }
}

const LEAKAGE_DAY_MS = 86_400_000

/** Stable 0..1 hash from a date string — deterministic per-day variation. */
function leakageDateUnit(seed) {
  let h = 2_166_136_261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16_777_619)
  }
  return ((h >>> 0) % 1000) / 1000
}

/**
 * Per-day leakage components for one calendar day (UTC).
 *
 * Deterministic by date so the trend chart is stable across reloads but still
 * varies day-to-day — mirroring live, where zord-intelligence writes a fresh
 * LEAKAGE snapshot as each day's intents/settlements arrive. Sundays produce no
 * activity, so the chart shows realistic gaps instead of one flat repeated bar.
 */
function leakageComponentsForDay(dateStr) {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay() // 0 Sun .. 6 Sat
  if (dow === 0) {
    return { intended: 0, settled: 0, unmatched: 0, under: 0, orphan: 0, reversal: 0 }
  }
  const u = leakageDateUnit(dateStr)
  const intended = Math.round(5_000_000 + u * 7_000_000) // ₹50L–₹120L
  const settled = Math.round(intended * (0.62 + leakageDateUnit(`${dateStr}:s`) * 0.16))
  const unmatched = Math.round(intended * (0.06 + leakageDateUnit(`${dateStr}:u`) * 0.10))
  const under = Math.round(intended * 0.008)
  const orphan = Math.round(intended * 0.002)
  const reversal = Math.round(intended * 0.0006)
  return { intended, settled, unmatched, under, orphan, reversal }
}

function* leakageDaysInWindow(fromStr, toStr) {
  const from = new Date(`${fromStr}T00:00:00Z`).getTime()
  const to = new Date(`${toStr}T00:00:00Z`).getTime()
  for (let t = from; t <= to; t += LEAKAGE_DAY_MS) {
    yield new Date(t).toISOString().slice(0, 10)
  }
}

/**
 * Leakage KPIs for a date window. The home trend chart calls this once per
 * bucket with from_date=to_date=<day>, so each bar gets that day's own value.
 * With no window (KPI strip) it returns a rolling 30-day aggregate.
 */
export function leakageKpi(fromDate, toDate) {
  let from = fromDate
  let to = toDate
  if (!from || !to) {
    const today = new Date()
    to = today.toISOString().slice(0, 10)
    from = new Date(today.getTime() - 29 * LEAKAGE_DAY_MS).toISOString().slice(0, 10)
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
  return {
    data_available: sum.intended > 0 || sum.settled > 0,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    window_start: `${from}T00:00:00Z`,
    window_end: `${to}T23:59:59Z`,
    total_intended_amount_minor: sum.intended,
    unmatched_amount_minor: sum.unmatched,
    under_settlement_amount_minor: sum.under,
    orphan_amount_minor: sum.orphan,
    reversal_exposure_minor: sum.reversal,
    total_observed_settled_amount_minor: sum.settled,
    leakage_percentage: leakagePct,
    risk_tier: leakagePct >= 0.05 ? 'MEDIUM' : 'LOW',
  }
}

export function leakageExposureTimeseries() {
  const today = new Date().toISOString().slice(0, 10)
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    window_start: `${today}T00:00:00Z`,
    window_end: `${today}T23:59:59Z`,
    granularity: 'day',
    series: [
      { date: today, current_leakage_minor: 571_447, predicted_leakage_minor: 1_349_814 },
      {
        date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        current_leakage_minor: 498_220,
        predicted_leakage_minor: 1_102_400,
      },
    ],
  }
}

export function ambiguityKpi() {
  const providerRefMissingRate = 0.16
  const ambiguityRate = 0.08
  const avgAttachmentConfidence = 0.82
  const mix = buildAmbiguityMixSegments({
    providerRefMissingRate,
    ambiguityRate,
    avgAttachmentConfidence,
  })
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    value_at_risk_minor: 250_000,
    avg_attachment_confidence: avgAttachmentConfidence,
    provider_ref_missing_rate: providerRefMissingRate,
    ambiguous_intent_count: 12,
    ambiguity_rate: ambiguityRate,
    ...mix,
  }
}

export function ambiguityHeatmap() {
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    batches: BATCHES.map((b) => ({
      batch_id: b.id,
      total_count: b.intentCount,
      exact_match_count: Math.floor(b.intentCount * 0.55),
      high_confidence_count: Math.floor(b.intentCount * 0.28),
      ambiguous_count: 3,
      unresolved_count: 2,
      conflicted_count: 1,
      aggregate_score: 0.86,
    })),
  }
}

export function bubbleMap() {
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    count: BATCHES.length,
    batches: BATCHES.map((b, idx) => ({
      batch_id: b.id,
      amount_value: b.totalIntendedMinor,
      amount_at_risk: 45_000 + idx * 12_000,
    })),
  }
}

export function patternsDashboard() {
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
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
    batch_risk_score: 0.39,
    risk_tier: 'MEDIUM',
    finality_status: 'PARTIALLY_SETTLED',
    total_count: 100,
    success_count: 82,
    failed_count: 4,
    pending_count: 14,
  }
}

export function patternDetail(batchId) {
  const bid = batchId || PRIMARY_BATCH
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
    model_version: 'smoke-v1',
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
        },
      },
    ],
  }
}

export function recommendationsDashboard() {
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
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    defensibility_score: 58,
    defensibility_tier: 'STRONG',
    bank_confirmed_rate: 0.72,
    evidence_pack_coverage: 0.81,
  }
}

export function packSummary(packId, opts = {}) {
  return {
    evidence_pack_id: packId,
    tenant_id: TENANT_ID,
    intent_id: opts.intentId ?? null,
    batch_id: opts.batchId ?? null,
    client_reference: opts.ref ?? packId,
    client_payout_ref: opts.ref ?? packId,
    mode: opts.mode ?? 'BATCH_PROOF',
    pack_status: 'READY',
    merkle_root: 'a'.repeat(64),
    ruleset_version: '1',
    created_at: '2026-06-01T12:00:00Z',
    proof_status: 'CERTIFIED',
    proof_score: 100,
    leaf_count: opts.leafCount ?? 6,
    required_leaf_count: opts.requiredLeafCount ?? 6,
    artifact_count: opts.leafCount ?? 6,
    pack_completeness_score: 1,
    settlement_leaf_present_flag: true,
    attachment_decision_leaf_present_flag: true,
    governance_decision: 'Pass',
    verification_status: false,
  }
}

export function evidencePacksList(searchParams) {
  const batchId = searchParams.get('batch_id')
  const intentIdParam = searchParams.get('intent_id')
  if (intentIdParam) {
    return {
      packs: [packSummary(PACK_INTENT_A, { intentId: intentIdParam, mode: 'INTELLIGENCE_INTENT', ref: 'PAY-A' })],
      total: 1,
    }
  }
  if (batchId === EVIDENCE_BATCH || batchId === PRIMARY_BATCH) {
    return {
      packs: [
        packSummary(PACK_BATCH, { batchId: batchId ?? PRIMARY_BATCH, mode: 'BATCH_PROOF', ref: 'BATCH-REF' }),
        packSummary(PACK_INTENT_A, {
          intentId: intentId(PRIMARY_BATCH, 0),
          batchId: batchId ?? PRIMARY_BATCH,
          mode: 'INTELLIGENCE_ATTACH',
          ref: 'PAY-A',
        }),
      ],
      total: 2,
    }
  }
  return {
    packs: BATCHES.map((b, idx) =>
      packSummary(`pack-${b.id}`, { batchId: b.id, mode: 'BATCH_PROOF', ref: `REF-${idx + 1}` }),
    ),
    total: BATCHES.length,
  }
}

export function lineageGraph(scope, id) {
  const root = `${id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}root`.padEnd(64, 'a').slice(0, 64)
  return {
    evidence_pack_id: scope === 'pack' ? id : PACK_BATCH,
    tenant_id: TENANT_ID,
    intent_id: scope === 'pack' ? intentId(PRIMARY_BATCH, 0) : '',
    merkle_root: root,
    nodes: [
      { id: 'source', label: 'Original File', node_type: 'SOURCE', leaf_hash: `${root.slice(0, 48)}1111111111111111` },
      { id: 'transform', label: 'Canonical', node_type: 'TRANSFORM', leaf_hash: `${root.slice(0, 48)}2222222222222222` },
      { id: 'merkle_root', label: 'Proof Root', node_type: 'SEAL', leaf_hash: root },
    ],
    edges: [
      { from: 'source', to: 'transform', label: 'canonicalise' },
      { from: 'transform', to: 'merkle_root', label: 'seal' },
    ],
  }
}

export function intentsListPage(page, pageSize) {
  const all = buildPaymentIntents(PRIMARY_BATCH).items
  const start = (page - 1) * pageSize
  const slice = all.slice(start, start + pageSize)
  return {
    items: slice,
    pagination: { page, page_size: pageSize, total: all.length },
  }
}

export function settlementObservationsRoute(url) {
  const clientBatchId = url.searchParams.get('client_batch_id')?.trim()
  if (!clientBatchId) return buildSettlementBatchList()
  const page = parsePositiveInt(url.searchParams.get('page'), 1)
  const pageSize = Math.min(100, parsePositiveInt(url.searchParams.get('page_size'), 20))
  return buildSettlementObservations(clientBatchId, page, pageSize)
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

export function notFound(path) {
  return { error: 'smoke_simulator_no_route', path, hint: 'Route not implemented in payout-smoke-simulator' }
}
