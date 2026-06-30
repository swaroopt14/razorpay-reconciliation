import { buildAmbiguityMixSegments } from './bubbleMapChart.js'
import {
  BATCHES,
  EVIDENCE_BATCH,
  PACK_BATCH,
  PACK_INTENT_A,
  PACK_INTENT_B,
  PRIMARY_BATCH,
  TENANT_ID,
  batchPackId,
  intentId,
  parsePositiveInt,
} from './constants.js'

const PROVIDERS = ['razorpay', 'cashfree']

function batchMeta(batchId) {
  return BATCHES.find((b) => b.id === batchId) ?? BATCHES[0]
}

/** Split a rupee total across N rows; last row absorbs rounding so the sum is exact. */
function distributeAmounts(totalRupees, count) {
  const n = Math.max(1, count)
  const totalCents = Math.round(Number(totalRupees) * 100)
  const baseCents = Math.floor(totalCents / n)
  const amounts = []
  let assignedCents = 0
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1) {
      amounts.push(Number(((totalCents - assignedCents) / 100).toFixed(2)))
      break
    }
    let cents = baseCents
    const remainder = totalCents - baseCents * n
    if (i < remainder) cents += 1
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
  const settledEnd = meta.settledRows ?? 12
  const pendingEnd = settledEnd + (meta.pendingRows ?? 0)
  if (rowIndex < settledEnd) return 'SETTLED'
  if (rowIndex < pendingEnd) return 'PENDING'
  return 'FAILED'
}

