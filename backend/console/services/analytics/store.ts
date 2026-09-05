import { randomUUID } from 'crypto'
import {
  AlertItem,
  AnalyticsDataset,
  AnalyticsEvent,
  DispatchAttempt,
  DlqItem,
  EvidencePack,
  FailureInstance,
  IntentRecord,
  OutcomeEvent,
  Rail,
  ReconResult,
  ReconSignal,
  SignalSource,
} from './types'
import { choose, clamp, round, seededRandom } from './utils'

const datasetByTenant = new Map<string, AnalyticsDataset>()

const RAILS: Rail[] = ['UPI', 'IMPS', 'NEFT', 'RTGS']
const PSPS = ['Razorpay', 'Cashfree', 'PayU', 'AxisDirect', 'Juspay']
const BANKS = ['HDFC0000123', 'ICIC0000456', 'SBIN0000789', 'UTIB0000122', 'KKBK0000199']
const SELLER_SEGMENTS = ['seller_alpha', 'seller_delta', 'seller_prime', 'seller_metro', 'seller_north']
const FAILURE_CODES = [
  { category: 'PSP_ERROR', code: 'GATEWAY_TIMEOUT' },
  { category: 'PSP_ERROR', code: 'PSP_SYSTEM_ERROR' },
  { category: 'DATA_QUALITY', code: 'INVALID_IFSC' },
  { category: 'DATA_QUALITY', code: 'INVALID_ACCOUNT_FORMAT' },
  { category: 'GOVERNANCE', code: 'WATCHLIST_HIT' },
  { category: 'GOVERNANCE', code: 'LIMIT_EXCEEDED' },
  { category: 'RAIL_ISSUE', code: 'RAIL_OUTAGE' },
  { category: 'RAIL_ISSUE', code: 'BANK_DOWNTIME' },
]

function railSlaMs(rail: Rail): number {
  switch (rail) {
    case 'UPI':
      return 10_000
    case 'IMPS':
      return 30_000
    case 'NEFT':
      return 90 * 60_000
    case 'RTGS':
      return 30 * 60_000
    default:
      return 60_000
  }
}

