export type EnvironmentMode = 'sandbox' | 'preprod' | 'live'

export type KillSwitchState = 'ACTIVE' | 'FROZEN'

export type IntentStatus =
  | 'RECEIVED'
  | 'CANONICALIZED'
  | 'READY_FOR_RELAY'
  | 'RELAYED'
  | 'OUTCOME_RECEIVED'
  | 'FUSED_SUCCESS'
  | 'EXCEPTION'
  | 'DLQ'

export interface EnvironmentHudConfig {
  label: string
  capsLabel: string
  quotaUsedPct: number
  expiryDate: string
  killSwitch: KillSwitchState
  maxAmountInr: number
  intentsPerDay: number
}

export const ENVIRONMENT_HUD: Record<EnvironmentMode, EnvironmentHudConfig> = {
  sandbox: {
    label: 'SANDBOX',
    capsLabel: 'Cap: 5,000 intents/day • Max: ₹1,00,000/intent',
    quotaUsedPct: 60,
    expiryDate: '2026-03-20T23:59:00+05:30',
    killSwitch: 'ACTIVE',
    maxAmountInr: 100000,
    intentsPerDay: 5000,
  },
  preprod: {
    label: 'PREPROD',
    capsLabel: 'Cap: 20,000 intents/day • Max: ₹5,00,000/intent',
    quotaUsedPct: 42,
    expiryDate: '2026-06-30T23:59:00+05:30',
    killSwitch: 'ACTIVE',
    maxAmountInr: 500000,
    intentsPerDay: 20000,
  },
  live: {
    label: 'LIVE',
    capsLabel: 'Production mode • Regulatory controls enforced',
    quotaUsedPct: 31,
    expiryDate: '2099-12-31T23:59:00+05:30',
    killSwitch: 'ACTIVE',
    maxAmountInr: 2500000,
    intentsPerDay: 200000,
  },
}

export const STATUS_DEFINITIONS: Record<IntentStatus, string> = {
  RECEIVED: 'Envelope accepted and trace established.',
  CANONICALIZED: 'Raw payload transformed into canonical intent schema.',
  READY_FOR_RELAY: 'Validation and policy checks passed for relay stage.',
  RELAYED: 'Downstream relay dispatched with deterministic envelope hash.',
  OUTCOME_RECEIVED: 'Provider outcome received and linked to trace.',
  FUSED_SUCCESS: 'Fusion completed and final ledger state recorded.',
  EXCEPTION: 'Flow failed deterministic rule checks and needs action.',
  DLQ: 'Flow diverted to dead-letter queue after retries.',
}

export interface ValidationConfidenceRow {
  field: string
  source: string
  transform: string
  confidence: number
  ruleId: string
}

export interface IntentTimelineStep {
  status: IntentStatus
  timestamp: string
  durationMs: number
  retryCount: number
  ruleIds: string[]
}

export interface IntentRecord {
  intentId: string
  envelopeId: string
  traceId: string
  tenantId: string
  status: IntentStatus
  amount: number
  currency: 'INR'
  confidence: number
  schemaVersion: string
  replayed: boolean
  replayCount: number
  canonicalHash: string
  providerRefToken: string
  finalState: 'SETTLED' | 'FAILED' | 'PENDING' | 'REFUNDED'
  reasonCode: string
  createdAt: string
  canonicalIntent: Record<string, unknown>
  validationRows: ValidationConfidenceRow[]
  timeline: IntentTimelineStep[]
  evidencePackId: string
}

export const SANDBOX_TENANTS = ['demo-merchant-in', 'acmepay-india', 'beta-issuer-in']

