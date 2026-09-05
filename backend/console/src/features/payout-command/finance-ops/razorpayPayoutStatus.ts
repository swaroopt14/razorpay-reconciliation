import type { JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

/** RazorpayX payout lifecycle statuses (docs). */
export type RazorpayPayoutStatus =
  | 'pending'
  | 'scheduled'
  | 'queued'
  | 'processing'
  | 'processed'
  | 'reversed'
  | 'cancelled'
  | 'rejected'
  | 'failed'

export type StatusBadgeTone = 'captured' | 'pending' | 'failed' | 'created'

const PAYOUT_STATUSES: RazorpayPayoutStatus[] = [
  'pending',
  'scheduled',
  'queued',
  'processing',
  'processed',
  'reversed',
  'cancelled',
  'rejected',
  'failed',
]

/** Badge color for a Razorpay payout status. */
export function payoutStatusTone(status: RazorpayPayoutStatus): StatusBadgeTone {
  if (status === 'processed') return 'captured'
  if (status === 'failed' || status === 'reversed' || status === 'cancelled' || status === 'rejected') {
    return 'failed'
  }
  if (status === 'pending' || status === 'scheduled' || status === 'queued') return 'pending'
  return 'created'
}

function haystackForRow(row: JournalIntentRow): string {
  return [
    row.rawIntent?.status,
    row.engineStatus,
    row.rawIntent?.business_state,
    row.rawIntent?.governance_state,
    row.lifecycleStage,
    row.status,
    row.policyStatus,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function findExplicitPayoutStatus(text: string): RazorpayPayoutStatus | null {
  for (const status of PAYOUT_STATUSES) {
    if (new RegExp(`(^|[^a-z])${status}([^a-z]|$)`).test(text)) return status
  }
  return null
}

/**
 * Map a journal intent row to the Razorpay payout status we show in Finance Ops.
 * Prefer an explicit provider/engine status when present; otherwise derive from lifecycle.
 */
export function mapIntentRowToPayoutStatus(row: JournalIntentRow): RazorpayPayoutStatus {
  const direct = String(row.rawIntent?.status || '')
    .trim()
    .toLowerCase()
  if ((PAYOUT_STATUSES as string[]).includes(direct)) {
    return direct as RazorpayPayoutStatus
  }

  const hay = haystackForRow(row)
  const explicit = findExplicitPayoutStatus(hay)
  if (explicit) return explicit

  if (hay.includes('revers')) return 'reversed'
  if (hay.includes('cancel')) return 'cancelled'
  if (hay.includes('reject')) return 'rejected'
  if (hay.includes('fail') || hay.includes('error')) return 'failed'

  const life = (row.lifecycleStage || '').toLowerCase()
  if (life.includes('block') || row.policyStatus === 'Block') return 'rejected'
  if (life.includes('review') || row.status === 'Needs Review') return 'pending'
  if (life.includes('ready') || row.status === 'Ready to Process') return 'scheduled'
  if (life.includes('seal') || row.status === 'In Progress') return 'processing'
  if (life.includes('dispatch') || row.status === 'Confirmed') return 'processed'
  if (row.status === 'Pending') return 'pending'

  return 'processing'
}

export function isReviewPayoutStatus(status: RazorpayPayoutStatus): boolean {
  // In-flight / not yet terminal success — includes processing.
  return (
    status === 'pending' ||
    status === 'scheduled' ||
    status === 'queued' ||
    status === 'processing'
  )
}

export function isFailedPayoutStatus(status: RazorpayPayoutStatus): boolean {
  return (
    status === 'failed' ||
    status === 'rejected' ||
    status === 'cancelled' ||
    status === 'reversed'
  )
}

/** Successful = fully processed only (not still processing). */
export function isSuccessfulPayoutStatus(status: RazorpayPayoutStatus): boolean {
  return status === 'processed'
}