function generateIntentRecords(tenantId: string, count = 540): AnalyticsDataset {
  const rng = seededRandom(`${tenantId}:zord:v1`)
  const now = Date.now()

  const intents: IntentRecord[] = []
  const dispatchAttempts: DispatchAttempt[] = []
  const outcomes: OutcomeEvent[] = []
  const reconSignals: ReconSignal[] = []
  const failures: FailureInstance[] = []
  const evidencePacks: EvidencePack[] = []
  const dlqItems: DlqItem[] = []
  const alerts: AlertItem[] = []

  for (let i = 0; i < count; i += 1) {
    const createdLagMs = Math.floor(rng() * 9.5 * 24 * 60 * 60 * 1000)
    const createdAt = new Date(now - createdLagMs)
    const rail = choose(rng, RAILS)
    const psp = choose(rng, PSPS)
    const bankIfsc = choose(rng, BANKS)

    const intentId = `intent_${createdAt.getTime()}_${String(i).padStart(4, '0')}`
    const envelopeId = `env_${createdAt.getTime()}_${Math.floor(rng() * 9999)}`
    const clientReferenceId = `client_${Math.floor(100000 + rng() * 899999)}`
    const sellerId = choose(rng, SELLER_SEGMENTS)
    const amount = round((rng() * 220_000) + 1500, 2)
    const dispatchDelayMs = Math.floor((0.2 + rng()) * 9_000)

    let status: IntentRecord['status'] = 'CONFIRMED'
    const statusRoll = rng()
    if (statusRoll > 0.86 && statusRoll <= 0.93) status = 'FAILED'
    if (statusRoll > 0.93 && statusRoll <= 0.98) status = 'PENDING'
    if (statusRoll > 0.98) status = 'REVERSED'

    const dispatchedAt = new Date(createdAt.getTime() + dispatchDelayMs)
    const finalityLagMs = Math.floor((0.8 + rng() * 3.5) * railSlaMs(rail))

    let confirmedAt: Date | undefined
    let settledAt: Date | undefined
    if (status === 'CONFIRMED' || status === 'REVERSED') {
      confirmedAt = new Date(dispatchedAt.getTime() + finalityLagMs)
      settledAt = new Date(confirmedAt.getTime() + (5 + rng() * 50) * 60_000)
    }

    const slaDeadlineAt = new Date(dispatchedAt.getTime() + railSlaMs(rail))

    const moneyAtRiskReason =
      status === 'PENDING'
        ? (rng() > 0.5 ? 'SLA_BREACH_PENDING' : 'CORRELATION_AMBIGUOUS')
        : status === 'REVERSED'
          ? 'REVERSED_AFTER_SUCCESS'
          : undefined

    const intent: IntentRecord = {
      tenantId,
      intentId,
      envelopeId,
      clientReferenceId,
      sellerId,
      amount,
      currency: 'INR',
      psp,
      rail,
      bankIfsc,
      status,
      createdAt: createdAt.toISOString(),
      dispatchedAt: dispatchedAt.toISOString(),
      confirmedAt: confirmedAt?.toISOString(),
      settledAt: settledAt?.toISOString(),
      slaDeadlineAt: slaDeadlineAt.toISOString(),
      beneficiaryToken: `ben_${Math.floor(rng() * 1_000_000_000)}`,
      utr: `UTR${Math.floor(10_000_000 + rng() * 89_999_999)}`,
      moneyAtRiskReason,
    }

    intents.push(intent)

    const attemptCount = status === 'FAILED' || status === 'REVERSED' ? (rng() > 0.4 ? 2 : 1) : 1
    for (let a = 1; a <= attemptCount; a += 1) {
      const attemptFailure = a < attemptCount
      const code = choose(rng, FAILURE_CODES)
      const latencyMs = Math.floor(400 + rng() * 10_500)
      const occurredAt = new Date(dispatchedAt.getTime() + a * 1200)

      const attempt: DispatchAttempt = {
        tenantId,
        intentId,
        attemptNo: a,
        psp,
        rail,
        status: attemptFailure ? 'FAILED' : (status === 'FAILED' ? 'FAILED' : 'SUCCESS'),
        latencyMs,
        errorCode: attemptFailure || status === 'FAILED' ? code.code : undefined,
        errorCategory: attemptFailure || status === 'FAILED' ? code.category : undefined,
        occurredAt: occurredAt.toISOString(),
        isRetry: a > 1,
      }
      dispatchAttempts.push(attempt)

      if (attempt.status === 'FAILED') {
        failures.push({
          tenantId,
          intentId,
          psp,
          rail,
          bankIfsc,
          errorCategory: code.category as FailureInstance['errorCategory'],
          errorCode: code.code,
          occurredAt: occurredAt.toISOString(),
          retrySuccess: status !== 'FAILED',
          resolutionSeconds: status === 'FAILED' ? Math.floor(180 + rng() * 900) : Math.floor(60 + rng() * 240),
        })

        if (status === 'FAILED' && rng() > 0.72) {
          dlqItems.push({
          dlqId: randomUUID(),
            tenantId,
            intentId,
            eventTopic: 'dispatch_attempts',
            errorCategory: code.category,
            errorCode: code.code,
            errorMessage: `${code.code} observed on ${psp}`,
            replayable: code.category !== 'DATA_QUALITY' && code.category !== 'GOVERNANCE',
            createdAt: occurredAt.toISOString(),
          })
        }
      }
    }

    outcomes.push({
      tenantId,
      intentId,
      status: status === 'CONFIRMED' ? 'CONFIRMED' : status === 'PENDING' ? 'PENDING' : status,
      pspStatus: status === 'CONFIRMED' ? 'PROCESSED' : status,
      railStatus: status === 'CONFIRMED' ? 'SETTLED' : status,
      webhookDelivered: rng() > 0.05,
      utr: intent.utr,
      amount,
      occurredAt: (confirmedAt || dispatchedAt).toISOString(),
    })

    const signalSources: SignalSource[] =
      status === 'CONFIRMED'
        ? ['WEBHOOK', 'POLLING', 'BANK_STATEMENT']
        : status === 'PENDING'
          ? ['WEBHOOK', 'POLLING']
          : ['WEBHOOK']

    signalSources.forEach((source, idx) => {
      reconSignals.push({
        tenantId,
        intentId,
        source,
        utr: intent.utr,
        amount: round(amount + (source === 'BANK_STATEMENT' && status === 'REVERSED' ? 30 : 0), 2),
        signalTimestamp: new Date((confirmedAt || dispatchedAt).getTime() + idx * 5_000).toISOString(),
        signatureHash: `sig_${Math.floor(rng() * 1_000_000_000)}`,
      })
    })

    evidencePacks.push({
      tenantId,
      intentId,
      status: status === 'CONFIRMED' ? (rng() > 0.08 ? 'READY' : 'PARTIAL') : status === 'PENDING' ? 'PARTIAL' : 'MISSING',
      completenessPct: status === 'CONFIRMED' ? round(82 + rng() * 18, 2) : status === 'PENDING' ? round(40 + rng() * 28, 2) : round(10 + rng() * 20, 2),
      readyAt: status === 'CONFIRMED' ? new Date((confirmedAt || dispatchedAt).getTime() + 12_000).toISOString() : undefined,
      exportedAt: status === 'CONFIRMED' && rng() > 0.8 ? new Date((confirmedAt || dispatchedAt).getTime() + 30_000).toISOString() : undefined,
    })
  }

  const reconResults = computeReconResults(intents, reconSignals)

  // Alert synthesis from latest dataset state.
  const activeDlq = dlqItems.filter((item) => Date.now() - new Date(item.createdAt).getTime() < 12 * 60 * 60 * 1000)
  const pendingBreach = intents.filter((intent) => intent.status === 'PENDING' && new Date(intent.slaDeadlineAt).getTime() < now)

  if (pendingBreach.length > 0) {
    alerts.push({
      alertId: randomUUID(),
      tenantId,
      severity: 'CRITICAL',
      title: 'SLA breach cluster detected',
      description: `${pendingBreach.length} payouts breached rail SLA and remain unresolved`,
      status: 'ACTIVE',
      timestamp: new Date(now - 80_000).toISOString(),
    })
  }

  if (activeDlq.length > 0) {
    alerts.push({
      alertId: randomUUID(),
      tenantId,
      severity: 'HIGH',
      title: 'Exception queue depth elevated',
      description: `${activeDlq.length} replayable items in DLQ`,
      status: 'ACTIVE',
      timestamp: new Date(now - 260_000).toISOString(),
    })
  }

  alerts.push({
    alertId: randomUUID(),
    tenantId,
    severity: 'MEDIUM',
    title: 'Webhook degradation on PayU',
    description: 'Delivery success dipped below 96% in last 60 minutes',
    status: 'ACTIVE',
    timestamp: new Date(now - 620_000).toISOString(),
  })

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    intents,
    dispatchAttempts,
    outcomes,
    reconSignals,
    reconResults,
    failures,
    evidencePacks,
    dlqItems,
    alerts,
    dedup: new Set<string>(),
  }
}