export const SANDBOX_INTENTS: IntentRecord[] = [
  {
    intentId: 'c6b25dde-3be0-4955-a410-e3a554e9f603',
    envelopeId: '29e090b7-00b0-4a41-97f3-8aa5ece282a8',
    traceId: 'tr_01J3ZORD7QAYNC6T0M9SZC3T9V',
    tenantId: 'demo-merchant-in',
    status: 'FUSED_SUCCESS',
    amount: 12500,
    currency: 'INR',
    confidence: 0.97,
    schemaVersion: 'intent.request.v1',
    replayed: false,
    replayCount: 0,
    canonicalHash: 'sha256:2cf12e6e77f57fd9c8d84aee5f8ef6b937f9d8f0ad4fa2f9db8bb6f2f4ef1802',
    providerRefToken: 'prov_tok_9a13...96cd',
    finalState: 'SETTLED',
    reasonCode: 'OK_FINAL',
    createdAt: '2026-02-26T09:05:12+05:30',
    canonicalIntent: {
      intent_type: 'payment',
      beneficiary_account_token: 'acct_tok_99a2...fa11',
      beneficiary_name_token: 'name_tok_1ab2...8def',
      payer_token: 'payer_tok_57aa...1709',
      amount: { value: '12500.00', currency: 'INR' },
      purpose_code: 'OPS_SETTLEMENT',
      schema_version: 'intent.request.v1',
    },
    validationRows: [
      { field: 'amount', source: 'raw.amount', transform: 'parse_decimal', confidence: 1, ruleId: 'MAP_001' },
      { field: 'beneficiary', source: 'kyc_adapter', transform: 'tokenize_name', confidence: 0.83, ruleId: 'MAP_014' },
      { field: 'account', source: 'bank_adapter', transform: 'tokenize_account', confidence: 0.95, ruleId: 'MAP_101' },
    ],
    timeline: [
      { status: 'RECEIVED', timestamp: '2026-02-26T09:05:12+05:30', durationMs: 142, retryCount: 0, ruleIds: ['ING_001'] },
      { status: 'CANONICALIZED', timestamp: '2026-02-26T09:05:13+05:30', durationMs: 278, retryCount: 0, ruleIds: ['MAP_001', 'MAP_014', 'MAP_101'] },
      { status: 'READY_FOR_RELAY', timestamp: '2026-02-26T09:05:14+05:30', durationMs: 201, retryCount: 0, ruleIds: ['VAL_009', 'RISK_112'] },
      { status: 'RELAYED', timestamp: '2026-02-26T09:05:14+05:30', durationMs: 340, retryCount: 0, ruleIds: ['OUT_003'] },
      { status: 'OUTCOME_RECEIVED', timestamp: '2026-02-26T09:05:17+05:30', durationMs: 490, retryCount: 0, ruleIds: ['OCM_002'] },
      { status: 'FUSED_SUCCESS', timestamp: '2026-02-26T09:05:18+05:30', durationMs: 180, retryCount: 0, ruleIds: ['FUS_001'] },
    ],
    evidencePackId: 'ep_20260226_0001',
  },
  {
    intentId: '36946304-2154-419f-b3c5-4d6f18c4882f',
    envelopeId: '481418bf-f82a-48e3-869a-0d4584340390',
    traceId: 'tr_01J3ZORD8KA2XVFYPK2J8GJ9NV',
    tenantId: 'demo-merchant-in',
    status: 'EXCEPTION',
    amount: 8900,
    currency: 'INR',
    confidence: 0.92,
    schemaVersion: 'intent.request.v1',
    replayed: true,
    replayCount: 1,
    canonicalHash: 'sha256:0d17baad70ec203aa454f59b02f0cb25b85833eca8ad39d59c83e78510e4794f',
    providerRefToken: 'prov_tok_3f67...cd02',
    finalState: 'PENDING',
    reasonCode: 'WEBHOOK_FAILURE',
    createdAt: '2026-02-26T10:11:04+05:30',
    canonicalIntent: {
      intent_type: 'payment',
      beneficiary_account_token: 'acct_tok_1cd9...ccaa',
      beneficiary_name_token: 'name_tok_1987...0abc',
      payer_token: 'payer_tok_6f10...22ab',
      amount: { value: '8900.00', currency: 'INR' },
      purpose_code: 'MERCHANT_CAPTURE',
      schema_version: 'intent.request.v1',
    },
    validationRows: [
      { field: 'amount', source: 'raw.amount', transform: 'parse_decimal', confidence: 1, ruleId: 'MAP_001' },
      { field: 'beneficiary', source: 'kyc_adapter', transform: 'tokenize_name', confidence: 0.79, ruleId: 'MAP_014' },
      { field: 'account', source: 'bank_adapter', transform: 'tokenize_account', confidence: 0.89, ruleId: 'MAP_101' },
    ],
    timeline: [
      { status: 'RECEIVED', timestamp: '2026-02-26T10:11:04+05:30', durationMs: 161, retryCount: 0, ruleIds: ['ING_001'] },
      { status: 'CANONICALIZED', timestamp: '2026-02-26T10:11:05+05:30', durationMs: 288, retryCount: 0, ruleIds: ['MAP_001', 'MAP_014', 'MAP_101'] },
      { status: 'READY_FOR_RELAY', timestamp: '2026-02-26T10:11:05+05:30', durationMs: 233, retryCount: 0, ruleIds: ['VAL_009', 'RISK_112'] },
      { status: 'RELAYED', timestamp: '2026-02-26T10:11:06+05:30', durationMs: 402, retryCount: 1, ruleIds: ['OUT_003', 'RET_011'] },
      { status: 'OUTCOME_RECEIVED', timestamp: '2026-02-26T10:11:39+05:30', durationMs: 33000, retryCount: 2, ruleIds: ['OCM_011'] },
      { status: 'EXCEPTION', timestamp: '2026-02-26T10:11:39+05:30', durationMs: 90, retryCount: 0, ruleIds: ['EXC_403'] },
    ],
    evidencePackId: 'ep_20260226_0002',
  },
  {
    intentId: '5ec7c23c-b254-4429-bccf-77e8a0b1345b',
    envelopeId: '0f77b9c4-98b8-4a4a-88d4-ef12b9a3c0aa',
    traceId: 'tr_01J3ZORD9FR6KYZV7HS4NNXQK5',
    tenantId: 'acmepay-india',
    status: 'DLQ',
    amount: 2100,
    currency: 'INR',
    confidence: 0.88,
    schemaVersion: 'intent.request.v1',
    replayed: true,
    replayCount: 2,
    canonicalHash: 'sha256:8423d6f6a74a49036d1a7ba0454c9c1f54837d3d250779ced8eac73fd0443c58',
    providerRefToken: 'prov_tok_0ae7...1d99',
    finalState: 'FAILED',
    reasonCode: 'DLQ_PUBLISH_ERROR',
    createdAt: '2026-02-26T11:29:41+05:30',
    canonicalIntent: {
      intent_type: 'refund',
      beneficiary_account_token: 'acct_tok_2e07...cc14',
      beneficiary_name_token: 'name_tok_71af...11dc',
      payer_token: 'payer_tok_0de1...994a',
      amount: { value: '2100.00', currency: 'INR' },
      purpose_code: 'REFUND',
      schema_version: 'intent.request.v1',
    },
    validationRows: [
      { field: 'amount', source: 'raw.amount', transform: 'parse_decimal', confidence: 1, ruleId: 'MAP_001' },
      { field: 'beneficiary', source: 'kyc_adapter', transform: 'tokenize_name', confidence: 0.74, ruleId: 'MAP_014' },
      { field: 'account', source: 'bank_adapter', transform: 'tokenize_account', confidence: 0.86, ruleId: 'MAP_101' },
    ],
    timeline: [
      { status: 'RECEIVED', timestamp: '2026-02-26T11:29:41+05:30', durationMs: 136, retryCount: 0, ruleIds: ['ING_001'] },
      { status: 'CANONICALIZED', timestamp: '2026-02-26T11:29:42+05:30', durationMs: 271, retryCount: 0, ruleIds: ['MAP_001', 'MAP_014', 'MAP_101'] },
      { status: 'READY_FOR_RELAY', timestamp: '2026-02-26T11:29:42+05:30', durationMs: 224, retryCount: 0, ruleIds: ['VAL_009'] },
      { status: 'RELAYED', timestamp: '2026-02-26T11:29:43+05:30', durationMs: 421, retryCount: 3, ruleIds: ['RET_011', 'OUT_003'] },
      { status: 'DLQ', timestamp: '2026-02-26T11:29:52+05:30', durationMs: 9000, retryCount: 0, ruleIds: ['DLQ_001'] },
    ],
    evidencePackId: 'ep_20260226_0003',
  },
  {
    intentId: 'a0a7f1d1-7b16-4d3a-9b1f-7b7b7e5d7c11',
    envelopeId: '9afc5ac2-fbc8-4baf-b9e2-8c1a65c9492c',
    traceId: 'tr_01J3ZORDBHFA3ESX5SZMZ6N6MP',
    tenantId: 'acmepay-india',
    status: 'FUSED_SUCCESS',
    amount: 56000,
    currency: 'INR',
    confidence: 0.95,
    schemaVersion: 'intent.request.v2',
    replayed: false,
    replayCount: 0,
    canonicalHash: 'sha256:a852859fb4b54793229d4f8d860f92f7af8bc8e35f41a04a686d4d1f061db51e',
    providerRefToken: 'prov_tok_45bc...8899',
    finalState: 'SETTLED',
    reasonCode: 'OK_FINAL',
    createdAt: '2026-02-26T12:55:09+05:30',
    canonicalIntent: {
      intent_type: 'payout',
      beneficiary_account_token: 'acct_tok_6aca...b5a9',
      beneficiary_name_token: 'name_tok_29db...4f11',
      payer_token: 'payer_tok_84ca...f00c',
      amount: { value: '56000.00', currency: 'INR' },
      purpose_code: 'VENDOR_PAYOUT',
      schema_version: 'intent.request.v2',
    },
    validationRows: [
      { field: 'amount', source: 'raw.amount', transform: 'parse_decimal', confidence: 1, ruleId: 'MAP_001' },
      { field: 'beneficiary', source: 'kyb_adapter', transform: 'tokenize_name', confidence: 0.82, ruleId: 'MAP_211' },
      { field: 'account', source: 'bank_adapter', transform: 'tokenize_account', confidence: 0.96, ruleId: 'MAP_101' },
    ],
    timeline: [
      { status: 'RECEIVED', timestamp: '2026-02-26T12:55:09+05:30', durationMs: 148, retryCount: 0, ruleIds: ['ING_001'] },
      { status: 'CANONICALIZED', timestamp: '2026-02-26T12:55:10+05:30', durationMs: 264, retryCount: 0, ruleIds: ['MAP_001', 'MAP_211', 'MAP_101'] },
      { status: 'READY_FOR_RELAY', timestamp: '2026-02-26T12:55:10+05:30', durationMs: 220, retryCount: 0, ruleIds: ['VAL_009', 'RISK_112'] },
      { status: 'RELAYED', timestamp: '2026-02-26T12:55:11+05:30', durationMs: 310, retryCount: 0, ruleIds: ['OUT_003'] },
      { status: 'OUTCOME_RECEIVED', timestamp: '2026-02-26T12:55:14+05:30', durationMs: 410, retryCount: 0, ruleIds: ['OCM_002'] },
      { status: 'FUSED_SUCCESS', timestamp: '2026-02-26T12:55:15+05:30', durationMs: 175, retryCount: 0, ruleIds: ['FUS_001'] },
    ],
    evidencePackId: 'ep_20260226_0004',
  },
  {
    intentId: 'c1c2b3a4-1111-4f22-9f33-abcdefabcdef',
    envelopeId: '01e4e8e1-1883-4d0f-b3de-f5344f587e35',
    traceId: 'tr_01J3ZORDFW85H0K89J7N8GHXAB',
    tenantId: 'beta-issuer-in',
    status: 'OUTCOME_RECEIVED',
    amount: 4200,
    currency: 'INR',
    confidence: 0.9,
    schemaVersion: 'intent.request.v2',
    replayed: false,
    replayCount: 0,
    canonicalHash: 'sha256:e41b2f0ea1365aa512783f36751ed8fd6e8f5dfc7e8ef67fd6c26f40bd4bdad6',
    providerRefToken: 'prov_tok_99ef...21aa',
    finalState: 'PENDING',
    reasonCode: 'OUTCOME_PENDING',
    createdAt: '2026-02-26T13:44:31+05:30',
    canonicalIntent: {
      intent_type: 'refund',
      beneficiary_account_token: 'acct_tok_1309...7aaf',
      beneficiary_name_token: 'name_tok_9cb1...8fe2',
      payer_token: 'payer_tok_055c...1bb4',
      amount: { value: '4200.00', currency: 'INR' },
      purpose_code: 'CUSTOMER_REFUND',
      schema_version: 'intent.request.v2',
    },
    validationRows: [
      { field: 'amount', source: 'raw.amount', transform: 'parse_decimal', confidence: 1, ruleId: 'MAP_001' },
      { field: 'beneficiary', source: 'kyc_adapter', transform: 'tokenize_name', confidence: 0.8, ruleId: 'MAP_014' },
      { field: 'account', source: 'bank_adapter', transform: 'tokenize_account', confidence: 0.91, ruleId: 'MAP_101' },
    ],
    timeline: [
      { status: 'RECEIVED', timestamp: '2026-02-26T13:44:31+05:30', durationMs: 149, retryCount: 0, ruleIds: ['ING_001'] },
      { status: 'CANONICALIZED', timestamp: '2026-02-26T13:44:31+05:30', durationMs: 280, retryCount: 0, ruleIds: ['MAP_001', 'MAP_014'] },
      { status: 'READY_FOR_RELAY', timestamp: '2026-02-26T13:44:32+05:30', durationMs: 214, retryCount: 0, ruleIds: ['VAL_009'] },
      { status: 'RELAYED', timestamp: '2026-02-26T13:44:33+05:30', durationMs: 386, retryCount: 0, ruleIds: ['OUT_003'] },
      { status: 'OUTCOME_RECEIVED', timestamp: '2026-02-26T13:44:40+05:30', durationMs: 7000, retryCount: 0, ruleIds: ['OCM_002'] },
    ],
    evidencePackId: 'ep_20260226_0005',
  },
]

