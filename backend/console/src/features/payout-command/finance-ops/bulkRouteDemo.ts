import type { FinanceReconRow } from '@/services/payout-command/prod-api/financeTypes'

/** ~20s AI thinking timeline (cumulative seconds) — matches product mock. */
export const ROUTING_STEPS = [
  { id: 'validate', label: 'File validated', atSec: 2 },
  { id: 'analyze', label: 'Analyzing data', atSec: 6 },
  { id: 'rails', label: 'Evaluating rails', atSec: 10 },
  { id: 'score', label: 'Scoring routes', atSec: 15 },
  { id: 'finalize', label: 'Finalizing recommendation', atSec: 20 },
] as const

export const ROUTING_TOTAL_MS = 20_000

export type RoutingPhase = 'idle' | 'analyzing' | 'ready' | 'approved' | 'cancelled'

export type ConnectedBank = {
  name: string
  short: string
  health: 'Healthy' | 'Degraded'
  score: number
}

export type ReceiverBankSlice = {
  name: string
  pct: number
  color: string
}

export type RouteOption = {
  bank: string
  rail: 'NEFT' | 'IMPS' | 'UPI' | 'RTGS'
  successRate: number
  eta: string
  etaNote: string
  completionDate: string
  completionTime: string
  costMinor: number
  confidence: number
  recommended?: boolean
}

export type RouteRecommendation = {
  bank: string
  rail: 'NEFT' | 'IMPS' | 'UPI' | 'RTGS'
  why: string[]
  expectedCompletion: string
  confidence: number
  successProbability: number
  projectedFeeMinor: number
  fallback: string
  splitHint: string
  contractVersion: string
  contractHash: string
  processingEta: string
  processingEtaNote: string
  completionDate: string
  completionTime: string
  confidenceLabel: string
}

export const CONNECTED_BANKS: ConnectedBank[] = [
  { name: 'HDFC Bank', short: 'HDFC', health: 'Healthy', score: 98 },
  { name: 'ICICI Bank', short: 'ICICI', health: 'Healthy', score: 96 },
  { name: 'Axis Bank', short: 'Axis', health: 'Healthy', score: 94 },
  { name: 'Kotak Mahindra', short: 'Kotak', health: 'Healthy', score: 92 },
]

export const RECEIVER_BANK_DISTRIBUTION: ReceiverBankSlice[] = [
  { name: 'HDFC Bank', pct: 48, color: '#2F6FED' },
  { name: 'ICICI Bank', pct: 22, color: '#22C55E' },
  { name: 'Axis Bank', pct: 15, color: '#F59E0B' },
  { name: 'SBI', pct: 9, color: '#8B5CF6' },
  { name: 'Others', pct: 6, color: '#94A3B8' },
]

export const ROUTE_COMPARISON: RouteOption[] = [
  {
    bank: 'HDFC Bank',
    rail: 'NEFT',
    successRate: 96.2,
    eta: 'T+1',
    etaNote: 'Banking hours',
    completionDate: '13 Jun 2026',
    completionTime: 'By 18:00 IST',
    costMinor: 122_500,
    confidence: 94,
    recommended: true,
  },
  {
    bank: 'ICICI Bank',
    rail: 'NEFT',
    successRate: 93.1,
    eta: 'T+1',
    etaNote: 'Banking hours',
    completionDate: '13 Jun 2026',
    completionTime: 'By 18:30 IST',
    costMinor: 136_750,
    confidence: 89,
  },
  {
    bank: 'Axis Bank',
    rail: 'NEFT',
    successRate: 91.4,
    eta: 'T+1',
    etaNote: 'Banking hours',
    completionDate: '13 Jun 2026',
    completionTime: 'By 19:00 IST',
    costMinor: 154_200,
    confidence: 84,
  },
]

export const HDFC_NEFT_RECOMMENDATION: RouteRecommendation = {
  bank: 'HDFC Bank',
  rail: 'NEFT',
  why: [
    'Highest success rate for this batch',
    'Optimal cost per transaction',
    'Best match for receiver bank mix',
    'Healthy sender connection',
    'Within expected SLA window',
    'No known restrictions or blocks',
  ],
  expectedCompletion: '13 Jun 2026 · By 18:00 IST',
  confidence: 94,
  successProbability: 96.2,
  projectedFeeMinor: 122_500,
  fallback: 'ICICI Bank · NEFT if HDFC window closes',
  splitHint: 'Juspay-style split available: 60% HDFC NEFT · 40% ICICI IMPS if ICICI latency recovers.',
  contractVersion: 'PAC-0001 v1',
  contractHash: 'sha256:000252c91a4e…',
  processingEta: 'T+1',
  processingEtaNote: 'Banking hours',
  completionDate: '13 Jun 2026',
  completionTime: 'By 18:00 IST',
  confidenceLabel: 'High confidence',
}

export type BulkBatchSummary = {
  batchId: string
  fileName: string
  totalRecords: number
  totalAmountMinor: number
  uniqueBeneficiaries: number
  uploadTime: string
  requestedBy: string
}

export function buildBulkBatchSummary(opts: {
  fileName: string
  rows: FinanceReconRow[]
  uploadedAt: string
}): BulkBatchSummary {
  const totalAmountMinor = opts.rows.reduce((s, r) => s + (Number(r.amount_minor) || 0), 0)
  const beneficiaries = new Set(opts.rows.map((r) => r.fund_account_id || r.payment_id)).size
  return {
    batchId: 'batch-001',
    fileName: opts.fileName,
    totalRecords: opts.rows.length,
    totalAmountMinor,
    uniqueBeneficiaries: Math.max(beneficiaries, Math.round(opts.rows.length * 0.92)),
    uploadTime: opts.uploadedAt,
    requestedBy: 'finance.ops@merchant.in',
  }
}

export function countPayoutRowsFromFile(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length <= 1) return Math.max(8, lines.length)
  const body = lines.slice(1)
  return Math.min(40, Math.max(8, body.length))
}

export function mockBulkPayoutRows(count: number, fileName: string): FinanceReconRow[] {
  const n = Math.min(40, Math.max(8, count))
  const now = Math.floor(Date.now() / 1000)
  const amounts = [2500000, 1250000, 800000, 1500000, 420000, 975000, 310000, 1880000]
  return Array.from({ length: n }, (_, i) => {
    const amount = amounts[i % amounts.length] + i * 1000
    return {
      payment_id: `pout_bulk_${String(i + 1).padStart(3, '0')}`,
      payout_id: `pout_bulk_${String(i + 1).padStart(3, '0')}`,
      settlement: null,
      bank: null,
      result: 'UNRESOLVED',
      variance_amount: 0,
      reason: 'awaiting_dispatch',
      status: 'pending',
      utr: null,
      amount_minor: amount,
      fund_account_id: `fa_bulk_${String(i + 1).padStart(4, '0')}`,
      currency: 'INR',
      fees: 0,
      tax: 0,
      mode: 'NEFT',
      purpose: 'payout',
      reference_id: `${fileName.replace(/\.[^.]+$/, '')}:${i + 1}`,
      created_at: now,
      payment_provider: 'razorpay',
      exception_type: null,
      status_details: {
        description: 'Awaiting merchant approval of AI route recommendation.',
        source: 'internal',
        reason: 'awaiting_approval',
      },
    }
  })
}
