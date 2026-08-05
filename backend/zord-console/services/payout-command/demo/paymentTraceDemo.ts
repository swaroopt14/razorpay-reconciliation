import { DEMO_ACTION_CONTRACT_ID } from './actionContractDemo'
import { DEMO_DISPATCH_ROWS } from './dispatchRelayDemo'
import { DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'

/** Spec 7.10 - Payment Trace demo fixtures. */

export const PAYMENT_TRACE_HEADER = {
  title: 'Payment Trace',
  subtitle: 'Follow the exact instruction from dispatch to final outcome.',
} as const

export type TraceLifecycle =
  | 'Intent received'
  | 'Policy passed'
  | 'Contract sealed'
  | 'Request sent'
  | 'Provider acknowledged'
  | 'Bank accepted'
  | 'Settlement observed'
  | 'Outcome decided'
  | 'Proof generated'
  | 'Blocked'

export type DriftKind = 'No material change' | 'Field changed' | 'Unsupported signal'

export type TraceEventSource =
  | 'ERP / source'
  | 'Policy engine'
  | 'Action Contract'
  | 'Dispatch outbox'
  | 'Provider API'
  | 'Bank file ingestion'
  | 'Settlement feed'
  | 'Outcome review'
  | 'Proof center'

export type TraceEvent = {
  id: string
  time: string
  title: string
  source: TraceEventSource
  objectId: string
  externalRef: string | null
  status: string
  integrityState: 'Verified' | 'Pending' | 'File-based' | 'Missing'
  latency: string
  /** File events must say file ingestion, not real-time. */
  fileIngestion?: boolean
  detail: string
}

export type TraceSignal = {
  id: string
  name: string
  source: TraceEventSource
  receivedAt: string | null
  expected: boolean
  status: 'Received' | 'Waiting' | 'Overdue' | 'N/A'
  note: string
}

export type TraceAttempt = {
  attemptId: string
  sentAt: string | null
  responseCode: string | null
  providerRef: string | null
  requestHash: string
  status: string
}

export type TraceFile = {
  id: string
  name: string
  ingestedAt: string
  kind: string
  rows: number
  note: string
}

export type DriftResult = {
  kind: DriftKind
  summary: string
  contractField: string | null
  sealedValue: string | null
  observedValue: string | null
}

export type PaymentTrace = {
  paymentId: string
  humanRef: string
  contractId: string
  batchId: string
  payeeLabel: string
  amountLabel: string
  lifecycle: TraceLifecycle
  freshness: {
    lastProviderSignal: string
    expectedNextSignal: string
    slaStatus: 'On track' | 'Watch' | 'Breached' | 'Complete'
  }
  drift: DriftResult
  events: TraceEvent[]
  signals: TraceSignal[]
  attempts: TraceAttempt[]
  files: TraceFile[]
  technicalLog: string[]
  links: {
    contractHref: string
    dispatchHref: string
    proofHref: string
    evidenceHref: string
  }
}

const LIFECYCLE_BY_DISPATCH: Record<string, TraceLifecycle> = {
  Prepared: 'Contract sealed',
  Scheduled: 'Contract sealed',
  Sent: 'Request sent',
  Acknowledged: 'Provider acknowledged',
  Processing: 'Bank accepted',
  'Outcome observed': 'Settlement observed',
  Failed: 'Request sent',
  'Retry eligible': 'Request sent',
  Cancelled: 'Blocked',
}

function buildEvents(
  ref: string,
  contractId: string,
  lifecycle: TraceLifecycle,
  providerRef: string | null,
  hasFile: boolean,
  shortSettlement: boolean,
): TraceEvent[] {
  const base: TraceEvent[] = [
    {
      id: `${ref}-e1`,
      time: '12 Jun 2026 · 09:12 IST',
      title: 'Intent received',
      source: 'ERP / source',
      objectId: `INT-${ref.replace('PAY-', '')}`,
      externalRef: `AP-${ref.slice(-4)}`,
      status: 'Received',
      integrityState: 'Verified',
      latency: '-',
      detail: 'Obligation ingested from authorised source extract.',
    },
    {
      id: `${ref}-e2`,
      time: '12 Jun 2026 · 09:28 IST',
      title: 'Policy passed',
      source: 'Policy engine',
      objectId: `PD-${ref.replace('PAY-', '')}`,
      externalRef: null,
      status: 'Pass',
      integrityState: 'Verified',
      latency: '16m',
      detail: 'Enterprise default v3 · all required controls passed.',
    },
    {
      id: `${ref}-e3`,
      time: '12 Jun 2026 · 09:44 IST',
      title: 'Contract sealed',
      source: 'Action Contract',
      objectId: contractId,
      externalRef: null,
      status: 'Sealed',
      integrityState: 'Verified',
      latency: '16m',
      detail: 'Payment Action Contract v1 immutable · hash written.',
    },
  ]

  if (lifecycle === 'Blocked') {
    base[1] = {
      ...base[1]!,
      title: 'Policy blocked',
      status: 'Block',
      detail: 'Seal/dispatch held - see Control Review.',
    }
    return base.slice(0, 2)
  }

  const sent: TraceEvent = {
    id: `${ref}-e4`,
    time: '12 Jun 2026 · 10:02 IST',
    title: 'Request sent',
    source: 'Dispatch outbox',
    objectId: `att-${ref.replace('PAY-', '')}-a1`,
    externalRef: null,
    status: 'Sent',
    integrityState: 'Verified',
    latency: '18m',
    detail: 'Sealed instruction dispatched on approved rail.',
  }

  const ack: TraceEvent = {
    id: `${ref}-e5`,
    time: '12 Jun 2026 · 10:03 IST',
    title: 'Provider acknowledged',
    source: 'Provider API',
    objectId: `ack-${ref.replace('PAY-', '')}`,
    externalRef: providerRef,
    status: 'Acknowledged',
    integrityState: 'Verified',
    latency: '62s',
    detail: 'Provider accepted request · UTR / provider ref attached.',
  }

  const bank: TraceEvent = {
    id: `${ref}-e6`,
    time: '12 Jun 2026 · 14:20 IST',
    title: 'Bank accepted',
    source: hasFile ? 'Bank file ingestion' : 'Provider API',
    objectId: hasFile ? `file-${ref.replace('PAY-', '')}` : `bank-${ref.replace('PAY-', '')}`,
    externalRef: providerRef,
    status: 'Accepted',
    integrityState: hasFile ? 'File-based' : 'Verified',
    latency: hasFile ? 'file lag' : '4h',
    fileIngestion: hasFile,
    detail: hasFile
      ? 'File ingestion - not a real-time callback. Bank acceptance row matched provider ref.'
      : 'Bank accepted credit instruction.',
  }

  const settle: TraceEvent = {
    id: `${ref}-e7`,
    time: '12 Jun 2026 · 16:05 IST',
    title: 'Settlement observed',
    source: 'Settlement feed',
    objectId: `set-${ref.replace('PAY-', '')}`,
    externalRef: providerRef,
    status: shortSettlement ? 'Short' : 'Exact',
    integrityState: 'Verified',
    latency: '1h 45m',
    detail: shortSettlement
      ? 'Observed credit below sealed amount - drift recorded.'
      : 'Observed credit matches sealed expected amount.',
  }

  const outcome: TraceEvent = {
    id: `${ref}-e8`,
    time: '12 Jun 2026 · 16:10 IST',
    title: 'Outcome decided',
    source: 'Outcome review',
    objectId: `out-${ref.replace('PAY-', '')}`,
    externalRef: null,
    status: shortSettlement ? 'Needs review' : 'Exact match',
    integrityState: 'Verified',
    latency: '5m',
    detail: shortSettlement
      ? 'Match decision requires review for short settlement.'
      : 'Exact match against Payment Action Contract.',
  }

  const proof: TraceEvent = {
    id: `${ref}-e9`,
    time: '12 Jun 2026 · 16:15 IST',
    title: 'Proof generated',
    source: 'Proof center',
    objectId: `evp-${ref.replace('PAY-', '')}`,
    externalRef: null,
    status: shortSettlement ? 'Partial' : 'Complete',
    integrityState: 'Verified',
    latency: '5m',
    detail: shortSettlement
      ? 'Evidence pack generated with partial coverage.'
      : 'Evidence pack ready for export / verify.',
  }

  const order: TraceLifecycle[] = [
    'Intent received',
    'Policy passed',
    'Contract sealed',
    'Request sent',
    'Provider acknowledged',
    'Bank accepted',
    'Settlement observed',
    'Outcome decided',
    'Proof generated',
  ]
  const idx = order.indexOf(lifecycle)
  const extras = [sent, ack, bank, settle, outcome, proof]
  return [...base, ...extras.slice(0, Math.max(0, idx - 2))]
}

function buildTraceFromDispatch(i: number): PaymentTrace {
  const row = DEMO_DISPATCH_ROWS[i]!
  const lifecycle = LIFECYCLE_BY_DISPATCH[row.status] ?? 'Contract sealed'
  const providerRef = row.attempts.find((a) => a.providerRef)?.providerRef ?? null
  const hasFile = row.mode === 'File export'
  const shortSettlement = i === 18 // PAY-0019 short settlement demo
  const drift: DriftResult =
    shortSettlement &&
    (lifecycle === 'Settlement observed' ||
      lifecycle === 'Outcome decided' ||
      lifecycle === 'Proof generated')
      ? {
          kind: 'Field changed',
          summary:
            'Observed credited amount is below the sealed expected amount. Drift links to commercial terms · net amount.',
          contractField: 'terms.netAmount',
          sealedValue: row.amountLabel,
          observedValue: '₹2,60,000',
        }
      : i === 12 && row.status === 'Failed'
        ? {
            kind: 'Unsupported signal',
            summary: 'Provider returned an unsupported error payload. Lifecycle order preserved; retry eligible.',
            contractField: null,
            sealedValue: null,
            observedValue: '503 Unavailable (opaque body)',
          }
        : {
            kind: 'No material change',
            summary: 'No material field changed versus the sealed Payment Action Contract.',
            contractField: null,
            sealedValue: null,
            observedValue: null,
          }

  const events = buildEvents(
    row.humanRef,
    row.contractId,
    lifecycle,
    providerRef,
    hasFile,
    shortSettlement,
  )

  const late =
    lifecycle === 'Request sent' || lifecycle === 'Provider acknowledged' || lifecycle === 'Bank accepted'

  return {
    paymentId: row.humanRef,
    humanRef: row.humanRef,
    contractId: row.contractId === DEMO_ACTION_CONTRACT_ID ? DEMO_ACTION_CONTRACT_ID : row.contractId,
    batchId: DEMO_SMOKE_BATCH_ID,
    payeeLabel: row.payeeLabel,
    amountLabel: row.amountLabel,
    lifecycle,
    freshness: {
      lastProviderSignal: providerRef
        ? `12 Jun 2026 · ${lifecycle === 'Contract sealed' ? '-' : '10:03 IST'} · ${providerRef}`
        : lifecycle === 'Blocked' || lifecycle === 'Contract sealed'
          ? 'None yet'
          : 'Waiting',
      expectedNextSignal:
        lifecycle === 'Proof generated' || lifecycle === 'Outcome decided'
          ? 'None - lifecycle complete for this path'
          : lifecycle === 'Settlement observed'
            ? 'Outcome decision'
            : lifecycle === 'Bank accepted'
              ? 'Settlement credit signal'
              : lifecycle === 'Provider acknowledged'
                ? 'Bank acceptance / settlement'
                : lifecycle === 'Request sent'
                  ? 'Provider acknowledgement'
                  : lifecycle === 'Blocked'
                    ? 'Control Review resolution'
                    : 'Dispatch attempt',
      slaStatus:
        lifecycle === 'Proof generated' || lifecycle === 'Outcome decided'
          ? 'Complete'
          : late
            ? 'Watch'
            : lifecycle === 'Blocked'
              ? 'Breached'
              : 'On track',
    },
    drift,
    events,
    signals: [
      {
        id: 'sig-provider',
        name: 'Provider acknowledgement',
        source: 'Provider API',
        receivedAt: providerRef ? '12 Jun 2026 · 10:03 IST' : null,
        expected: true,
        status: providerRef ? 'Received' : late ? 'Waiting' : 'N/A',
        note: providerRef ? `Ref ${providerRef}` : 'Expected from connected provider or file ack',
      },
      {
        id: 'sig-bank',
        name: 'Bank acceptance',
        source: hasFile ? 'Bank file ingestion' : 'Provider API',
        receivedAt:
          lifecycle === 'Bank accepted' ||
          lifecycle === 'Settlement observed' ||
          lifecycle === 'Outcome decided' ||
          lifecycle === 'Proof generated'
            ? '12 Jun 2026 · 14:20 IST'
            : null,
        expected: true,
        status:
          lifecycle === 'Bank accepted' ||
          lifecycle === 'Settlement observed' ||
          lifecycle === 'Outcome decided' ||
          lifecycle === 'Proof generated'
            ? 'Received'
            : lifecycle === 'Provider acknowledged'
              ? 'Waiting'
              : 'N/A',
        note: hasFile ? 'Labelled as file ingestion - not real-time callback' : 'Live provider signal',
      },
      {
        id: 'sig-settle',
        name: 'Settlement credit',
        source: 'Settlement feed',
        receivedAt:
          lifecycle === 'Settlement observed' ||
          lifecycle === 'Outcome decided' ||
          lifecycle === 'Proof generated'
            ? '12 Jun 2026 · 16:05 IST'
            : null,
        expected: true,
        status:
          lifecycle === 'Settlement observed' ||
          lifecycle === 'Outcome decided' ||
          lifecycle === 'Proof generated'
            ? 'Received'
            : lifecycle === 'Bank accepted'
              ? 'Waiting'
              : 'N/A',
        note: shortSettlement ? 'Short vs sealed amount' : 'Exact match expected',
      },
    ],
    attempts: row.attempts.map((a) => ({
      attemptId: a.attemptId,
      sentAt: a.sentAt,
      responseCode: a.responseCode,
      providerRef: a.providerRef,
      requestHash: a.requestHash,
      status: a.status,
    })),
    files: hasFile
      ? [
          {
            id: `file-${row.humanRef}`,
            name: `neft_ack_${row.humanRef.toLowerCase()}.csv`,
            ingestedAt: '12 Jun 2026 · 14:18 IST',
            kind: 'Bank acknowledgement file',
            rows: 1,
            note: 'File ingestion - not a real-time webhook',
          },
        ]
      : shortSettlement
        ? [
            {
              id: `file-set-${row.humanRef}`,
              name: `settlement_${row.humanRef.toLowerCase()}.csv`,
              ingestedAt: '12 Jun 2026 · 16:02 IST',
              kind: 'Settlement observation file',
              rows: 1,
              note: 'File ingestion of settlement credit row',
            },
          ]
        : [],
    technicalLog: [
      `trace.payment_id=${row.humanRef}`,
      `trace.contract_id=${row.contractId}`,
      `trace.lifecycle=${lifecycle}`,
      `trace.drift=${drift.kind}`,
      `trace.batch_id=${DEMO_SMOKE_BATCH_ID}`,
      ...(providerRef ? [`trace.provider_ref=${providerRef}`] : []),
      `trace.ordering=canonical (out-of-order display allowed; lifecycle not corrupted)`,
    ],
    links: {
      contractHref: row.contractHref,
      dispatchHref: `/execution/dispatches?contract=${encodeURIComponent(row.contractId)}`,
      proofHref: `/sandbox?dock=proof&batch_id=${DEMO_SMOKE_BATCH_ID}`,
      evidenceHref: `/sandbox?dock=proof&batch_id=${DEMO_SMOKE_BATCH_ID}`,
    },
  }
}

export const DEMO_PAYMENT_TRACES: PaymentTrace[] = DEMO_DISPATCH_ROWS.map((_, i) =>
  buildTraceFromDispatch(i),
)

const TRACE_BY_ID: Record<string, PaymentTrace> = Object.fromEntries(
  DEMO_PAYMENT_TRACES.flatMap((t) => [
    [t.paymentId, t],
    [t.paymentId.toLowerCase(), t],
    [t.humanRef, t],
  ]),
)

export function getPaymentTraceById(id: string): PaymentTrace | null {
  const key = decodeURIComponent(id.trim())
  if (!key) return null
  return TRACE_BY_ID[key] ?? TRACE_BY_ID[key.toUpperCase()] ?? TRACE_BY_ID[key.toLowerCase()] ?? null
}

export const DEFAULT_TRACE_PAYMENT_ID = 'PAY-0001'

export type TraceBatch = {
  batchId: string
  label: string
  payoutCount: number
  totalAmountLabel: string
  completeCount: number
  watchingCount: number
  blockedCount: number
}

export function tracesForBatch(traces: PaymentTrace[], batchId: string): PaymentTrace[] {
  return traces.filter((t) => t.batchId === batchId)
}

export function buildTraceBatches(traces: PaymentTrace[]): TraceBatch[] {
  const byBatch = new Map<string, PaymentTrace[]>()
  for (const t of traces) {
    const list = byBatch.get(t.batchId) ?? []
    list.push(t)
    byBatch.set(t.batchId, list)
  }
  return [...byBatch.entries()].map(([batchId, list]) => {
    const completeCount = list.filter(
      (t) => t.lifecycle === 'Proof generated' || t.lifecycle === 'Outcome decided',
    ).length
    const blockedCount = list.filter((t) => t.lifecycle === 'Blocked').length
    const watchingCount = list.filter(
      (t) =>
        t.freshness.slaStatus === 'Watch' ||
        t.freshness.slaStatus === 'Breached' ||
        t.drift.kind !== 'No material change',
    ).length
    return {
      batchId,
      label: batchId === DEMO_SMOKE_BATCH_ID ? 'Batch 001' : batchId,
      payoutCount: list.length,
      totalAmountLabel: `${list.length} payouts`,
      completeCount,
      watchingCount,
      blockedCount,
    }
  })
}

export function traceOverviewStats(traces: PaymentTrace[]) {
  return {
    payoutCount: traces.length,
    completeCount: traces.filter(
      (t) => t.lifecycle === 'Proof generated' || t.lifecycle === 'Outcome decided',
    ).length,
    watchingCount: traces.filter(
      (t) => t.freshness.slaStatus === 'Watch' || t.freshness.slaStatus === 'Breached',
    ).length,
    driftCount: traces.filter((t) => t.drift.kind !== 'No material change').length,
    blockedCount: traces.filter((t) => t.lifecycle === 'Blocked').length,
  }
}