export function getIntentById(intentId: string): IntentRecord | undefined {
  return SANDBOX_INTENTS.find((intent) => intent.intentId === intentId)
}

export const WORK_QUEUE_ITEMS = [
  { id: 'wq_001', severity: 'Critical', status: 'Open', targetId: SANDBOX_INTENTS[1].intentId, reasonCode: 'WEBHOOK_FAILURE', age: '12m' },
  { id: 'wq_002', severity: 'High', status: 'Open', targetId: SANDBOX_INTENTS[2].envelopeId, reasonCode: 'DLQ_PUBLISH_ERROR', age: '26m' },
  { id: 'wq_003', severity: 'High', status: 'In Progress', targetId: SANDBOX_INTENTS[4].intentId, reasonCode: 'SLA_NEAR_BREACH', age: '39m' },
  { id: 'wq_004', severity: 'Medium', status: 'Open', targetId: SANDBOX_INTENTS[1].intentId, reasonCode: 'LOW_CONFIDENCE', age: '47m' },
  { id: 'wq_005', severity: 'Low', status: 'Dismissed', targetId: SANDBOX_INTENTS[0].intentId, reasonCode: 'BENIGN_DUPLICATE', age: '2h' },
] as const

export const EXCEPTION_ROWS = [
  {
    reasonCode: 'WEBHOOK_FAILURE',
    stage: 'Outcome Listener',
    retryable: true,
    firstSeenAt: '2026-02-26T10:11:39+05:30',
    lastSeenAt: '2026-02-26T10:25:42+05:30',
    intentId: SANDBOX_INTENTS[1].intentId,
    envelopeId: SANDBOX_INTENTS[1].envelopeId,
  },
  {
    reasonCode: 'DLQ_PUBLISH_ERROR',
    stage: 'Outbox',
    retryable: true,
    firstSeenAt: '2026-02-26T11:29:52+05:30',
    lastSeenAt: '2026-02-26T11:30:12+05:30',
    intentId: SANDBOX_INTENTS[2].intentId,
    envelopeId: SANDBOX_INTENTS[2].envelopeId,
  },
  {
    reasonCode: 'LOW_CONFIDENCE',
    stage: 'Tokenization',
    retryable: false,
    firstSeenAt: '2026-02-26T10:11:06+05:30',
    lastSeenAt: '2026-02-26T10:11:39+05:30',
    intentId: SANDBOX_INTENTS[1].intentId,
    envelopeId: SANDBOX_INTENTS[1].envelopeId,
  },
] as const