function computeReconResults(intents: IntentRecord[], signals: ReconSignal[]): ReconResult[] {
  const byIntent = new Map<string, ReconSignal[]>()
  signals.forEach((signal) => {
    const list = byIntent.get(signal.intentId) || []
    list.push(signal)
    byIntent.set(signal.intentId, list)
  })

  return intents.map((intent) => {
    const list = byIntent.get(intent.intentId) || []
    const sourceSet = new Set(list.map((signal) => signal.source))
    const amounts = list.map((signal) => signal.amount)
    const utrSet = new Set(list.map((signal) => signal.utr).filter(Boolean))

    const minAmount = amounts.length ? Math.min(...amounts) : intent.amount
    const maxAmount = amounts.length ? Math.max(...amounts) : intent.amount
    const amountVariance = round(maxAmount - minAmount, 2)

    const signalCount = sourceSet.size
    const fullThreeSignal = signalCount >= 3
    const utrConsistent = utrSet.size <= 1

    const scoreBase = signalCount * 28
    const scoreAmount = amountVariance < 0.01 ? 26 : amountVariance < 50 ? 12 : 3
    const scoreUtr = utrConsistent ? 16 : 5
    const confidenceScore = clamp(round(scoreBase + scoreAmount + scoreUtr, 2), 0, 100)

    let state: ReconResult['state'] = 'PROVISIONAL'
    if (fullThreeSignal && amountVariance < 0.01 && utrConsistent) state = 'CONFIRMED'
    else if (amountVariance >= 0.01 || !utrConsistent) state = 'VARIANT'

    return {
      tenantId: intent.tenantId,
      intentId: intent.intentId,
      state,
      confidenceScore,
      signalCount,
      fullThreeSignal,
      amountVariance,
      utrConsistent,
      provisionalAt: intent.dispatchedAt,
      confirmedAt: state === 'CONFIRMED' ? intent.confirmedAt : undefined,
      crossPeriod: Boolean(intent.settledAt && intent.confirmedAt && new Date(intent.settledAt).getDate() !== new Date(intent.confirmedAt).getDate()),
    }
  })
}

