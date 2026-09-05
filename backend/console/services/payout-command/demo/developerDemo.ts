/** Spec 7.17 - Developer & Integrations demo fixtures (sandbox-labelled). */

export const DEVELOPER_HEADER = {
  title: 'Developer & Integrations',
  subtitle: 'Integrate Zord without exposing sensitive payment data.',
} as const

export type DeveloperTabId =
  | 'keys'
  | 'webhooks'
  | 'streams'
  | 'schemas'
  | 'logs'
  | 'quickstart'

export const DEVELOPER_TABS: { id: DeveloperTabId; label: string }[] = [
  { id: 'keys', label: 'API keys' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'streams', label: 'Event streams' },
  { id: 'schemas', label: 'Schemas' },
  { id: 'logs', label: 'Logs' },
  { id: 'quickstart', label: 'Quickstart' },
]

export type ApiKeyRow = {
  id: string
  name: string
  environment: 'Sandbox' | 'Live'
  scopes: string[]
  created: string
  lastUsed: string
  expiry: string
  prefix: string
  status: 'Active' | 'Revoked' | 'Rotated'
}

export type WebhookRow = {
  id: string
  endpoint: string
  events: string[]
  signingStatus: 'Verified' | 'Failed' | 'Pending'
  retries: number
  lastDelivery: string
  lastStatus: '2xx' | '4xx' | '5xx' | 'timeout'
}

export type StreamRow = {
  id: string
  topic: string
  consumerGroup: string
  auth: 'TLS' | 'SASL' | 'TLS+SASL'
  lastOffset: string
  lag: string
  status: 'Connected' | 'Degraded' | 'Planned'
}

export type SchemaRow = {
  id: string
  objectName: string
  version: string
  contentType: string
  updated: string
}

export type DeliveryLogRow = {
  id: string
  at: string
  kind: 'webhook' | 'api' | 'stream'
  correlationId: string
  summary: string
  httpStatus: string
  result: 'ok' | 'retry' | 'fail'
}

export const DEMO_API_KEYS: ApiKeyRow[] = [
  {
    id: 'key_pub_01',
    name: 'Demo publishable',
    environment: 'Sandbox',
    scopes: ['read:obligations', 'read:contracts', 'read:evidence'],
    created: '10 Jun 2026',
    lastUsed: '12 Jun 2026 · 16:40',
    expiry: 'Never',
    prefix: 'pk_test_zord_demo…',
    status: 'Active',
  },
  {
    id: 'key_sec_01',
    name: 'Demo secret',
    environment: 'Sandbox',
    scopes: [
      'write:obligations',
      'read:policy',
      'read:contracts',
      'write:outcomes',
      'read:evidence',
      'verify:proof',
    ],
    created: '10 Jun 2026',
    lastUsed: '12 Jun 2026 · 16:42',
    expiry: '90 days',
    prefix: 'sk_test_zord_demo…',
    status: 'Active',
  },
  {
    id: 'key_sec_old',
    name: 'Rotated ingest key',
    environment: 'Sandbox',
    scopes: ['write:obligations'],
    created: '01 May 2026',
    lastUsed: '09 Jun 2026',
    expiry: 'Revoked',
    prefix: 'sk_test_zord_old…',
    status: 'Rotated',
  },
]

export const DEMO_WEBHOOKS: WebhookRow[] = [
  {
    id: 'wh_01',
    endpoint: 'https://hooks.example.com/zord/outcomes',
    events: ['policy.decision', 'contract.sealed', 'outcome.attached', 'evidence.ready'],
    signingStatus: 'Verified',
    retries: 3,
    lastDelivery: '12 Jun 2026 · 16:41',
    lastStatus: '2xx',
  },
  {
    id: 'wh_02',
    endpoint: 'https://hooks.example.com/zord/gaps',
    events: ['outcome.exception'],
    signingStatus: 'Failed',
    retries: 5,
    lastDelivery: '12 Jun 2026 · 15:02',
    lastStatus: '4xx',
  },
]