export interface EvidencePack {
  evidencePackId: string
  intentId: string
  merkleRoot: string
  signature: string
  createdAt: string
  leaves: Array<{ label: string; hash: string; kind: string }>
}

export const EVIDENCE_PACKS: EvidencePack[] = SANDBOX_INTENTS.map((intent, index) => ({
  evidencePackId: intent.evidencePackId,
  intentId: intent.intentId,
  merkleRoot: `mrkl_${index + 1}9f0a26b7e1f4c2d4b8b53fd21a90bc`,
  signature: `sig_${index + 1}bcf09ad77a2f1879b3a0e1a4`,
  createdAt: intent.createdAt,
  leaves: [
    { label: 'Raw Envelope hash', hash: `hash_env_${index + 1}5a2d91`, kind: 'envelope' },
    { label: 'Canonical Intent hash', hash: `hash_can_${index + 1}51f44e`, kind: 'canonical' },
    { label: 'Outcome event hash', hash: `hash_out_${index + 1}fa3442`, kind: 'outcome' },
    { label: 'Fusion decision hash', hash: `hash_fus_${index + 1}12ac39`, kind: 'fusion' },
    { label: 'Final output hash', hash: `hash_fin_${index + 1}6ff1aa`, kind: 'final' },
  ],
}))

export interface WebhookEndpoint {
  webhookId: string
  urlMasked: string
  status: 'Enabled' | 'Disabled' | 'Degraded'
  lastDelivery: string
  successRatePct: number
  events: string[]
}

