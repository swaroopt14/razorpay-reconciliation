export type SignalHealth = 'Healthy' | 'Degraded' | 'Down' | 'N/A'

export type SourceType =
  | 'Payment Gateway'
  | 'Bank Account'
  | 'Settlement Source'
  | 'Webhook Endpoint'
  | 'Ledger System'

export type ConnectionSourceRow = {
  id: string
  name: string
  type: SourceType
  initials: string
  color: string
  api: SignalHealth
  webhook: SignalHealth
  lastSyncRel: string
  lastSyncAbs: string
  /** Overview panel extras when selected */
  eventsReceived: number
  eventsProcessed: number
  failedDeliveries: number
  latencyMs: number | null
  lastEvent: string
  lastEventAt: string
  rateLimitUsed: number
  rateLimitMax: number
  freshnessRel: string
  auth: SignalHealth
  endpoint?: string
}

export type RecentEvent = {
  id: string
  event: string
  status: 'Processed' | 'Failed' | 'Retrying'
  at: string
}

export type FailedDelivery = {
  id: string
  time: string
  source: string
  event: string
  reason: string
}

export type TimelineSeg = { start: number; end: number; status: 'Healthy' | 'Degraded' | 'Down' }

export const CONNECTION_SOURCES: ConnectionSourceRow[] = [
  {
    id: 'razorpay',
    name: 'Razorpay',
    type: 'Payment Gateway',
    initials: 'Rz',
    color: '#528FF0',
    api: 'Healthy',
    webhook: 'Healthy',
    lastSyncRel: '2 min ago',
    lastSyncAbs: '16:40:12',
    eventsReceived: 6482,
    eventsProcessed: 6479,
    failedDeliveries: 2,
    latencyMs: 220,
    lastEvent: 'payment.captured',
    lastEventAt: '16:40:12 IST',
    rateLimitUsed: 1562,
    rateLimitMax: 10_000,
    freshnessRel: '2 min ago',
    auth: 'Healthy',
    endpoint: '/v1/webhooks/razorpay/conn_001',
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    type: 'Bank Account',
    initials: 'HD',
    color: '#004C8F',
    api: 'Healthy',
    webhook: 'Healthy',
    lastSyncRel: '4 min ago',
    lastSyncAbs: '16:38:42',
    eventsReceived: 1284,
    eventsProcessed: 1282,
    failedDeliveries: 1,
    latencyMs: 420,
    lastEvent: 'CREDIT_POSTED',
    lastEventAt: '16:38:42 IST',
    rateLimitUsed: 410,
    rateLimitMax: 5_000,
    freshnessRel: '4 min ago',
    auth: 'Healthy',
    endpoint: '/v1/webhooks/hdfc/conn_002',
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    type: 'Bank Account',
    initials: 'IC',
    color: '#F58220',
    api: 'Degraded',
    webhook: 'Healthy',
    lastSyncRel: '2h ago',
    lastSyncAbs: '14:18:04',
    eventsReceived: 410,
    eventsProcessed: 398,
    failedDeliveries: 11,
    latencyMs: 4800,
    lastEvent: 'API timeout',
    lastEventAt: '14:18:04 IST',
    rateLimitUsed: 890,
    rateLimitMax: 5_000,
    freshnessRel: '2h ago',
    auth: 'Healthy',
    endpoint: '/v1/webhooks/icici/conn_003',
  },
  {
    id: 'rzpx_setl',
    name: 'RazorpayX Settlements',
    type: 'Settlement Source',
    initials: 'SX',
    color: '#0EA5E9',
    api: 'Healthy',
    webhook: 'Healthy',
    lastSyncRel: '12 min ago',
    lastSyncAbs: '16:30:01',
    eventsReceived: 96,
    eventsProcessed: 96,
    failedDeliveries: 0,
    latencyMs: 310,
    lastEvent: 'settlement.processed',
    lastEventAt: '16:30:01 IST',
    rateLimitUsed: 120,
    rateLimitMax: 2_000,
    freshnessRel: '12 min ago',
    auth: 'Healthy',
  },
  {
    id: 'bob',
    name: 'Bank of Baroda',
    type: 'Bank Account',
    initials: 'BB',
    color: '#F59E0B',
    api: 'Healthy',
    webhook: 'Degraded',
    lastSyncRel: '38 min ago',
    lastSyncAbs: '16:04:22',
    eventsReceived: 218,
    eventsProcessed: 210,
    failedDeliveries: 3,
    latencyMs: 680,
    lastEvent: 'webhook.retry',
    lastEventAt: '16:04:22 IST',
    rateLimitUsed: 55,
    rateLimitMax: 2_000,
    freshnessRel: '38 min ago',
    auth: 'Healthy',
  },
  {
    id: 'webhook_rx',
    name: 'Webhook Receiver',
    type: 'Webhook Endpoint',
    initials: 'WH',
    color: '#64748B',
    api: 'N/A',
    webhook: 'Healthy',
    lastSyncRel: '1 min ago',
    lastSyncAbs: '16:41:08',
    eventsReceived: 3120,
    eventsProcessed: 3114,
    failedDeliveries: 2,
    latencyMs: null,
    lastEvent: 'ingress.accepted',
    lastEventAt: '16:41:08 IST',
    rateLimitUsed: 0,
    rateLimitMax: 0,
    freshnessRel: '1 min ago',
    auth: 'Healthy',
    endpoint: '/v1/webhooks/ingress',
  },
  {
    id: 'tally',
    name: 'Tally ERP',
    type: 'Ledger System',
    initials: 'TY',
    color: '#8B5CF6',
    api: 'Healthy',
    webhook: 'N/A',
    lastSyncRel: '1h ago',
    lastSyncAbs: '15:42:00',
    eventsReceived: 42,
    eventsProcessed: 42,
    failedDeliveries: 0,
    latencyMs: 910,
    lastEvent: 'ledger.sync',
    lastEventAt: '15:42:00 IST',
    rateLimitUsed: 18,
    rateLimitMax: 500,
    freshnessRel: '1h ago',
    auth: 'Healthy',
  },
]