export function getDataset(tenantId: string): AnalyticsDataset {
  const existing = datasetByTenant.get(tenantId)
  if (existing) {
    return existing
  }

  const seeded = generateIntentRecords(tenantId)
  datasetByTenant.set(tenantId, seeded)
  return seeded
}

export function ingestEvent(event: AnalyticsEvent): { accepted: boolean; reason?: string } {
  const dataset = getDataset(event.tenant_id)
  const dedupKey = `${event.intent_id}:${event.event_type}:${event.event_version}`
  if (dataset.dedup.has(dedupKey)) {
    return { accepted: false, reason: 'DUPLICATE' }
  }

  dataset.dedup.add(dedupKey)

  const eventAt = event.occurred_at || new Date().toISOString()

  try {
    if (event.source_topic === 'outcome_events') {
      const payload = event.payload || {}
      dataset.outcomes.unshift({
        tenantId: event.tenant_id,
        intentId: event.intent_id,
        status: (String(payload.status || 'PENDING').toUpperCase() as OutcomeEvent['status']),
        pspStatus: String(payload.psp_status || payload.status || 'UNKNOWN'),
        railStatus: String(payload.rail_status || payload.status || 'UNKNOWN'),
        webhookDelivered: Boolean(payload.webhook_delivered),
        utr: String(payload.utr || ''),
        amount: Number(payload.amount || 0),
        occurredAt: eventAt,
      })
    }

    if (event.source_topic === 'recon_signals') {
      const payload = event.payload || {}
      dataset.reconSignals.push({
        tenantId: event.tenant_id,
        intentId: event.intent_id,
        source: (String(payload.source || 'WEBHOOK').toUpperCase() as ReconSignal['source']),
        utr: String(payload.utr || ''),
        amount: Number(payload.amount || 0),
        signalTimestamp: eventAt,
        signatureHash: String(payload.signature_hash || 'sig_runtime'),
      })
      dataset.reconResults = computeReconResults(dataset.intents, dataset.reconSignals)
    }

    if (event.source_topic === 'dispatch_attempts') {
      const payload = event.payload || {}
      dataset.dispatchAttempts.unshift({
        tenantId: event.tenant_id,
        intentId: event.intent_id,
        attemptNo: Number(payload.attempt_no || 1),
        psp: String(payload.psp || 'Unknown'),
        rail: (String(payload.rail || 'UPI').toUpperCase() as Rail),
        status: (String(payload.status || 'FAILED').toUpperCase() as DispatchAttempt['status']),
        latencyMs: Number(payload.latency_ms || 0),
        errorCode: payload.error_code ? String(payload.error_code) : undefined,
        errorCategory: payload.error_category ? String(payload.error_category) : undefined,
        occurredAt: eventAt,
        isRetry: Boolean(payload.is_retry),
      })
    }

    return { accepted: true }
  } catch (error) {
    dataset.dlqItems.unshift({
      dlqId: randomUUID(),
      tenantId: event.tenant_id,
      intentId: event.intent_id,
      eventTopic: event.source_topic,
      errorCategory: 'DATA_QUALITY',
      errorCode: 'EVENT_PARSE_FAILURE',
      errorMessage: error instanceof Error ? error.message : 'Unknown event parse error',
      replayable: true,
      createdAt: new Date().toISOString(),
    })
    return { accepted: false, reason: 'DLQ' }
  }
}

export function recentExportQueue(tenantId: string): Array<{ id: string; kind: 'EVIDENCE' | 'COMPLIANCE'; status: 'QUEUED' | 'PROCESSING' | 'READY'; created_at: string }> {
  const dataset = getDataset(tenantId)
  const recentEvidence = dataset.evidencePacks
    .filter((pack) => Boolean(pack.exportedAt))
    .slice(0, 5)
    .map((pack) => ({
      id: `ev_${pack.intentId}`,
      kind: 'EVIDENCE' as const,
      status: 'READY' as const,
      created_at: pack.exportedAt || pack.readyAt || new Date().toISOString(),
    }))

  if (recentEvidence.length > 0) return recentEvidence

  return [
    { id: `ev_bootstrap_${tenantId.slice(0, 6)}`, kind: 'EVIDENCE', status: 'PROCESSING', created_at: new Date().toISOString() },
  ]
}