export const WEBHOOK_ENDPOINTS: WebhookEndpoint[] = [
  {
    webhookId: 'wh_001',
    urlMasked: 'https://api.example.com/webhooks/pay***',
    status: 'Degraded',
    lastDelivery: '2026-02-26T13:59:08+05:30',
    successRatePct: 94.2,
    events: ['intent.created', 'fusion.finalized', 'evidence.generated'],
  },
  {
    webhookId: 'wh_002',
    urlMasked: 'https://ops.example.com/webhooks/sett***',
    status: 'Enabled',
    lastDelivery: '2026-02-26T13:57:20+05:30',
    successRatePct: 99.8,
    events: ['settlement.batch.closed'],
  },
  {
    webhookId: 'wh_003',
    urlMasked: 'https://audit.example.com/webhooks/ev***',
    status: 'Disabled',
    lastDelivery: '2026-02-26T10:09:00+05:30',
    successRatePct: 100,
    events: ['evidence.generated'],
  },
]

export const WEBHOOK_DELIVERIES = [
  { requestId: 'del_001', webhookId: 'wh_001', eventType: 'intent.created', status: 'Delivered', responseCode: 200, retryCount: 0 },
  { requestId: 'del_002', webhookId: 'wh_001', eventType: 'fusion.finalized', status: 'Retrying', responseCode: 503, retryCount: 3 },
  { requestId: 'del_003', webhookId: 'wh_002', eventType: 'settlement.batch.closed', status: 'Delivered', responseCode: 200, retryCount: 0 },
  { requestId: 'del_004', webhookId: 'wh_001', eventType: 'evidence.generated', status: 'Failed', responseCode: 500, retryCount: 5 },
] as const