export const DEMO_STREAMS: StreamRow[] = [
  {
    id: 'st_01',
    topic: 'zord.sandbox.outcome_signals',
    consumerGroup: 'yc-review-ops',
    auth: 'TLS+SASL',
    lastOffset: '184291',
    lag: '0',
    status: 'Connected',
  },
  {
    id: 'st_02',
    topic: 'zord.sandbox.evidence_events',
    consumerGroup: 'yc-review-audit',
    auth: 'TLS',
    lastOffset: '90211',
    lag: '12',
    status: 'Degraded',
  },
  {
    id: 'st_03',
    topic: 'zord.live.dispatch_acks',
    consumerGroup: '-',
    auth: 'TLS+SASL',
    lastOffset: '-',
    lag: '-',
    status: 'Planned',
  },
]

/** Schema object names match product UI vocabulary. */
export const DEMO_SCHEMAS: SchemaRow[] = [
  {
    id: 'sch_obl',
    objectName: 'Payout obligation',
    version: 'v1.4',
    contentType: 'application/json',
    updated: '01 Jun 2026',
  },
  {
    id: 'sch_pac',
    objectName: 'Action Contract',
    version: 'v1.3',
    contentType: 'application/json',
    updated: '01 Jun 2026',
  },
  {
    id: 'sch_pol',
    objectName: 'Policy decision',
    version: 'v1.2',
    contentType: 'application/json',
    updated: '28 May 2026',
  },
  {
    id: 'sch_out',
    objectName: 'Outcome signal',
    version: 'v1.3',
    contentType: 'application/json',
    updated: '01 Jun 2026',
  },
  {
    id: 'sch_ev',
    objectName: 'Evidence pack',
    version: 'v1.1',
    contentType: 'application/json',
    updated: '05 Jun 2026',
  },
]

export const DEMO_DELIVERY_LOGS: DeliveryLogRow[] = [
  {
    id: 'log_01',
    at: '12 Jun · 16:42',
    kind: 'api',
    correlationId: 'corr_yc_pay0001_seal',
    summary: 'GET Action Contract PAC-0001',
    httpStatus: '200',
    result: 'ok',
  },
  {
    id: 'log_02',
    at: '12 Jun · 16:41',
    kind: 'webhook',
    correlationId: 'corr_yc_pay0001_ev',
    summary: 'POST evidence.ready → hooks.example.com',
    httpStatus: '200',
    result: 'ok',
  },
  {
    id: 'log_03',
    at: '12 Jun · 15:02',
    kind: 'webhook',
    correlationId: 'corr_yc_pay0019_gap',
    summary: 'POST outcome.exception - signature rejected',
    httpStatus: '401',
    result: 'fail',
  },
  {
    id: 'log_04',
    at: '12 Jun · 14:55',
    kind: 'webhook',
    correlationId: 'corr_yc_pay0019_gap',
    summary: 'Retry 2/5 outcome.exception',
    httpStatus: '401',
    result: 'retry',
  },
  {
    id: 'log_05',
    at: '12 Jun · 10:02',
    kind: 'api',
    correlationId: 'corr_yc_pay0001_dsp',
    summary: 'POST dispatch request for PAC-0001',
    httpStatus: '202',
    result: 'ok',
  },
]

export const QUICKSTART_STEPS = [
  {
    n: 1,
    label: 'Create obligation',
    detail: 'POST a payout obligation (file, form, or API).',
    href: '/payouts/new?demo=sandbox',
  },
  {
    n: 2,
    label: 'Receive policy result',
    detail: 'Read the policy decision before money moves.',
    href: '/controls/review?demo=sandbox',
  },
  {
    n: 3,
    label: 'Fetch contract',
    detail: 'GET the sealed Payment Action Contract.',
    href: '/contracts/PAC-0001?demo=sandbox',
  },
  {
    n: 4,
    label: 'Attach outcome',
    detail: 'Send or observe an outcome signal against the contract.',
    href: '/settlement/journal?demo=sandbox',
  },
  {
    n: 5,
    label: 'Verify proof',
    detail: 'Recompute integrity on the evidence pack.',
    href: '/proof/EP-0001?demo=sandbox&tab=verify',
  },
] as const

export const KEY_SCOPES_AVAILABLE = [
  'read:obligations',
  'write:obligations',
  'read:policy',
  'read:contracts',
  'write:outcomes',
  'read:evidence',
  'verify:proof',
  'manage:webhooks',
] as const
