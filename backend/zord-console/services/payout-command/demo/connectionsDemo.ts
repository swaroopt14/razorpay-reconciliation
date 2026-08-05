/**
 * Spec 7.3 Connections - demo fixtures.
 * Demo honesty: file-based ingestion is the active path; API/webhook shown only where they work
 * or labelled Planned / Sandbox.
 */

export type ConnectionStatus = 'Live' | 'Sandbox' | 'File-based' | 'Degraded' | 'Planned'
export type ConnectionKind = 'source' | 'execution' | 'outcome'
export type Transport = 'File upload' | 'API' | 'Webhook' | 'SFTP' | 'Kafka/event stream'

export type ConnectionRecord = {
  id: string
  kind: ConnectionKind
  name: string
  /** ERP, SAP, Bank, PSP, Webhook, etc. */
  subtype: string
  transport: Transport
  mode: ConnectionStatus
  /** Never a raw secret - scope label only. */
  authScope: string
  lastSignal: string
  freshness: string
  schemaVersion: string
  mappingStatus: 'Healthy' | 'Needs review' | 'Not mapped' | 'N/A'
  mappingProfile?: string
  /** File-based extras */
  acceptedFormats?: string
  fileHash?: string
  validationResult?: string
  /** Degraded extras */
  lastSuccessSignal?: string
  retryHint?: string
  /** Planned = disabled */
  disabled?: boolean
  notes?: string
}

export const CONNECTIONS_HEADER = {
  title: 'Connect the systems that create, move, and confirm payouts.',
  coreQuestion: 'Where does Zord obtain authoritative data, and how fresh and trustworthy is each connection?',
} as const

export const CONNECTION_KIND_META: Record<
  ConnectionKind,
  { title: string; blurb: string; addLabel: string; examples: string }
> = {
  source: {
    title: 'Source systems',
    blurb: 'Where authorised payout obligations enter Zord.',
    addLabel: 'Add source',
    examples: 'ERP, SAP, internal API, file upload, SFTP, event stream',
  },
  execution: {
    title: 'Execution rails',
    blurb: 'How sealed instructions are relayed or observed in motion.',
    addLabel: 'Add execution rail',
    examples: 'Bank, PSP, payout platform, processor, wallet or token rail',
  },
  outcome: {
    title: 'Outcome sources',
    blurb: 'How settlement, returns, and confirmations come back.',
    addLabel: 'Add outcome source',
    examples: 'Webhook, bank statement, settlement file, ledger feed, reversal file',
  },
}