export interface ApiLogRow {
  timestamp: string
  method: 'GET' | 'POST'
  endpoint: string
  statusCode: number
  traceId: string
  envelopeId: string
  idempotencyKey: string
  errorCode: string
}

export const API_LOGS: ApiLogRow[] = [
  {
    timestamp: '2026-02-26T13:58:11+05:30',
    method: 'POST',
    endpoint: '/envelopes',
    statusCode: 200,
    traceId: SANDBOX_INTENTS[0].traceId,
    envelopeId: SANDBOX_INTENTS[0].envelopeId,
    idempotencyKey: 'idem_tok_9a2b...ccd1',
    errorCode: 'OK',
  },
  {
    timestamp: '2026-02-26T13:59:04+05:30',
    method: 'POST',
    endpoint: '/envelopes',
    statusCode: 422,
    traceId: SANDBOX_INTENTS[2].traceId,
    envelopeId: SANDBOX_INTENTS[2].envelopeId,
    idempotencyKey: 'idem_tok_4ea3...71ff',
    errorCode: 'VAL_0123',
  },
  {
    timestamp: '2026-02-26T13:59:40+05:30',
    method: 'GET',
    endpoint: '/traces/tr_01J3ZORD9FR6KYZV7HS4NNXQK5',
    statusCode: 200,
    traceId: SANDBOX_INTENTS[2].traceId,
    envelopeId: SANDBOX_INTENTS[2].envelopeId,
    idempotencyKey: 'na',
    errorCode: 'OK',
  },
]

