/**
 * Intent Journal mock builders.
 *
 * Two responsibilities:
 *   1. `buildSeededBatchFromScenario(scenarioId, batchId)` — generates a full
 *      `SeededBatch` (batch summary + N intent details) for a sandbox scenario.
 *   2. `getIntentDetail(intentId)` — returns deep details for ANY intent ID,
 *      including canned-batch intents not stored anywhere. Deterministic from
 *      the intent ID so the same row always shows the same drawer content.
 *
 * Both produce data that conforms to the `intent-journal-types.ts` contract.
 */

import type {
  AttachmentDecision,
  EvidencePackStatus,
  BusinessIdempotency,
  CanonicalScores,
  EvidenceMode,
  GovernanceOutcome,
  GovernanceState,
  IntentDetail,
  IntentKind,
  MappingProvenance,
  IntentLifecycleStatus,
  LineageStep,
  SeededBatch,
  SignalEvent,
  Variance,
} from './intent-journal-types'
import type { SandboxScenarioId } from './sandbox-data'
import { generateBenToken, tokenizeBeneficiaryFull } from './tokenize'

// ─── Deterministic PRNG (mulberry32) ────────────────────────────────────────────

/**
 * mulberry32 — small deterministic PRNG. Same seed → same stream. We use this
 * so the same intent ID always produces the same drawer content.
 */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!
}

// ─── Scenario shapes ───────────────────────────────────────────────────────────

type ScenarioShape = {
  intentCount: number
  totalValue: number
  rail: string
  primaryConnector: string
  primaryConnectorType: 'psp' | 'bank'
  /** Distribution of statuses across the batch. Sums to 1. */
  statusMix: Record<IntentLifecycleStatus, number>
  defensibilityRange: [number, number]
}

const SCENARIO_SHAPES: Record<SandboxScenarioId, ScenarioShape> = {
  salary_run: {
    intentCount: 100,
    totalValue: 18_500_000,
    rail: 'IMPS',
    primaryConnector: 'Cashfree',
    primaryConnectorType: 'psp',
    statusMix: {
      created: 0,
      dispatched: 0,
      processing: 0,
      confirmed: 0.8,
      pending: 0.15,
      ambiguous: 0.04,
      failed: 0.01,
    },
    defensibilityRange: [72, 92],
  },
  vendor_payouts: {
    intentCount: 40,
    totalValue: 42_000_000,
    rail: 'NEFT',
    primaryConnector: 'HDFC Bank',
    primaryConnectorType: 'bank',
    statusMix: {
      created: 0,
      dispatched: 0,
      processing: 0.02,
      confirmed: 0.95,
      pending: 0.02,
      ambiguous: 0.01,
      failed: 0,
    },
    defensibilityRange: [85, 96],
  },
  refund_batch: {
    intentCount: 25,
    totalValue: 3_250_000,
    rail: 'IMPS',
    primaryConnector: 'Razorpay',
    primaryConnectorType: 'psp',
    statusMix: {
      created: 0,
      dispatched: 0,
      processing: 0,
      confirmed: 1.0,
      pending: 0,
      ambiguous: 0,
      failed: 0,
    },
    defensibilityRange: [88, 98],
  },
  failure_injection: {
    intentCount: 60,
    totalValue: 9_600_000,
    rail: 'NACH',
    primaryConnector: 'PayU',
    primaryConnectorType: 'psp',
    statusMix: {
      created: 0,
      dispatched: 0,
      processing: 0,
      confirmed: 0.55,
      pending: 0.1,
      ambiguous: 0.05,
      failed: 0.3,
    },
    defensibilityRange: [38, 78],
  },
}

// ─── Beneficiary pool ──────────────────────────────────────────────────────────

const FIRST_NAMES = ['John', 'Priya', 'Aarav', 'Sneha', 'Rahul', 'Anika', 'Vikram', 'Meera', 'Karan', 'Divya', 'Rohan', 'Isha', 'Arjun', 'Tara', 'Kabir']
const LAST_NAMES = ['Doe', 'Sharma', 'Iyer', 'Patel', 'Khan', 'Kapoor', 'Nair', 'Gupta', 'Shah', 'Reddy', 'Mehta', 'Bose', 'Joshi', 'Singh']
const BANKS = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak'] as const

// ─── Build per-intent detail ───────────────────────────────────────────────────

