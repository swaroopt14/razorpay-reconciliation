export type Rail = 'UPI' | 'IMPS' | 'NEFT' | 'RTGS'
export type Persona = 'ECOMMERCE' | 'NBFC' | 'B2B_SAAS' | 'OPS_ENGINEERING'
export type ReconState = 'PROVISIONAL' | 'CONFIRMED' | 'VARIANT'
export type SignalSource = 'WEBHOOK' | 'POLLING' | 'BANK_STATEMENT'

export interface AnalyticsEvent {
  tenant_id: string
  intent_id: string
  event_type: string
  event_version: number
  occurred_at: string
  source_topic: 'intent_events' | 'dispatch_attempts' | 'outcome_events' | 'recon_signals'
  payload: Record<string, unknown>
  correlation_id?: string
}

export interface IntentRecord {
  tenantId: string
  intentId: string
  envelopeId: string
  clientReferenceId: string
  sellerId: string
  amount: number
  currency: string
  psp: string
  rail: Rail
  bankIfsc: string
  status: 'INTENT_CREATED' | 'DISPATCHED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVERSED'
  createdAt: string
  dispatchedAt?: string
  confirmedAt?: string
  settledAt?: string
  slaDeadlineAt: string
  beneficiaryToken: string
  utr: string
  moneyAtRiskReason?: 'SLA_BREACH_PENDING' | 'CORRELATION_AMBIGUOUS' | 'REVERSED_AFTER_SUCCESS'
}

export interface DispatchAttempt {
  tenantId: string
  intentId: string
  attemptNo: number
  psp: string
  rail: Rail
  status: 'SUCCESS' | 'FAILED'
  latencyMs: number
  errorCode?: string
  errorCategory?: string
  occurredAt: string
  isRetry: boolean
}

export interface OutcomeEvent {
  tenantId: string
  intentId: string
  status: 'CONFIRMED' | 'FAILED' | 'PENDING' | 'REVERSED'
  pspStatus: string
  railStatus: string
  webhookDelivered: boolean
  utr: string
  amount: number
  occurredAt: string
}

export interface ReconSignal {
  tenantId: string
  intentId: string
  source: SignalSource
  utr: string
  amount: number
  signalTimestamp: string
  signatureHash: string
}

export interface ReconResult {
  tenantId: string
  intentId: string
  state: ReconState
  confidenceScore: number
  signalCount: number
  fullThreeSignal: boolean
  amountVariance: number
  utrConsistent: boolean
  provisionalAt?: string
  confirmedAt?: string
  crossPeriod: boolean
}

export interface FailureInstance {
  tenantId: string
  intentId: string
  psp: string
  rail: Rail
  bankIfsc: string
  errorCategory: 'PSP_ERROR' | 'DATA_QUALITY' | 'GOVERNANCE' | 'RAIL_ISSUE'
  errorCode: string
  occurredAt: string
  retrySuccess?: boolean
  resolutionSeconds?: number
}

export interface EvidencePack {
  tenantId: string
  intentId: string
  status: 'READY' | 'PARTIAL' | 'MISSING'
  completenessPct: number
  readyAt?: string
  exportedAt?: string
}

export interface DlqItem {
  dlqId: string
  tenantId: string
  intentId: string
  eventTopic: string
  errorCategory: string
  errorCode: string
  errorMessage: string
  replayable: boolean
  createdAt: string
}

export interface AlertItem {
  alertId: string
  tenantId: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  title: string
  description: string
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
  timestamp: string
}

export interface AnalyticsDataset {
  tenantId: string
  generatedAt: string
  intents: IntentRecord[]
  dispatchAttempts: DispatchAttempt[]
  outcomes: OutcomeEvent[]
  reconSignals: ReconSignal[]
  reconResults: ReconResult[]
  failures: FailureInstance[]
  evidencePacks: EvidencePack[]
  dlqItems: DlqItem[]
  alerts: AlertItem[]
  dedup: Set<string>
}

export interface SearchResult {
  type: 'INTENT' | 'ENVELOPE' | 'CLIENT_REFERENCE' | 'UTR' | 'SELLER'
  id: string
  display: string
  matched_on: string
  updated_ago: string
}

export interface TrendPoint {
  bucket: string
  value: number
  secondary?: number
}

export interface NamedValue {
  name: string
  value: number
}

export interface HeatCell {
  x: string
  y: string
  value: number
}

export interface HistogramBucket {
  label: string
  count: number
}

export interface ExportQueueItem {
  id: string
  kind: 'EVIDENCE' | 'COMPLIANCE'
  status: 'QUEUED' | 'PROCESSING' | 'READY'
  created_at: string
}