export const ADAPTER_CATALOG = [
  { adapterName: 'Razorpay', status: 'Connected', version: 'v2.4.1', lastEvent: '2026-02-26T13:58:11+05:30', errorRatePct: 2.8 },
  { adapterName: 'Cashfree', status: 'Connected', version: 'v1.8.9', lastEvent: '2026-02-26T13:55:40+05:30', errorRatePct: 0.4 },
  { adapterName: 'Bank Poller', status: 'Misconfigured', version: 'v3.1.0', lastEvent: '2026-02-26T12:10:22+05:30', errorRatePct: 4.3 },
  { adapterName: 'CSV Import', status: 'Connected', version: 'v1.0.6', lastEvent: '2026-02-26T13:17:01+05:30', errorRatePct: 0.1 },
] as const

export const LEDGER_ROWS = SANDBOX_INTENTS.map((intent) => ({
  intentId: intent.intentId,
  amount: intent.amount,
  status: intent.status,
  providerRef: intent.providerRefToken,
  finalState: intent.finalState,
  createdAt: intent.createdAt,
}))

export const SETTLEMENT_BATCHES = [
  { settlementBatchId: 'stl_20260226_01', totalAmount: 1456000, successCount: 114, failureCount: 3, confidenceScore: 0.98 },
  { settlementBatchId: 'stl_20260226_02', totalAmount: 923000, successCount: 73, failureCount: 2, confidenceScore: 0.96 },
  { settlementBatchId: 'stl_20260226_03', totalAmount: 432000, successCount: 31, failureCount: 1, confidenceScore: 0.94 },
] as const

export const DISCREPANCY_ROWS = [
  {
    intentId: SANDBOX_INTENTS[1].intentId,
    expectedState: 'SETTLED',
    observedState: 'PENDING_PROVIDER',
    varianceReason: 'Late provider reversal',
    severity: 'High',
  },
  {
    intentId: SANDBOX_INTENTS[2].intentId,
    expectedState: 'REFUNDED',
    observedState: 'FAILED',
    varianceReason: 'Mismatch in fee component',
    severity: 'High',
  },
  {
    intentId: SANDBOX_INTENTS[4].intentId,
    expectedState: 'REFUNDED',
    observedState: 'PENDING',
    varianceReason: 'Outcome webhook delay',
    severity: 'Medium',
  },
] as const

export const ACTIVITY_FEED = [
  `Intent created - ${SANDBOX_INTENTS[0].intentId} - ₹${SANDBOX_INTENTS[0].amount.toLocaleString('en-IN')} - RECEIVED`,
  `Intent failed validation - ${SANDBOX_INTENTS[2].intentId} - rule VAL_0123`,
  `Outcome received - razorpay - ${SANDBOX_INTENTS[4].providerRefToken} - mapped to ${SANDBOX_INTENTS[4].intentId}`,
  `Fusion updated - ${SANDBOX_INTENTS[0].intentId} - final state SETTLED`,
  `Evidence generated - ${SANDBOX_INTENTS[0].evidencePackId}`,
] as const

export const MAPPING_PROFILES = ['map_profile_v1_2026_01', 'map_profile_v2_2026_02', 'map_profile_v2_2026_03']
export const FUSION_RULESETS = ['fusion_ruleset_2026_01', 'fusion_ruleset_2026_02']