function buildLineage(rand: () => number, status: IntentLifecycleStatus, intentId: string, dispatchedAt: Date): LineageStep[] {
  const t0 = dispatchedAt.getTime()
  const at = (offsetSec: number) => new Date(t0 - offsetSec * 1000).toISOString()
  const sourceSystem = pick(rand, ['lms', 'erp', 'ap'] as const)

  const steps: LineageStep[] = [
    {
      id: `${intentId}-l1`,
      system: sourceSystem,
      action: 'Intent created',
      at: at(180),
      status: 'done',
      detail: 'Source ledger entry committed',
    },
    {
      id: `${intentId}-l2`,
      system: 'zord',
      action: 'Canonicalized + idempotency key issued',
      at: at(120),
      status: 'done',
      detail: 'Schema v2.4 · no drift detected',
    },
    {
      id: `${intentId}-l3`,
      system: 'governance',
      action: status === 'failed' ? 'Governance check rejected' : 'Governance check passed',
      at: at(90),
      status: status === 'failed' ? 'error' : 'done',
      detail:
        status === 'failed'
          ? 'KYC stale flag · mandate reference mismatch'
          : 'KYC fresh · mandate active · sanctions clear',
    },
    {
      id: `${intentId}-l4`,
      system: 'connector',
      action:
        status === 'failed'
          ? 'Dispatch skipped'
          : status === 'pending'
            ? 'Dispatched · awaiting acknowledgment'
            : 'Dispatched',
      at: dispatchedAt.toISOString(),
      status: status === 'failed' ? 'skipped' : status === 'pending' ? 'in_progress' : 'done',
    },
  ]
  return steps
}

function buildSignals(rand: () => number, status: IntentLifecycleStatus, intentId: string, connector: string, dispatchedAt: Date): SignalEvent[] {
  const sourceMap: Record<string, SignalEvent['source']> = {
    Cashfree: 'cashfree',
    Razorpay: 'razorpay',
    PayU: 'payu',
    Stripe: 'stripe',
    'HDFC Bank': 'hdfc_bank',
    'ICICI Bank': 'icici_bank',
    SBI: 'sbi',
  }
  const source: SignalEvent['source'] = sourceMap[connector] ?? 'cashfree'
  const t0 = dispatchedAt.getTime()
  const tNow = (offsetMs: number) => new Date(t0 + offsetMs).toISOString()

  if (status === 'failed') return []

  if (status === 'pending') {
    const latency = 5_000 + Math.floor(rand() * 3000)
    return [
      {
        id: `${intentId}-s1`,
        source,
        kind: 'webhook',
        payloadPreview: '"event":"payment.received","status":"in_progress"',
        arrivedAt: tNow(latency),
        latencyMs: latency,
        status: 'received',
      },
    ]
  }

  if (status === 'ambiguous') {
    const lat1 = 4_000 + Math.floor(rand() * 2000)
    const lat2 = lat1 + 8_000 + Math.floor(rand() * 4000)
    return [
      {
        id: `${intentId}-s1`,
        source,
        kind: 'webhook',
        payloadPreview: '"event":"payment.received","amount":1500',
        arrivedAt: tNow(lat1),
        latencyMs: lat1,
        status: 'received',
      },
      {
        id: `${intentId}-s2`,
        source: 'hdfc_bank',
        kind: 'settlement_file',
        payloadPreview: 'amount: 1485 (mismatch −15)',
        arrivedAt: tNow(lat2),
        latencyMs: lat2,
        status: 'mismatch',
      },
    ]
  }

  // Confirmed: 3 signals — webhook → settlement → reconcile.
  const lat1 = 3_000 + Math.floor(rand() * 1500)
  const lat2 = lat1 + 6_000 + Math.floor(rand() * 3000)
  const lat3 = lat2 + 5_000 + Math.floor(rand() * 2000)
  return [
    {
      id: `${intentId}-s1`,
      source,
      kind: 'webhook',
      payloadPreview: '"event":"payment.success","status":"COMPLETED"',
      arrivedAt: tNow(lat1),
      latencyMs: lat1,
      status: 'received',
    },
    {
      id: `${intentId}-s2`,
      source: 'hdfc_bank',
      kind: 'settlement_file',
      payloadPreview: 'UTR: HDFC2026050700123 · matched',
      arrivedAt: tNow(lat2),
      latencyMs: lat2,
      status: 'received',
    },
    {
      id: `${intentId}-s3`,
      source,
      kind: 'reconcile',
      payloadPreview: 'reconciliation: closed · variance: 0',
      arrivedAt: tNow(lat3),
      latencyMs: lat3,
      status: 'received',
    },
  ]
}