/** Prepared demo - at least one active source, execution mode, and outcome source. */
export const DEMO_CONNECTIONS: ConnectionRecord[] = [
  {
    id: 'src-payroll-file',
    kind: 'source',
    name: 'Payroll obligation file',
    subtype: 'File upload',
    transport: 'File upload',
    mode: 'File-based',
    authScope: 'Workspace upload · no API secret',
    lastSignal: '12 Jun 2026, 09:14 IST',
    freshness: 'Batch-scoped · current demo run',
    schemaVersion: 'intent-v1.2',
    mappingStatus: 'Healthy',
    mappingProfile: 'yc-payroll-intent',
    acceptedFormats: 'CSV, UTF-8',
    fileHash: 'sha256:a3f1…9c2e',
    validationResult: '15 rows accepted · 0 schema errors',
    notes: 'Active demo path - sample CSV under /samples.',
  },
  {
    id: 'src-erp-api',
    kind: 'source',
    name: 'Internal ERP API',
    subtype: 'Internal API',
    transport: 'API',
    mode: 'Planned',
    authScope: 'OAuth client · not provisioned',
    lastSignal: '-',
    freshness: 'No signals',
    schemaVersion: '-',
    mappingStatus: 'Not mapped',
    disabled: true,
    notes: 'Shown for path clarity; not live in this demo.',
  },
  {
    id: 'src-sftp',
    kind: 'source',
    name: 'Treasury SFTP drop',
    subtype: 'SFTP',
    transport: 'SFTP',
    mode: 'Sandbox',
    authScope: 'SSH key · scoped to ingest bucket',
    lastSignal: 'Illustrative · 11 Jun 2026',
    freshness: 'Stale for live ops',
    schemaVersion: 'intent-v1.1',
    mappingStatus: 'Needs review',
    notes: 'Sandbox only - not used for the prepared batch.',
  },
  {
    id: 'ex-observe-psp',
    kind: 'execution',
    name: 'PSP observe mode',
    subtype: 'PSP',
    transport: 'API',
    mode: 'Sandbox',
    authScope: 'Read-only partner token · masked',
    lastSignal: '12 Jun 2026, 10:02 IST',
    freshness: '< 2 min (sandbox clock)',
    schemaVersion: 'dispatch-ack-v1',
    mappingStatus: 'Healthy',
    notes: 'Zord observes acknowledgements; does not hold funds.',
  },
  {
    id: 'ex-bank-relay',
    kind: 'execution',
    name: 'Bank payout relay',
    subtype: 'Bank',
    transport: 'API',
    mode: 'Planned',
    authScope: 'mTLS · not configured',
    lastSignal: '-',
    freshness: 'No signals',
    schemaVersion: '-',
    mappingStatus: 'N/A',
    disabled: true,
  },
  {
    id: 'ex-file-dispatch',
    kind: 'execution',
    name: 'File-based dispatch record',
    subtype: 'Payout platform',
    transport: 'File upload',
    mode: 'File-based',
    authScope: 'Workspace upload · no API secret',
    lastSignal: '12 Jun 2026, 09:40 IST',
    freshness: 'Tied to prepared batch',
    schemaVersion: 'dispatch-record-v1',
    mappingStatus: 'Healthy',
    mappingProfile: 'yc-dispatch-observe',
    acceptedFormats: 'CSV',
    fileHash: 'sha256:b71c…44a0',
    validationResult: '12 dispatch rows matched sealed contracts',
    notes: 'Active execution mode for this demo workspace.',
  },
  {
    id: 'out-settlement-file',
    kind: 'outcome',
    name: 'Settlement file',
    subtype: 'Settlement file',
    transport: 'File upload',
    mode: 'File-based',
    authScope: 'Workspace upload · no API secret',
    lastSignal: '12 Jun 2026, 11:18 IST',
    freshness: 'Batch-scoped · current demo run',
    schemaVersion: 'settlement-v1.0',
    mappingStatus: 'Healthy',
    mappingProfile: 'yc-settlement-observe',
    acceptedFormats: 'CSV, UTF-8',
    fileHash: 'sha256:c9e2…1b7d',
    validationResult: 'Observed ₹44,000 · short + return rows flagged',
    notes: 'Active outcome path for the prepared payroll batch.',
  },
  {
    id: 'out-webhook',
    kind: 'outcome',
    name: 'PSP settlement webhook',
    subtype: 'Webhook',
    transport: 'Webhook',
    mode: 'Degraded',
    authScope: 'HMAC verify · secret not displayed',
    lastSignal: 'Failed · 12 Jun 2026, 08:55 IST',
    freshness: 'Degraded · 3h since last success',
    schemaVersion: 'webhook-settle-v2',
    mappingStatus: 'Needs review',
    lastSuccessSignal: '12 Jun 2026, 05:41 IST',
    retryHint: 'Retry delivery probe - sandbox endpoint only',
    notes: 'Honest degraded state; do not treat as live production.',
  },
  {
    id: 'out-kafka',
    kind: 'outcome',
    name: 'Ledger event stream',
    subtype: 'Ledger feed',
    transport: 'Kafka/event stream',
    mode: 'Planned',
    authScope: 'SASL · not provisioned',
    lastSignal: '-',
    freshness: 'No signals',
    schemaVersion: '-',
    mappingStatus: 'Not mapped',
    disabled: true,
  },
]

export const TRANSPORT_OPTIONS: Transport[] = [
  'File upload',
  'API',
  'Webhook',
  'SFTP',
  'Kafka/event stream',
]

export function connectionsByKind(kind: ConnectionKind): ConnectionRecord[] {
  return DEMO_CONNECTIONS.filter((c) => c.kind === kind)
}

export function connectionSummary() {
  const active = (c: ConnectionRecord) =>
    !c.disabled && (c.mode === 'File-based' || c.mode === 'Live' || c.mode === 'Sandbox')
  return {
    sources: connectionsByKind('source').filter(active).length,
    rails: connectionsByKind('execution').filter(active).length,
    outcomes: connectionsByKind('outcome').filter(active).length,
  }
}
