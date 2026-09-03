import { DEMO_ACTION_CONTRACT_ID } from './actionContractDemo'
import { DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import {
  DEMO_BLOCKED_INDEX,
  DEMO_PAYEE_LABELS,
  DEMO_PAYOUT_AMOUNTS,
  formatDemoInr,
  isDemoRetryIndex,
  isDemoWaitingIndex,
} from './demoPayoutAmounts'

/** Spec 7.9 - Dispatch & Relay demo fixtures (100 payouts). */

export const DISPATCH_RELAY_HEADER = {
  title: 'Dispatch & Relay',
  subtitle: 'Send only sealed instructions through approved rails.',
} as const

export type DispatchMode =
  | 'File export'
  | 'Prepare and sign'
  | 'Connected dispatch'
  | 'Observability only'

export type DispatchStatus =
  | 'Prepared'
  | 'Scheduled'
  | 'Sent'
  | 'Acknowledged'
  | 'Failed'
  | 'Retry eligible'
  | 'Cancelled'
  | 'Processing'
  | 'Outcome observed'

export type FlowStage =
  | 'Prepared'
  | 'Sent'
  | 'Acknowledged'
  | 'Processing'
  | 'Outcome observed'

export type DispatchAttempt = {
  attemptId: string
  idempotencyKey: string
  requestHash: string
  sentAt: string | null
  responseCode: string | null
  providerRef: string | null
  status: DispatchStatus
  note: string
}

export type RouteDecision = {
  provider: string
  rail: string
  reason: string
  sla: string
  feeFxConstraints: string
  fallback: string
}

export type DispatchRow = {
  id: string
  contractId: string
  contractVersion: string
  humanRef: string
  payeeLabel: string
  batchId: string
  amountLabel: string
  amountRupees: number
  sealed: boolean
  mode: DispatchMode
  status: DispatchStatus
  flowStage: FlowStage
  route: RouteDecision
  attempts: DispatchAttempt[]
  outboxReceipt: string | null
  contractHash: string
  traceHref: string
  contractHref: string
}

export const DISPATCH_FLOW_STAGES: FlowStage[] = [
  'Prepared',
  'Sent',
  'Acknowledged',
  'Processing',
  'Outcome observed',
]

const PAYEES = [...DEMO_PAYEE_LABELS]

/** Re-export canonical amounts for callers that import from dispatch. */
export {
  DEMO_PAYOUT_AMOUNTS,
  DEMO_PAYEE_LABELS,
  demoIntendedPaymentValue,
  demoPayoutAmount,
  demoPayeeLabel,
  formatDemoInr,
} from './demoPayoutAmounts'

const AMOUNTS = DEMO_PAYOUT_AMOUNTS

const MODES: DispatchMode[] = [
  'Prepare and sign',
  'Connected dispatch',
  'File export',
  'Connected dispatch',
  'Observability only',
  'Prepare and sign',
  'Connected dispatch',
  'Prepare and sign',
  'File export',
  'Connected dispatch',
  'Prepare and sign',
  'Connected dispatch',
  'Prepare and sign',
  'File export',
  'Connected dispatch',
  'Observability only',
  'Prepare and sign',
  'Connected dispatch',
  'Prepare and sign',
  'Prepare and sign', // #20 blocked/unsealed style - will override
]

/** After India Dispatch batch, every sealed instruction has left the house. */
function lifecycleFor(i: number): { status: DispatchStatus; flow: FlowStage; sealed: boolean } {
  if (i === DEMO_BLOCKED_INDEX) {
    return { status: 'Cancelled', flow: 'Prepared', sealed: false }
  }
  if (isDemoRetryIndex(i)) {
    return { status: 'Retry eligible', flow: 'Sent', sealed: true }
  }
  if (isDemoWaitingIndex(i)) {
    return { status: 'Acknowledged', flow: 'Acknowledged', sealed: true }
  }
  return { status: 'Outcome observed', flow: 'Outcome observed', sealed: true }
}

const PROVIDERS = [
  { provider: 'HDFC Bank · corporate payout', rail: 'NEFT' },
  { provider: 'ICICI · payout API', rail: 'IMPS' },
  { provider: 'SBI · file gateway', rail: 'Bulk NEFT file' },
  { provider: 'Axis · corporate API', rail: 'NEFT' },
  { provider: 'External treasury desk', rail: 'Observed NEFT' },
]

function hashFor(n: number): string {
  const hex = (n * 7919 + 104729).toString(16).padStart(8, '0')
  return `sha256:${hex}${(n * 13).toString(16).padStart(8, '0')}${(n * 97).toString(16).padStart(48, '0')}`.slice(
    0,
    71,
  )
}

function buildAttempts(
  n: number,
  status: DispatchStatus,
  hash: string,
  humanRef: string,
): DispatchAttempt[] {
  const key = `idem_${humanRef.toLowerCase().replace(/-/g, '_')}_neft_v1`
  if (status === 'Prepared' || status === 'Scheduled' || status === 'Cancelled') return []
  if (status === 'Retry eligible' || status === 'Failed') {
    return [
      {
        attemptId: `att-${String(n).padStart(4, '0')}-a1`,
        idempotencyKey: key,
        requestHash: hash,
        sentAt: '12 Jun 2026 · 10:40:22 IST',
        responseCode: '503 Unavailable',
        providerRef: null,
        status: 'Failed',
        note: 'Transient provider error - failed attempt did not create a new obligation',
      },
      ...(status === 'Retry eligible'
        ? [
            {
              attemptId: `att-${String(n).padStart(4, '0')}-a2`,
              idempotencyKey: key,
              requestHash: hash,
              sentAt: null,
              responseCode: null,
              providerRef: null,
              status: 'Retry eligible' as const,
              note: 'Retry preserves original idempotency key and contract hash',
            },
          ]
        : []),
    ]
  }
  const ack = status === 'Acknowledged' || status === 'Processing' || status === 'Outcome observed'
  return [
    {
      attemptId: `att-${String(n).padStart(4, '0')}-a1`,
      idempotencyKey: key,
      requestHash: hash,
      sentAt: '12 Jun 2026 · 10:02:11 IST',
      responseCode: status === 'Sent' ? 'FILE_QUEUED' : '202 Accepted',
      providerRef: ack ? `HDFC-UTR-${8800000000 + n}` : null,
      status: status === 'Sent' ? 'Sent' : 'Acknowledged',
      note: ack
        ? 'Provider ack received · request hash matches sealed contract v1'
        : 'Instruction sent · awaiting acknowledgement',
    },
  ]
}

/** 100 payouts - table list; open one for attempt ledger / route. */
export const DEMO_DISPATCH_ROWS: DispatchRow[] = Array.from(
  { length: DEMO_PAYOUT_AMOUNTS.length },
  (_, i) => {
    const n = i + 1
    const humanRef = `PAY-${String(n).padStart(4, '0')}`
    const contractId = n === 1 ? DEMO_ACTION_CONTRACT_ID : `PAC-${String(n).padStart(4, '0')}`
    const blocked = i === DEMO_BLOCKED_INDEX
    const cycle = i % 19
    const { status, flow, sealed } = lifecycleFor(i)
    const mode = blocked ? 'Prepare and sign' : MODES[cycle]!
    const amount = AMOUNTS[i]!
    const hash = sealed ? hashFor(n) : '- (not sealed)'
    const rail = PROVIDERS[i % PROVIDERS.length]!

    return {
      id: `dsp-${String(n).padStart(4, '0')}`,
      contractId,
      contractVersion: sealed ? 'v1' : 'draft',
      humanRef,
      payeeLabel: PAYEES[i]!,
      batchId: DEMO_SMOKE_BATCH_ID,
      amountLabel: formatDemoInr(amount),
      amountRupees: amount,
      sealed,
      mode: !sealed ? 'Prepare and sign' : mode,
      status,
      flowStage: flow,
      route: {
        provider: sealed ? rail.provider : '-',
        rail: sealed ? rail.rail : '-',
        reason: sealed
          ? 'Sealed contract rail match · policy-approved envelope'
          : 'Unsealed - cannot dispatch',
        sla: sealed ? 'Credit expected T+0 banking hours' : '-',
        feeFxConstraints: sealed ? 'Domestic - no FX; rail fee outside contract net' : '-',
        fallback: sealed
          ? 'No alternate beneficiary · no rail switch without amendment'
          : 'Seal required first',
      },
      attempts: sealed ? buildAttempts(n, status, hash, humanRef) : [],
      outboxReceipt: status === 'Prepared' || status === 'Cancelled' ? null : `outbox-${String(n).padStart(4, '0')}`,
      contractHash: hash,
      traceHref: `/payments/${humanRef}/trace`,
      contractHref: `/contracts/${contractId}`,
    }
  },
)

export function flowStageIndex(stage: FlowStage): number {
  return DISPATCH_FLOW_STAGES.indexOf(stage)
}

/** India batch-level dispatch summary — sealed contracts only; Zord does not hold funds. */
export function indiaBatchDispatchSummary() {
  const sealed = DEMO_DISPATCH_ROWS.filter((r) => r.sealed)
  const held = DEMO_DISPATCH_ROWS.filter((r) => !r.sealed)
  const counts = new Map<string, { provider: string; rail: string; count: number }>()
  for (const r of sealed) {
    const key = `${r.route.provider}|${r.route.rail}`
    const prev = counts.get(key)
    if (prev) prev.count += 1
    else counts.set(key, { provider: r.route.provider, rail: r.route.rail, count: 1 })
  }
  const rails = [...counts.values()].sort((a, b) => b.count - a.count)
  const primary = rails[0] ?? {
    provider: 'HDFC Bank · corporate payout',
    rail: 'NEFT',
    count: 0,
  }
  return {
    payoutCount: DEMO_DISPATCH_ROWS.length,
    sealedCount: sealed.length,
    heldCount: held.length,
    heldRefs: held.map((r) => r.humanRef),
    primary,
    rails,
  }
}

export function modeBannerCopy(mode: DispatchMode): {
  title: string
  body: string
  showDispatchNow: boolean
  primaryLabel: string
} {
  switch (mode) {
    case 'File export':
      return {
        title: 'File export',
        body: 'Export the signed payout file for bank upload. No connected send from Zord.',
        showDispatchNow: false,
        primaryLabel: 'Export signed payout file',
      }
    case 'Prepare and sign':
      return {
        title: 'Prepare and sign',
        body: 'Seal is already done. Dispatch prepares the signed instruction for the approved rail.',
        showDispatchNow: true,
        primaryLabel: 'Dispatch sealed contract',
      }
    case 'Connected dispatch':
      return {
        title: 'Connected dispatch',
        body: 'Zord can send through the connected provider. Duplicate clicks reuse the same idempotency key.',
        showDispatchNow: true,
        primaryLabel: 'Dispatch now',
      }
    case 'Observability only':
      return {
        title: 'Observability only',
        body: 'Zord does not send. Record an external dispatch reference - no active send button.',
        showDispatchNow: false,
        primaryLabel: 'Record external dispatch reference',
      }
  }
}