function buildAttachment(rand: () => number, primaryConnector: string, primaryConnectorType: 'psp' | 'bank', rail: string): AttachmentDecision {
  const reasonPool = ['LOW_P95_DELAY', 'HIGH_DEFENSIBILITY', 'LOW_AMBIGUITY', 'USE_CASE_FIT', 'COST_OPTIMAL', 'WEBHOOK_RELIABLE', 'SPONSOR_BANK_HEALTHY']
  const reasons = reasonPool.filter(() => rand() > 0.45).slice(0, 4)
  if (reasons.length === 0) reasons.push('USE_CASE_FIT')

  // Two alternatives, declined.
  const availableAlternatives = ([
    { connector: 'Razorpay', connectorType: 'psp', declineCode: 'LATENCY_OVER_THRESHOLD' },
    { connector: 'PayU', connectorType: 'psp', declineCode: 'AMBIGUITY_RATE_HIGH' },
    { connector: 'ICICI Bank', connectorType: 'bank', declineCode: 'RAIL_NOT_SUPPORTED' },
    { connector: 'SBI', connectorType: 'bank', declineCode: 'COST_TIER_HIGH' },
    { connector: 'Cashfree', connectorType: 'psp', declineCode: 'WEBHOOK_LATENCY_RISING' },
  ] satisfies Array<{ connector: string; connectorType: 'psp' | 'bank'; declineCode: string }>).filter((a) => a.connector !== primaryConnector)
  const alternatives: AttachmentDecision['alternatives'] = [pick(rand, availableAlternatives), pick(rand, availableAlternatives.filter((x) => x.connector !== availableAlternatives[0]?.connector))]
    .filter((a, i, arr) => arr.findIndex((x) => x.connector === a.connector) === i)
    .slice(0, 2)
    .map((a) => ({
      connector: a.connector,
      connectorType: a.connectorType,
      score: 40 + Math.floor(rand() * 30),
      declineCode: a.declineCode,
    }))

  return {
    chosenConnector: primaryConnector,
    chosenConnectorType: primaryConnectorType,
    chosenRail: rail,
    score: 70 + Math.floor(rand() * 25),
    reasonCodes: reasons,
    alternatives,
  }
}

function buildVariance(rand: () => number, status: IntentLifecycleStatus, amount: number): Variance {
  if (status === 'confirmed' || status === 'pending') {
    return { kind: 'none', summary: 'No variance · matched on amount + reference' }
  }
  if (status === 'ambiguous') {
    if (rand() < 0.5) {
      const delta = -(Math.floor(rand() * 30) + 5)
      const observed = amount + delta
      return {
        kind: 'amount',
        summary: `Settlement amount differs by ${delta < 0 ? delta : `+${delta}`}`,
        expected: amount.toString(),
        observed: observed.toString(),
        deltaPct: (delta / amount) * 100,
      }
    }
    return {
      kind: 'reference',
      summary: 'Reference field mismatch in settlement file',
      expected: 'salary_emp_104',
      observed: 'sal_emp_104_v2',
    }
  }
  return { kind: 'none', summary: 'Variance not applicable · intent never dispatched' }
}