export function authEnvelope() {
  const now = Date.now()
  const accessExpires = new Date(now + 60 * 60 * 1000).toISOString()
  const idleExpires = new Date(now + 15 * 60 * 1000).toISOString()
  const absoluteExpires = new Date(now + 8 * 60 * 60 * 1000).toISOString()
  return {
    user: {
      id: 'usr_ops_reviewer_001',
      email: 'ops.reviewer@zordnet.com',
      role: 'CUSTOMER_USER',
      name: 'Ops Reviewer',
      tenant_id: TENANT_ID,
      tenant_name: 'Zordnet Operations',
      workspace_code: 'ZORDNET',
      status: 'ACTIVE',
      mfa_enabled: false,
    },
    session: {
      session_id: 'sess_dev_001',
      tenant_id: TENANT_ID,
      workspace_code: 'ZORDNET',
      role: 'CUSTOMER_USER',
      access_expires_at: accessExpires,
      idle_expires_at: idleExpires,
      absolute_expires_at: absoluteExpires,
    },
    requires_mfa: false,
    access_token: 'dev-access-token',
    refresh_token: 'dev-refresh-token',
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

export function buildPaymentIntents(batchId) {
  const meta = batchMeta(batchId)
  const count = meta.intentCount ?? 15
  const total = meta.intentTotalRupees ?? meta.totalIntendedMinor ?? 55_000
  const amounts = distributeAmounts(total, count)
  const day = meta.date ?? '2026-06-12'
  const items = []
  for (let i = 0; i < count; i += 1) {
    items.push({
      tenant_id: TENANT_ID,
      intent_id: intentId(batchId, i),
      batch_id: batchId,
      batchid: batchId,
      client_batch_ref: batchId,
      client_payout_ref: payoutRef(batchId, i),
      amount: amounts[i],
      currency: 'INR',
      provider_hint: meta.partner,
      beneficiary_type: i % 4 === 0 ? 'UPI' : 'BANK_TRANSFER',
      intent_quality_score: 0.72 + (i % 5) * 0.04,
      aggregate_confidence_score: meta.matchConfidence ?? 0.81,
      confidence_score: 0.79,
      source_row_num: i + 1,
      intended_execution_at: `${day}T09:00:00Z`,
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
      const total_amount = Math.round(
        items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100,
      ) / 100
      return { batch_id: b.id, total_amount }
    }),
  }
}

export function buildDlqItems(batchId) {
  const meta = batchMeta(batchId)
  const count = meta.dlqCount ?? 0
  if (count <= 0) {
    return { items: [], pagination: { page: 1, page_size: 0, total: 0 } }
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

export function buildSettlementObservations(batchId, page, pageSize) {
  const meta = batchMeta(batchId)
  const count = meta.observationCount ?? 15
  const total = meta.settlementTotalRupees ?? 44_000
  const amounts = distributeAmounts(total, count)
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
    const linkedRef = payoutRef(batchId, intentIdx)
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

export function buildIntelligenceBatches() {
  return {
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batches: BATCHES.map((b) => {
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
    }),
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
  const batch = BATCHES.find((b) => b.date === dateStr)
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
 * Leakage KPIs for a date window. The home trend chart calls this once per
 * bucket with from_date=to_date=<day>, so each bar gets that day's own value.
 * With no window (KPI strip) it returns the current calendar month aggregate.
 */
export function leakageKpi(fromDate, toDate) {
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

export function leakageExposureTimeseries(granularity = 'day') {
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
    intelligence_headline: '12 intents need provider reference review before dispatch.',
    intelligence_body: 'Missing UTR cluster on Cashfree rail is the top driver this week.',
    total_intended_amount_minor: 34_200_000,
    total_observed_settled_amount_minor: 26_000_000,
    ambiguous_amount_minor: 4_100_000,
    total_variance_minor: 2_200_000,
    reversal_exposure_minor: 1_500_000,
    unresolved_amount_minor: 400_000,
    unresolved_count: 12,
    signal_clarity_subtitle: '₹34.2Cr book across 780 intents · ₹8.4Cr needing review',
    signal_clarity_roll_rates: [
      { from_band: 'Current', to_band: 'SMA-0', roll_pct: 9 },
      { from_band: 'SMA-0', to_band: 'SMA-1', roll_pct: 18 },
      { from_band: 'SMA-1', to_band: 'SMA-2', roll_pct: 31 },
      { from_band: 'SMA-2', to_band: 'NPA', roll_pct: 22 },
    ],
    signal_clarity_bands: [
      {
        band: 'Current',
        amount_minor: 26_000_000,
        item_count: 645,
        share_pct: 76,
        tone: 'green',
      },
      {
        band: 'SMA-0',
        amount_minor: 4_100_000,
        item_count: 67,
        share_pct: 12,
        roll_pct: 9,
        tone: 'lime',
      },
      {
        band: 'SMA-1',
        amount_minor: 2_200_000,
        item_count: 38,
        share_pct: 6.4,
        roll_pct: 18,
        tone: 'amber',
      },
      {
        band: 'SMA-2',
        amount_minor: 1_500_000,
        item_count: 18,
        share_pct: 4.4,
        roll_pct: 31,
        tone: 'orange',
      },
      {
        band: 'NPA-2',
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

export function ambiguityHeatmap() {
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    intelligence_mode: 'GRADE_A',
    batches: BATCHES.map((b, idx) => {
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
    }),
  }
}

/** Risk-ratio presets so bubble map shows red / yellow / green tiers across recent batches. */
const BUBBLE_MAP_RISK_PCTS = [0, 1.2, 3.5, 7.8, 15.4, 0.6, 4.2, 9.1, 12.5, 2.1]

const BUBBLE_MAP_WINDOW = 24

export function bubbleMap() {
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

export function patternsDashboard(batchId) {
  const bid = batchId?.trim() || null
  const batchIndex = bid ? BATCHES.findIndex((b) => b.id === bid) : -1
  const meta = bid ? batchMeta(bid) : null

  const tenantBatchCount = BATCHES.length
  const totalCount = bid ? (meta?.intentCount ?? 100) : tenantBatchCount
  const ambiguousCount = bid ? 8 + ((batchIndex >= 0 ? batchIndex : 0) % 7) : 18
  const batchRiskScore = bid
    ? Number((0.31 + ((batchIndex >= 0 ? batchIndex : 0) % 6) * 0.04).toFixed(2))
    : 0.39
  const batchQualityScore = bid ? 72 + ((batchIndex >= 0 ? batchIndex : 0) % 5) * 4 : 88
  const orphanCount = bid ? 6 + ((batchIndex >= 0 ? batchIndex : 0) % 4) : 12
  const shortCount = bid ? 4 + ((batchIndex >= 0 ? batchIndex : 0) % 3) : 9
  const ambiguousDriverCount = bid ? 3 + ((batchIndex >= 0 ? batchIndex : 0) % 4) : 7

  return {
    data_available: Boolean(!bid || batchIndex >= 0),
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    ...(bid ? { batch_id: bid } : {}),
    ...(!bid || batchIndex >= 0
      ? {}
      : { reason: 'No batch data available for this period' }),
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
    finality_status: 'PARTIALLY_SETTLED',
    total_count: totalCount,
    success_count: 82,
    failed_count: 4,
    pending_count: 14,
    ambiguous_count: ambiguousCount,
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

export function operationsSummary() {
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    settlement_confirmation_coverage_pct: 87.4,
    confirmed_matched_value_minor: 42_000_000,
    total_intended_amount_minor: 48_000_000,
    open_exception_queue_count: 12,
    open_exception_queue_value_minor: 18_500_000,
    batch_close_readiness: {
      blocked_batch_count: BATCHES.filter((b) => b.finality === 'OPEN').length,
      close_ready_batch_count: BATCHES.filter((b) => b.finality === 'FULLY_SETTLED').length,
      blocked_batch_ids: BATCHES.filter((b) => b.finality === 'OPEN').map((b) => b.id),
      close_ready_batch_ids: BATCHES.filter((b) => b.finality === 'FULLY_SETTLED').map((b) => b.id),
    },
  }
}

export function exceptionsSummary() {
  return {
    data_available: true,
    tenant_id: TENANT_ID,
    computed_at: new Date().toISOString(),
    open_financial_exception_count: 12,
    open_financial_exception_value_minor: 18_500_000,
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
    evidence_pack_rate: 0.75,
    audit_ready_pct: 0.72,
    weak_evidence_count: 4,
    governance_coverage_pct: 0.85,
    replayability_pct: 0.9,
    dispute_ready_pct: 0.65,
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
  return BATCHES.find((b) => b.id === EVIDENCE_BATCH)?.id ?? EVIDENCE_BATCH
}

function intentPackIndex(packId) {
  if (packId === PACK_INTENT_B) return 1
  return 0
}

/** Six lineage leaves + proof root for per-payment intent attach packs. */
function buildIntentLineageGraph(packId, batchId, intentIndex = 0) {
  const root = `${packId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}intentroot`.padEnd(64, 'c').slice(0, 64)
  const iid = intentId(batchId, intentIndex)
  const nodeDefs = [
    { id: 'payment_file', label: 'Original Payment File', node_type: 'SOURCE', suffix: '1111111111111111', missing: false },
    { id: 'envelope', label: 'Envelope Hash', node_type: 'SOURCE', suffix: '2222222222222222', missing: false },
    { id: 'canonical_intent', label: 'Structured Payment Intent', node_type: 'TRANSFORM', suffix: '3333333333333333', missing: false },
    { id: 'governance', label: 'Governance Check', node_type: 'DECISION', suffix: '4444444444444444', missing: false },
    { id: 'attachment', label: 'Attachment Decision', node_type: 'DECISION', suffix: '5555555555555555', missing: false },
    { id: 'outcome', label: 'Outcome Signal', node_type: 'TRANSFORM', suffix: '6666666666666666', missing: false },
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
    { from: n('governance'), to: n('attachment'), label: 'attach' },
    { from: n('attachment'), to: n('outcome'), label: 'observe outcome' },
    { from: n('outcome'), to: 'merkle_root', label: 'seal intent proof' },
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
  return {
    evidence_pack_id: packId,
    tenant_id: TENANT_ID,
    intent_id: lineage.intent_id ?? '',
    batch_id: lineage.batch_id ?? EVIDENCE_BATCH,
    contract_id: opts.contractId ?? '—',
    mode: opts.mode ?? 'BATCH_PROOF',
    pack_status: 'READY',
    proof_status: opts.proofStatus ?? 'PARTIAL',
    proof_score: opts.proofScore ?? 58,
    merkle_root: lineage.merkle_root,
    ruleset_version: '1',
    created_at: lineage.created_at,
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
    const lineage = buildIntentLineageGraph(packId, batchId, intentPackIndex(packId))
    return packDetailFromLineage(packId, lineage, {
      mode: 'INTELLIGENCE_ATTACH',
      proofScore: packId === PACK_INTENT_A ? 72 : 68,
      proofStatus: 'PARTIAL',
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

export function evidencePacksList(searchParams) {
  const batchId = searchParams.get('batch_id')
  const intentIdParam = searchParams.get('intent_id')
  if (intentIdParam) {
    return {
      packs: [packSummary(PACK_INTENT_A, { intentId: intentIdParam, mode: 'INTELLIGENCE_INTENT', ref: 'PAY-A' })],
      total: 1,
    }
  }
  const bid = batchId?.trim()
  const knownBatch = bid && BATCHES.some((b) => b.id === bid)
  if (knownBatch || bid === EVIDENCE_BATCH || bid === PRIMARY_BATCH) {
    const resolved = bid ?? PRIMARY_BATCH
    const meta = batchMeta(resolved)
    const pid = batchPackId(resolved)
    return {
      packs: [
        packSummary(pid, {
          batchId: resolved,
          mode: 'BATCH_PROOF',
          ref: `BATCH-${resolved.slice(-10)}`,
          merkleRoot: merkleRootForBatch(resolved),
          proofScore: 58,
          proofStatus: 'PARTIAL',
          createdAt: `${meta.date}T09:00:00Z`,
          leafCount: 9,
        }),
        packSummary(PACK_INTENT_A, {
          intentId: intentId(resolved, 0),
          batchId: resolved,
          mode: 'INTELLIGENCE_ATTACH',
          ref: payoutRef(resolved, 0),
          proofScore: 72,
          leafCount: 6,
        }),
      ],
      total: 2,
    }
  }
  return {
    packs: BATCHES.map((b) =>
      packSummary(batchPackId(b.id), { batchId: b.id, mode: 'BATCH_PROOF', ref: `REF-${b.date}`, leafCount: 9 }),
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