export const RAZORPAY_RECENT_EVENTS: RecentEvent[] = [
  { id: 'evt_9f21a', event: 'payment.captured', status: 'Processed', at: '16:40:12' },
  { id: 'evt_8c10b', event: 'payout.processed', status: 'Processed', at: '16:39:58' },
  { id: 'evt_7a02c', event: 'payout.failed', status: 'Processed', at: '16:38:11' },
  { id: 'evt_6b91d', event: 'settlement.processed', status: 'Processed', at: '16:30:01' },
]

export const FAILED_DELIVERIES: FailedDelivery[] = [
  { id: 'f1', time: '16:31:04', source: 'ICICI Bank', event: 'bank.sync', reason: 'Timeout' },
  { id: 'f2', time: '16:18:22', source: 'Bank of Baroda', event: 'CREDIT_POSTED', reason: 'HTTP 500' },
  { id: 'f3', time: '15:55:41', source: 'Razorpay', event: 'payout.processed', reason: 'Signature mismatch' },
  { id: 'f4', time: '15:12:09', source: 'Webhook Receiver', event: 'ingress.accepted', reason: 'HTTP 500' },
  { id: 'f5', time: '14:48:33', source: 'ICICI Bank', event: 'API request', reason: 'Timeout' },
]

/** 0–24 hour segments for last-24h timeline bars */
export const SYSTEM_TIMELINE: Record<string, TimelineSeg[]> = {
  razorpay: [{ start: 0, end: 24, status: 'Healthy' }],
  hdfc: [
    { start: 0, end: 18, status: 'Healthy' },
    { start: 18, end: 19, status: 'Degraded' },
    { start: 19, end: 24, status: 'Healthy' },
  ],
  icici: [
    { start: 0, end: 10, status: 'Healthy' },
    { start: 10, end: 14, status: 'Degraded' },
    { start: 14, end: 14.2, status: 'Down' },
    { start: 14.2, end: 24, status: 'Degraded' },
  ],
  rzpx_setl: [{ start: 0, end: 24, status: 'Healthy' }],
  bob: [
    { start: 0, end: 16, status: 'Healthy' },
    { start: 16, end: 20, status: 'Degraded' },
    { start: 20, end: 24, status: 'Healthy' },
  ],
  webhook_rx: [{ start: 0, end: 24, status: 'Healthy' }],
  tally: [
    { start: 0, end: 22, status: 'Healthy' },
    { start: 22, end: 22.3, status: 'Down' },
    { start: 22.3, end: 24, status: 'Healthy' },
  ],
}

export const WEBHOOK_DELIVERY = {
  total: 12_842,
  delivered: 98.4,
  failed: 0.05,
  retrying: 0.18,
  inProgress: 1.37,
}

export function statusPillClass(status: SignalHealth): string {
  if (status === 'Healthy') return 'bg-[#E8F8EE] text-[#147A3F]'
  if (status === 'Degraded') return 'bg-[#FFF6E5] text-[#B36B00]'
  if (status === 'Down') return 'bg-[#FDECEC] text-[#C0372A]'
  return 'bg-[#F1F5F9] text-[#64748B]'
}