function buildEvidence(rand: () => number, status: IntentLifecycleStatus, intentId: string, dispatchedAt: Date): EvidencePackStatus {
  const allArtifacts: EvidencePackStatus['artifacts'] = [
    { kind: 'intent_json', label: 'Intent JSON (canonical)', present: true, sizeBytes: 1240 + Math.floor(rand() * 600) },
    { kind: 'signals_bundle', label: 'Signals bundle', present: status !== 'failed', sizeBytes: status !== 'failed' ? 3400 + Math.floor(rand() * 1200) : null },
    { kind: 'governance_trace', label: 'Governance trace', present: true, sizeBytes: 800 + Math.floor(rand() * 400) },
    { kind: 'dispatch_receipt', label: 'Dispatch receipt', present: status !== 'failed', sizeBytes: status !== 'failed' ? 520 + Math.floor(rand() * 200) : null },
    { kind: 'settlement_extract', label: 'Settlement extract', present: status === 'confirmed', sizeBytes: status === 'confirmed' ? 1800 + Math.floor(rand() * 600) : null },
  ]
  const present = allArtifacts.filter((a) => a.present).length
  let state: EvidencePackStatus['state']
  if (present === allArtifacts.length) state = 'complete'
  else if (present >= 3) state = 'partial'
  else if (present >= 1) state = 'pending'
  else state = 'none'

  let merkleRoot: string | undefined
  if (state === 'complete') {
    const seed = seedFromString(intentId)
    const r = rng(seed + 7)
    merkleRoot = '0x' + Array.from({ length: 16 }, () => Math.floor(r() * 16).toString(16)).join('') + Array.from({ length: 16 }, () => Math.floor(r() * 16).toString(16)).join('')
  }

  return {
    state,
    artifactCount: present,
    totalArtifacts: allArtifacts.length,
    merkleRoot,
    lastUpdatedAt: new Date(dispatchedAt.getTime() + 60_000).toISOString(),
    artifacts: allArtifacts,
  }
}

/** Pick a status from the scenario distribution using the next rand draw. */
function pickStatusFromMix(rand: () => number, mix: ScenarioShape['statusMix']): IntentLifecycleStatus {
  const r = rand()
  let cum = 0
  const order: IntentLifecycleStatus[] = ['confirmed', 'pending', 'ambiguous', 'failed', 'processing', 'dispatched', 'created']
  for (const k of order) {
    cum += mix[k] ?? 0
    if (r <= cum) return k
  }
  return 'confirmed'
}

// ─── Service 2 truth-build builders ────────────────────────────────────────────

function buildMapping(rand: () => number, intentId: string, status: IntentLifecycleStatus): MappingProvenance {
  // Failed/ambiguous intents tend to have lower mapping confidence (more uncertainty).
  const baseConfidence = status === 'failed' ? 0.62 : status === 'ambiguous' ? 0.74 : 0.88
  const jitter = (rand() - 0.5) * 0.12
  const avgConf = Math.max(0.4, Math.min(0.99, baseConfidence + jitter))
  const minConf = Math.max(0.3, avgConf - 0.15 - rand() * 0.15)
  const lowConfCount = avgConf < 0.75 ? 2 + Math.floor(rand() * 3) : Math.floor(rand() * 2)
  const reqUncertain = status === 'failed' ? 1 + Math.floor(rand() * 2) : 0
  const unmappedExtras = Math.floor(rand() * 4)
  return {
    nirId: `nir_${intentId.slice(-8)}`,
    mappingProfileId: `prof_${shapeProfileTag(rand)}`,
    mappingProfileVersion: 'v1.4',
    mappingConfidenceScore: Math.round(avgConf * 100),
    mappingUncertainFlag: avgConf < 0.75,
    fieldConfidence: {
      averageConfidence: Number(avgConf.toFixed(3)),
      minimumConfidence: Number(minConf.toFixed(3)),
      lowConfidenceFieldCount: lowConfCount,
      requiredFieldUncertaintyCount: reqUncertain,
      unmappedExtrasCount: unmappedExtras,
    },
  }
}

function shapeProfileTag(rand: () => number): string {
  return ['acme_payouts', 'tally_export', 'sap_disbursal', 'netsuite_ap'][Math.floor(rand() * 4)]
}

function buildIdempotency(rand: () => number, intentId: string, status: IntentLifecycleStatus): BusinessIdempotency {
  // Mostly clean; ~12% duplicate risk among ambiguous/failed.
  const isRisky = (status === 'ambiguous' || status === 'failed') && rand() < 0.35
  const reasonPool = ['SAME_CLIENT_REF_REUSE', 'SAME_BENEFICIARY_AMOUNT_TIME_BUCKET', 'SAME_BATCH_ROW_REPEATED']
  return {
    businessIdempotencyKey: `bik_${intentId.slice(-10)}`,
    duplicateRiskFlag: isRisky,
    duplicateReasonCode: isRisky ? reasonPool[Math.floor(rand() * reasonPool.length)] : null,
    strictDuplicateFlag: false,
    possibleDuplicateClusterId: isRisky && rand() < 0.5 ? `dup_cluster_${Math.floor(rand() * 90 + 10)}` : null,
  }
}

