/**
 * Sandbox-only mock data: pre-built test scenarios, API keys, recent API requests.
 * In production these would be fetched from /api/sandbox/* endpoints; this file
 * is the swap point.
 */

export type SandboxScenarioId = 'salary_run' | 'vendor_payouts' | 'refund_batch' | 'failure_injection'

export type SandboxScenario = {
  id: SandboxScenarioId
  name: string
  description: string
  expectedOutcome: string
  intentCount: number
  totalValue: string
  resultBatchId: string
  highlights: string[]
}

export const SANDBOX_SCENARIOS: SandboxScenario[] = [
  {
    id: 'salary_run',
    name: 'Salary run',
    description: 'A typical month-end employee disbursement batch via IMPS.',
    expectedOutcome: 'Creates 100 intents · dispatches via Cashfree · 80% confirmed, 20% pending settlement.',
    intentCount: 100,
    totalValue: '$185.0K',
    resultBatchId: 'TEST_B-2026-099',
    highlights: ['IMPS rail', '100 intents', '20% pending'],
  },
  {
    id: 'vendor_payouts',
    name: 'Vendor payouts',
    description: 'B2B settlement batch with mixed amounts via NEFT/RTGS, bank-direct.',
    expectedOutcome: 'Creates 40 intents · dispatches via HDFC Bank direct · 95% confirmed within window.',
    intentCount: 40,
    totalValue: '$420.0K',
    resultBatchId: 'TEST_B-2026-100',
    highlights: ['NEFT/RTGS', '40 intents', 'Bank-direct'],
  },
  {
    id: 'refund_batch',
    name: 'Refund batch',
    description: 'Customer refunds tied to prior transactions — tests reverse-flow reconciliation.',
    expectedOutcome: 'Creates 25 intents · all linked to original transactions · 100% confirmed.',
    intentCount: 25,
    totalValue: '$32.5K',
    resultBatchId: 'TEST_B-2026-101',
    highlights: ['Refund flow', '25 intents', 'Linked txns'],
  },
  {
    id: 'failure_injection',
    name: 'Failure injection',
    description: 'Adversarial scenario — duplicate IDs, missing mandates, late webhooks.',
    expectedOutcome: 'Creates 60 intents · 18 land in DLQ · tests retry + escalation paths.',
    intentCount: 60,
    totalValue: '$96.0K',
    resultBatchId: 'TEST_B-2026-102',
    highlights: ['DLQ tests', '60 intents', '30% failure'],
  },
]

// ─── API keys ──────────────────────────────────────────────────────────────────

export type SandboxApiKey = {
  id: string
  type: 'publishable' | 'secret'
  mode: 'sandbox' | 'live'
  /** Full key value — would be redacted server-side except on initial issue / rotate. */
  value: string
  lastUsedAt: string | null
  createdAt: string
}

export const SANDBOX_API_KEYS: SandboxApiKey[] = [
  {
    id: 'key_pub_test_01',
    type: 'publishable',
    mode: 'sandbox',
    value: 'pk_test_zord_5l7Hd9rN2qX8aVcK1mEbF3uY',
    lastUsedAt: '2 minutes ago',
    createdAt: '2026-05-01',
  },
  {
    id: 'key_sec_test_01',
    type: 'secret',
    mode: 'sandbox',
    value: 'sk_test_zord_8jK4mP2nL5xH9wQ3vR6tBfYzC',
    lastUsedAt: '5 minutes ago',
    createdAt: '2026-05-01',
  },
]

// ─── Recent API requests (mock observability) ──────────────────────────────────

export type SandboxApiRequest = {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  status: number
  durationMs: number
  at: string
}

export const SANDBOX_RECENT_REQUESTS: SandboxApiRequest[] = [
  { id: 'r1', method: 'POST', path: '/v1/intents/upload', status: 201, durationMs: 184, at: '2 min ago' },
  { id: 'r2', method: 'POST', path: '/v1/batches/B-2026-099/dispatch', status: 200, durationMs: 412, at: '2 min ago' },
  { id: 'r3', method: 'GET', path: '/v1/batches/B-2026-099', status: 200, durationMs: 38, at: '4 min ago' },
  { id: 'r4', method: 'POST', path: '/v1/webhooks/simulate', status: 200, durationMs: 67, at: '6 min ago' },
  { id: 'r5', method: 'GET', path: '/v1/connectors', status: 200, durationMs: 22, at: '12 min ago' },
  { id: 'r6', method: 'POST', path: '/v1/intents/upload', status: 422, durationMs: 91, at: '18 min ago' },
  { id: 'r7', method: 'POST', path: '/v1/reconcile', status: 200, durationMs: 308, at: '22 min ago' },
  { id: 'r8', method: 'GET', path: '/v1/batches', status: 200, durationMs: 15, at: '34 min ago' },
  { id: 'r9', method: 'POST', path: '/v1/dlq/INT-1004/retry', status: 202, durationMs: 142, at: '41 min ago' },
  { id: 'r10', method: 'GET', path: '/v1/connectors/cashfree/health', status: 200, durationMs: 19, at: '55 min ago' },
]

// ─── Postman / docs links ──────────────────────────────────────────────────────

export const SANDBOX_DOCS_LINKS = {
  apiReference: 'https://docs.zord.com/api',
  postmanCollection: 'https://www.postman.com/zord/zord-public/collection/sandbox',
  webhookGuide: 'https://docs.zord.com/webhooks',
}