function buildScores(
  rand: () => number,
  status: IntentLifecycleStatus,
  defensibilityScore: number,
  mappingConfidence: number,
  duplicateRiskFlag: boolean,
): CanonicalScores {
  // Deterministic structural scores per Service 2 §12 — derived from the same
  // signals the UI already exposes, no ML.
  const baseProof = status === 'failed' ? 55 : status === 'ambiguous' ? 70 : 88
  const proofReadinessScore = clamp(Math.round(baseProof + (rand() - 0.5) * 10 + (mappingConfidence - 80) * 0.3))
  const matchabilityScore = clamp(
    Math.round(proofReadinessScore - (status === 'failed' ? 18 : status === 'ambiguous' ? 8 : 0) + (rand() - 0.5) * 8),
  )
  const intentQualityScore = clamp(
    Math.round(
      0.4 * mappingConfidence +
        0.3 * proofReadinessScore +
        0.3 * defensibilityScore -
        (duplicateRiskFlag ? 12 : 0) +
        (rand() - 0.5) * 6,
    ),
  )
  return { proofReadinessScore, matchabilityScore, intentQualityScore }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n))
}

function buildGovernance(rand: () => number, status: IntentLifecycleStatus, duplicateRiskFlag: boolean): GovernanceOutcome {
  let state: GovernanceState
  const reasonCodes: string[] = []
  if (status === 'failed') {
    state = 'DLQ_TERMINAL'
    reasonCodes.push('REQUIRED_FIELD_MISSING')
  } else if (status === 'ambiguous') {
    state = 'REQUIRES_REVIEW'
    reasonCodes.push('LOW_MAPPING_CONFIDENCE')
  } else if (duplicateRiskFlag) {
    state = 'HOLD'
    reasonCodes.push('BUSINESS_DUPLICATE_RISK')
  } else if (status === 'pending') {
    state = 'READY_FOR_RELAY'
  } else {
    state = rand() < 0.5 ? 'READY_FOR_INTELLIGENCE' : 'READY_FOR_DISPATCH'
  }
  if (reasonCodes.length === 0) reasonCodes.push('VALID_TRUTH_BUILD')
  return { state, reasonCodes }
}

function pickIntentKind(rand: () => number): IntentKind {
  const r = rand()
  if (r < 0.6) return 'PAYOUT'
  if (r < 0.8) return 'VENDOR_DISBURSAL'
  if (r < 0.95) return 'SELLER_SETTLEMENT'
  return 'REFUND_PAYOUT'
}

function pickMode(rand: () => number): EvidenceMode {
  const r = rand()
  if (r < 0.7) return 'INTELLIGENCE_ATTACH'
  if (r < 0.92) return 'SECONDARY_DISPATCH'
  return 'FULL_CONTROL'
}

function shortHash(intentId: string, salt: string): string {
  let h = 2166136261
  const s = `${salt}:${intentId}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `sha256:${(h >>> 0).toString(16).padStart(8, '0')}…${(Math.imul(h, 31) >>> 0).toString(16).padStart(8, '0').slice(0, 6)}`
}

function buildIntentDetailFromSeed(intentId: string, batchId: string, shape: ScenarioShape): IntentDetail {
  const rand = rng(seedFromString(intentId))
  const status = pickStatusFromMix(rand, shape.statusMix)
  const firstName = pick(rand, FIRST_NAMES)
  const lastName = pick(rand, LAST_NAMES)
  const bank = pick(rand, BANKS)
  const accountLast4 = (1000 + Math.floor(rand() * 9000)).toString()
  const beneficiaryFull = tokenizeBeneficiaryFull(firstName, lastName, accountLast4, bank)
  const beneficiaryToken = generateBenToken(intentId)
  const amount = Math.round(shape.totalValue / shape.intentCount + (rand() - 0.5) * 800)
  const dispatchedAt = new Date(Date.now() - Math.floor(rand() * 18 * 60 * 1000))

  const [defLow, defHigh] = shape.defensibilityRange
  const defensibilityScore = defLow + Math.floor(rand() * (defHigh - defLow))

  const signals = buildSignals(rand, status, intentId, shape.primaryConnector, dispatchedAt)
  const lastSignalAt = signals.length > 0 ? signals[signals.length - 1].arrivedAt : null

  const mapping = buildMapping(rand, intentId, status)
  const idempotency = buildIdempotency(rand, intentId, status)
  const scores = buildScores(rand, status, defensibilityScore, mapping.mappingConfidenceScore, idempotency.duplicateRiskFlag)
  const governance = buildGovernance(rand, status, idempotency.duplicateRiskFlag)

  // Service 2 ingests before dispatch — seed ingestedAt slightly earlier.
  const ingestedAt = new Date(dispatchedAt.getTime() - (60 + Math.floor(rand() * 240)) * 1000)
  const intendedExecutionAt = rand() < 0.4
    ? new Date(dispatchedAt.getTime() + Math.floor(rand() * 4 * 60 * 60 * 1000)).toISOString()
    : null

  return {
    intentId,
    batchId,
    beneficiaryFull,
    beneficiaryToken,
    amount,
    currency: 'INR',
    rail: shape.rail,
    connector: shape.primaryConnector,
    status,
    defensibilityScore,
    dispatchedAt: dispatchedAt.toISOString(),
    lastSignalAt,
    lineage: buildLineage(rand, status, intentId, dispatchedAt),
    signals,
    attachment: buildAttachment(rand, shape.primaryConnector, shape.primaryConnectorType, shape.rail),
    variance: buildVariance(rand, status, amount),
    evidence: buildEvidence(rand, status, intentId, dispatchedAt),

    mode: pickMode(rand),
    intentKind: pickIntentKind(rand),
    clientPayoutRef: rand() < 0.85 ? `cli_pay_${intentId.slice(-6)}` : null,
    clientBatchRef: rand() < 0.7 ? `cli_batch_${batchId.slice(-6)}` : null,
    beneficiaryFingerprint: shortHash(intentId, 'benef_fp'),
    canonicalHash: shortHash(intentId, 'canonical'),
    ingestedAt: ingestedAt.toISOString(),
    intendedExecutionAt,
    mapping,
    idempotency,
    scores,
    governance,
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function buildSeededBatchFromScenario(scenarioId: SandboxScenarioId, batchId: string, scenarioName: string): SeededBatch {
  const shape = SCENARIO_SHAPES[scenarioId]
  const intents: IntentDetail[] = Array.from({ length: shape.intentCount }, (_, i) =>
    buildIntentDetailFromSeed(`${batchId}-INT-${(1001 + i).toString()}`, batchId, shape),
  )

  // Aggregate counts from the actual generated intents (not from the
  // distribution config) so the donut + KPIs are exact.
  const confirmedCount = intents.filter((x) => x.status === 'confirmed').length
  const ambiguousCount = intents.filter((x) => x.status === 'ambiguous').length
  const failedCount = intents.filter((x) => x.status === 'failed').length
  const totalValue = intents.reduce((s, x) => s + x.amount, 0)

  return {
    batchId,
    scenarioId,
    scenarioName,
    seededAt: new Date().toISOString(),
    batch: {
      batchId,
      type: 'Disbursement',
      source: 'Sandbox seed',
      totalValue,
      transactions: intents.length,
      confirmedCount,
      // High-confidence count = matched-but-not-yet-bank-confirmed; for sandbox we treat as a small slice of confirmed.
      highConfidenceCount: Math.round(confirmedCount * 0.06),
      mismatchCount: ambiguousCount,
      unresolvedCount: failedCount,
    },
    intents,
  }
}

/**
 * Returns deep details for any intent ID. For sandbox-seeded intents the caller
 * should pass the precomputed detail from the store. For canned-batch intents
 * (no precomputed detail), this generates deterministic details on the fly so
 * the drawer always renders something realistic.
 */
export function getCannedIntentDetail(
  intentId: string,
  batchId: string,
  fallback: { amount: number; method: string; partner: string },
): IntentDetail {
  // Generate against a synthetic shape derived from the row's known fields.
  const railFromMethod: Record<string, string> = {
    'Bank Transfer': 'NEFT',
    LSM: 'IMPS',
    NACH: 'NACH',
  }
  const shape: ScenarioShape = {
    intentCount: 1,
    totalValue: fallback.amount,
    rail: railFromMethod[fallback.method] ?? 'IMPS',
    primaryConnector: fallback.partner,
    primaryConnectorType: 'psp',
    statusMix: { created: 0, dispatched: 0, processing: 0, confirmed: 0.7, pending: 0.15, ambiguous: 0.1, failed: 0.05 },
    defensibilityRange: [60, 90],
  }
  return buildIntentDetailFromSeed(intentId, batchId, shape)
}
