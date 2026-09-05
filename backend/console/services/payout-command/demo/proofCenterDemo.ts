import { DEMO_DISPATCH_ROWS } from './dispatchRelayDemo'
import { DEMO_SETTLEMENT_ROWS, type SettlementOutcome, type SignalMethod } from './settlementJournalDemo'
import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'

/** Spec 7.14 - Proof Center demo fixtures. */

export const PROOF_CENTER_HEADER = {
  title: 'Evidence',
  subtitle: 'Tamper-evident packs with Merkle root verification for every payout and recon decision.',
} as const

/** Coverage levels - exact Spec 7.14 labels. */
export type CoverageLevel =
  | 'P0 Captured'
  | 'P1 Source authenticated'
  | 'P2 Authority proven'
  | 'P3 Instruction proven'
  | 'P4 Outcome proven'
  | 'P5 Business complete'

export type IntegrityStatus = 'Verified' | 'Failed' | 'Pending'
export type GovernanceStatus = 'Passed' | 'Need review' | 'Partial'
export type BusinessOutcomeStatus = 'Exact' | 'Need review'

export type ProofSignalSource =
  | 'API webhook'
  | 'Razorpay API'
  | 'Provider API'
  | 'Bank statement'
  | 'Settlement file'
  | 'Ledger'

export type EvidenceItemKind =
  | 'Payout instruction'
  | 'Provider acknowledgement'
  | 'Processing webhook'
  | 'Outcome webhook'
  | 'Bank credit'
  | 'Ledger posting'
  | 'Settlement record'
  | 'Match decision'

export type EvidenceItem = {
  id: string
  kind: EvidenceItemKind
  available: boolean
  hash: string | null
  note: string
  source?: ProofSignalSource
  href?: string
}

export type TimelineEvent = {
  at: string
  label: string
  detail: string
  source: ProofSignalSource
  status: 'ok' | 'review' | 'missing'
}

export type GraphNode = {
  id: string
  label: string
  state: 'Valid' | 'Missing' | 'Invalid' | 'Derived'
  technicalId?: string
}

export type ProofWebhookEvent = {
  at: string
  event: string
  source: ProofSignalSource
  status: 'received' | 'review'
  detail: string
}

export type ProofSourceRow = {
  stage: string
  provider: 'yes' | 'no' | 'na'
  bank: 'yes' | 'no' | 'na'
  webhook: 'yes' | 'no' | 'na'
  ledger: 'yes' | 'no' | 'na'
}

export type ProofPack = {
  id: string
  paymentRef: string
  contractId: string
  payeeLabel: string
  batchId: string
  batchLabel: string
  /** Business outcome - Exact (processed) or Need review (exception). Never failed / not processed. */
  businessOutcome: BusinessOutcomeStatus
  /** Underlying settlement reason shown in notes, not as the status chip. */
  outcomeDetail: string
  integrity: IntegrityStatus
  governance: GovernanceStatus
  coverage: CoverageLevel
  coverageRank: 0 | 1 | 2 | 3 | 4 | 5
  generatedAt: string
  amountLabel: string
  packHash: string
  merkleRoot: string
  signature: string
  verifyScopeNote: string
  missingItems: string[]
  evidence: EvidenceItem[]
  timeline: TimelineEvent[]
  webhooks: ProofWebhookEvent[]
  sources: ProofSourceRow[]
  signalSource: ProofSignalSource
  graph: GraphNode[]
  contractHref: string
  traceHref: string
  outcomeHref: string
}

export type ProofBatch = {
  batchId: string
  label: string
  packCount: number
  p5Count: number
  verifiedCount: number
  exceptionCount: number
}

export const COVERAGE_LADDER: { level: CoverageLevel; rank: number; blurb: string }[] = [
  { level: 'P0 Captured', rank: 0, blurb: 'Payout instruction landed from Razorpay API' },
  { level: 'P1 Source authenticated', rank: 1, blurb: 'Provider identity attested' },
  { level: 'P2 Authority proven', rank: 2, blurb: 'payout.pending / processing webhooks bound' },
  { level: 'P3 Instruction proven', rank: 3, blurb: 'Payout accepted on the rail' },
  { level: 'P4 Outcome proven', rank: 4, blurb: 'payout.processed / bank credit bound' },
  { level: 'P5 Business complete', rank: 5, blurb: 'Match decision + business close-out' },
]

const HASH_PREFIX: Record<EvidenceItemKind, string> = {
  'Payout instruction': 'pout',
  'Provider acknowledgement': 'pend',
  'Processing webhook': 'proc',
  'Outcome webhook': 'outc',
  'Bank credit': 'bank',
  'Ledger posting': 'ledg',
  'Settlement record': 'sett',
  'Match decision': 'matc',
}

function mapSignalSource(method: SignalMethod): ProofSignalSource {
  if (method === 'Webhook') return 'API webhook'
  if (method === 'API response') return 'Razorpay API'
  if (method === 'Bank/PSP file') return 'Bank statement'
  if (method === 'Ledger feed') return 'Ledger'
  return 'Settlement file'
}

function bankSource(signalSource: ProofSignalSource): ProofSignalSource {
  if (signalSource === 'Settlement file') return 'Settlement file'
  return 'Bank statement'
}

function baseEvidence(overrides: Partial<Record<EvidenceItemKind, Partial<EvidenceItem>>> = {}): EvidenceItem[] {
  const kinds: EvidenceItemKind[] = [
    'Payout instruction',
    'Provider acknowledgement',
    'Processing webhook',
    'Outcome webhook',
    'Bank credit',
    'Ledger posting',
    'Settlement record',
    'Match decision',
  ]
  const defaultSource: Record<EvidenceItemKind, ProofSignalSource> = {
    'Payout instruction': 'Razorpay API',
    'Provider acknowledgement': 'API webhook',
    'Processing webhook': 'API webhook',
    'Outcome webhook': 'API webhook',
    'Bank credit': 'Bank statement',
    'Ledger posting': 'Ledger',
    'Settlement record': 'Bank statement',
    'Match decision': 'Ledger',
  }
  return kinds.map((kind, i) => {
    const o = overrides[kind] ?? {}
    return {
      id: `ev-${i}`,
      kind,
      available: o.available ?? true,
      hash: o.hash ?? (o.available === false ? null : `sha256:${HASH_PREFIX[kind]}_${i}a9f`),
      note: o.note ?? 'Present in pack',
      source: o.source ?? defaultSource[kind],
      href: o.href,
    }
  })
}

function hexTail(n: number): string {
  return ((n * 7919 + 104729) >>> 0).toString(16).padStart(8, '0')
}

function isExceptionOutcome(outcome: SettlementOutcome): boolean {
  return outcome === 'Short' || outcome === 'Returned' || outcome === 'Reversal' || outcome === 'Missing reference'
}

function sourcesFor(kind: 'processed' | 'exception' | 'waiting' | 'blocked'): ProofSourceRow[] {
  if (kind === 'blocked') {
    return [
      { stage: 'Initiated', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'yes' },
      { stage: 'Routed', provider: 'yes', bank: 'na', webhook: 'no', ledger: 'na' },
      { stage: 'Acknowledged', provider: 'no', bank: 'na', webhook: 'no', ledger: 'na' },
      { stage: 'Processing', provider: 'no', bank: 'na', webhook: 'no', ledger: 'na' },
      { stage: 'Credited', provider: 'no', bank: 'no', webhook: 'no', ledger: 'no' },
      { stage: 'Reconciled', provider: 'na', bank: 'no', webhook: 'na', ledger: 'yes' },
    ]
  }
  if (kind === 'waiting') {
    return [
      { stage: 'Initiated', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'yes' },
      { stage: 'Routed', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
      { stage: 'Acknowledged', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
      { stage: 'Processing', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
      { stage: 'Credited', provider: 'no', bank: 'no', webhook: 'no', ledger: 'no' },
      { stage: 'Reconciled', provider: 'na', bank: 'no', webhook: 'na', ledger: 'yes' },
    ]
  }
  if (kind === 'exception') {
    return [
      { stage: 'Initiated', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'yes' },
      { stage: 'Routed', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
      { stage: 'Acknowledged', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
      { stage: 'Processing', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
      { stage: 'Credited', provider: 'yes', bank: 'yes', webhook: 'yes', ledger: 'yes' },
      { stage: 'Reconciled', provider: 'na', bank: 'yes', webhook: 'na', ledger: 'yes' },
    ]
  }
  return [
    { stage: 'Initiated', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'yes' },
    { stage: 'Routed', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
    { stage: 'Acknowledged', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
    { stage: 'Processing', provider: 'yes', bank: 'na', webhook: 'yes', ledger: 'na' },
    { stage: 'Credited', provider: 'yes', bank: 'yes', webhook: 'yes', ledger: 'yes' },
    { stage: 'Reconciled', provider: 'na', bank: 'yes', webhook: 'na', ledger: 'yes' },
  ]
}

type ScenarioProfile = {
  businessOutcome: BusinessOutcomeStatus
  outcomeDetail: string
  integrity: IntegrityStatus
  governance: GovernanceStatus
  coverage: CoverageLevel
  coverageRank: 0 | 1 | 2 | 3 | 4 | 5
  missingItems: string[]
  verifyScopeNote: string
  evidenceOverrides: Partial<Record<EvidenceItemKind, Partial<EvidenceItem>>>
  timeline: TimelineEvent[]
  webhooks: ProofWebhookEvent[]
  sources: ProofSourceRow[]
}

type ProfileInput = {
  outcome: SettlementOutcome
  sealed: boolean
  paymentRef: string
  signalSource: ProofSignalSource
  providerRef: string | null
  expectedLabel: string
  observedLabel: string
  note: string
}

function gatheredPrefix(paymentRef: string): TimelineEvent[] {
  return [
    {
      at: '12 Jun · 09:12',
      label: 'Payout created',
      detail: `${paymentRef} · Razorpay payouts API`,
      source: 'Razorpay API',
      status: 'ok',
    },
    {
      at: '12 Jun · 10:02',
      label: 'Webhook payout.pending',
      detail: 'Provider 202 Accepted',
      source: 'API webhook',
      status: 'ok',
    },
    {
      at: '12 Jun · 10:05',
      label: 'Webhook payout.processing',
      detail: 'Rail processing',
      source: 'API webhook',
      status: 'ok',
    },
  ]
}

function gatheredEvidence(): Partial<Record<EvidenceItemKind, Partial<EvidenceItem>>> {
  return {
    'Payout instruction': { note: 'Razorpay payouts.create accepted', source: 'Razorpay API' },
    'Provider acknowledgement': { note: 'Webhook payout.pending · 202 Accepted', source: 'API webhook' },
    'Processing webhook': { note: 'Webhook payout.processing', source: 'API webhook' },
  }
}

function graphFromEvidence(evidence: EvidenceItem[], packId: string): GraphNode[] {
  return [
    ...evidence.map((item, i) => ({
      id: `n${i + 1}`,
      label: item.kind,
      state: (item.available ? 'Valid' : 'Missing') as GraphNode['state'],
      technicalId: item.hash ?? '-',
    })),
    { id: `n${evidence.length + 1}`, label: 'Evidence pack', state: 'Valid', technicalId: packId },
  ]
}

/** Align coverage / outcome with Settlement Journal for the same payout. */
function profileFor(input: ProfileInput): ScenarioProfile {
  const { outcome, sealed, paymentRef, signalSource, providerRef, expectedLabel, observedLabel, note } = input
  const utr = providerRef ?? '—'
  const bank = bankSource(signalSource)

  if (!sealed) {
    return {
      businessOutcome: 'Need review',
      outcomeDetail: 'Policy hold — instruction captured, not dispatched',
      integrity: 'Verified',
      governance: 'Need review',
      coverage: 'P1 Source authenticated',
      coverageRank: 1,
      missingItems: [
        'payout.pending webhook',
        'payout.processing webhook',
        'payout.processed webhook',
        'Bank credit',
        'Match decision',
      ],
      verifyScopeNote:
        'Integrity holds for the payout instruction that landed on Razorpay API. Need review — not failed. No rail webhooks or bank credit were gathered.',
      evidenceOverrides: {
        'Payout instruction': { note: `${paymentRef} captured on Razorpay API`, source: 'Razorpay API' },
        'Provider acknowledgement': {
          available: false,
          hash: null,
          note: 'payout.pending not received — payout not sent',
          source: 'API webhook',
        },
        'Processing webhook': {
          available: false,
          hash: null,
          note: 'payout.processing not received',
          source: 'API webhook',
        },
        'Outcome webhook': {
          available: false,
          hash: null,
          note: 'No payout.processed / payout.failed webhook',
          source: 'API webhook',
        },
        'Bank credit': { available: false, hash: null, note: 'No matching bank credit', source: 'Bank statement' },
        'Ledger posting': { available: true, note: 'Instruction booked; no debit posted', source: 'Ledger' },
        'Settlement record': { available: false, hash: null, note: 'No settlement row', source: bank },
        'Match decision': { available: false, hash: null, note: 'Need review — no outcome to close', source: 'Ledger' },
      },
      timeline: [
        {
          at: '12 Jun · 09:02',
          label: 'Payout created',
          detail: `${paymentRef} · Razorpay payouts API`,
          source: 'Razorpay API',
          status: 'ok',
        },
        {
          at: '12 Jun · 09:04',
          label: 'Webhook payout.pending',
          detail: 'Not received — payout not dispatched',
          source: 'API webhook',
          status: 'missing',
        },
        {
          at: '12 Jun · 09:05',
          label: 'Bank credit',
          detail: 'No matching credit gathered',
          source: 'Bank statement',
          status: 'missing',
        },
        {
          at: '12 Jun · 09:06',
          label: 'Match decision',
          detail: 'Need review — gathered instruction only',
          source: 'Ledger',
          status: 'review',
        },
      ],
      webhooks: [
        {
          at: '12 Jun · 09:02',
          event: 'payout.created',
          source: 'Razorpay API',
          status: 'received',
          detail: 'Instruction accepted. No payout.pending / processed / failed webhook.',
        },
      ],
      sources: sourcesFor('blocked'),
    }
  }

  if (outcome === 'Exact') {
    return {
      businessOutcome: 'Exact',
      outcomeDetail: 'Transaction processed successfully',
      integrity: 'Verified',
      governance: 'Passed',
      coverage: 'P5 Business complete',
      coverageRank: 5,
      missingItems: [],
      verifyScopeNote:
        'Integrity verified against gathered Razorpay webhooks, bank credit, and ledger. Hashing does not independently retrieve bank originals.',
      evidenceOverrides: {
        ...gatheredEvidence(),
        'Outcome webhook': { note: `Webhook payout.processed · UTR ${utr} · ${observedLabel}`, source: 'API webhook' },
        'Bank credit': {
          note: `UTR ${utr} · ${observedLabel} matches payout ${expectedLabel}`,
          source: bank,
        },
        'Ledger posting': { note: `Debit posted ${expectedLabel}`, source: 'Ledger' },
        'Settlement record': { note: `Settlement bound · ${observedLabel}`, source: bank },
        'Match decision': { note: 'Exact match · processed successfully', source: 'Ledger' },
      },
      timeline: [
        ...gatheredPrefix(paymentRef),
        {
          at: '12 Jun · 15:40',
          label: 'Webhook payout.processed',
          detail: `UTR ${utr} · ${observedLabel}`,
          source: 'API webhook',
          status: 'ok',
        },
        {
          at: '12 Jun · 15:41',
          label: 'Bank credit matched',
          detail: `${bank} · ${observedLabel} vs payout ${expectedLabel}`,
          source: bank,
          status: 'ok',
        },
        {
          at: '12 Jun · 15:42',
          label: 'Ledger debit posted',
          detail: expectedLabel,
          source: 'Ledger',
          status: 'ok',
        },
        {
          at: '12 Jun · 16:22',
          label: 'Match decision',
          detail: 'Exact · all sources agree',
          source: 'Ledger',
          status: 'ok',
        },
      ],
      webhooks: [
        { at: '12 Jun · 10:02', event: 'payout.pending', source: 'API webhook', status: 'received', detail: '202 Accepted' },
        { at: '12 Jun · 10:05', event: 'payout.processing', source: 'API webhook', status: 'received', detail: 'Rail processing' },
        { at: '12 Jun · 15:40', event: 'payout.processed', source: 'API webhook', status: 'received', detail: `UTR ${utr} · ${observedLabel}` },
      ],
      sources: sourcesFor('processed'),
    }
  }

  if (outcome === 'Short') {
    return {
      businessOutcome: 'Need review',
      outcomeDetail: `Short credit ${observedLabel} vs payout ${expectedLabel}`,
      integrity: 'Verified',
      governance: 'Passed',
      coverage: 'P4 Outcome proven',
      coverageRank: 4,
      missingItems: ['Fee schedule artefact', 'Final match close-out (P5)'],
      verifyScopeNote:
        'Gathered payout.processed webhook and bank credit. Amount is short of the payout — Need review, not failed.',
      evidenceOverrides: {
        ...gatheredEvidence(),
        'Outcome webhook': { note: `Webhook payout.processed · UTR ${utr} · posted ${observedLabel}`, source: 'API webhook' },
        'Bank credit': { note: `${bank}: ${note}`, source: bank },
        'Ledger posting': { note: `Debit posted ${expectedLabel}`, source: 'Ledger' },
        'Settlement record': { note: `Short vs payout ${expectedLabel}`, source: bank },
        'Match decision': {
          available: true,
          note: 'Need review — short vs payout amount',
          href: `/exceptions?demo=sandbox&entity_id=${paymentRef}`,
          source: 'Ledger',
        },
      },
      timeline: [
        ...gatheredPrefix(paymentRef),
        {
          at: '12 Jun · 16:12',
          label: 'Webhook payout.processed',
          detail: `UTR ${utr} · posted ${observedLabel}`,
          source: 'API webhook',
          status: 'ok',
        },
        {
          at: '12 Jun · 16:13',
          label: 'Bank credit observed',
          detail: `${observedLabel} vs payout ${expectedLabel}`,
          source: bank,
          status: 'review',
        },
        {
          at: '12 Jun · 16:13',
          label: 'Ledger debit posted',
          detail: expectedLabel,
          source: 'Ledger',
          status: 'ok',
        },
        {
          at: '12 Jun · 16:14',
          label: 'Match decision',
          detail: 'Need review — short-settled, not failed',
          source: 'Ledger',
          status: 'review',
        },
      ],
      webhooks: [
        { at: '12 Jun · 10:05', event: 'payout.processing', source: 'API webhook', status: 'received', detail: 'Rail processing' },
        { at: '12 Jun · 16:12', event: 'payout.processed', source: 'API webhook', status: 'received', detail: `UTR ${utr} · ${observedLabel}` },
        { at: '12 Jun · 16:13', event: 'settlement.variance', source: signalSource, status: 'review', detail: `Observed ${observedLabel} vs ${expectedLabel}` },
      ],
      sources: sourcesFor('exception'),
    }
  }

  if (outcome === 'Returned') {
    return {
      businessOutcome: 'Need review',
      outcomeDetail: `Return advice ${utr}`,
      integrity: 'Verified',
      governance: 'Passed',
      coverage: 'P4 Outcome proven',
      coverageRank: 4,
      missingItems: ['Updated beneficiary confirmation'],
      verifyScopeNote:
        'Gathered payout.processed then payout.reversed plus bank return advice. Need review — not a missing payout.',
      evidenceOverrides: {
        ...gatheredEvidence(),
        'Outcome webhook': { note: `Webhook payout.reversed · Return R03 · ${utr}`, source: 'API webhook' },
        'Bank credit': { note: `Return advice bound · ${utr}`, source: 'Bank statement' },
        'Ledger posting': { note: 'Debit reversed on ledger', source: 'Ledger' },
        'Settlement record': { note: `${bank}: ${note}`, source: bank },
        'Match decision': { note: 'Need review — returned after credit attempt', source: 'Ledger' },
      },
      timeline: [
        ...gatheredPrefix(paymentRef),
        {
          at: '12 Jun · 11:01',
          label: 'Webhook payout.processed',
          detail: 'Credit attempt accepted',
          source: 'API webhook',
          status: 'ok',
        },
        {
          at: '13 Jun · 09:04',
          label: 'Webhook payout.reversed',
          detail: `Return R03 · ${utr}`,
          source: 'API webhook',
          status: 'review',
        },
        {
          at: '13 Jun · 09:05',
          label: 'Bank return observed',
          detail: `${signalSource}: return advice bound`,
          source: 'Bank statement',
          status: 'review',
        },
        {
          at: '13 Jun · 09:06',
          label: 'Match decision',
          detail: 'Need review — returned, distinct from short',
          source: 'Ledger',
          status: 'review',
        },
      ],
      webhooks: [
        { at: '12 Jun · 10:02', event: 'payout.pending', source: 'API webhook', status: 'received', detail: '202 Accepted' },
        { at: '12 Jun · 11:01', event: 'payout.processed', source: 'API webhook', status: 'received', detail: 'Credit attempt accepted' },
        { at: '13 Jun · 09:04', event: 'payout.reversed', source: 'API webhook', status: 'review', detail: `Return R03 · ${utr}` },
      ],
      sources: sourcesFor('exception'),
    }
  }

  if (outcome === 'Reversal') {
    return {
      businessOutcome: 'Need review',
      outcomeDetail: `Reversal ${utr}`,
      integrity: 'Verified',
      governance: 'Passed',
      coverage: 'P4 Outcome proven',
      coverageRank: 4,
      missingItems: ['Reversal close-out (P5)'],
      verifyScopeNote:
        'Gathered payout.processed then payout.reversed and bank reversal credit. Need review to close the books.',
      evidenceOverrides: {
        ...gatheredEvidence(),
        'Outcome webhook': { note: `Webhook payout.reversed · ${utr}`, source: 'API webhook' },
        'Bank credit': { note: `Reversal credit observed · ${utr}`, source: 'Bank statement' },
        'Ledger posting': { note: 'Original debit + reversal credit posted', source: 'Ledger' },
        'Settlement record': { note: `${bank}: ${note}`, source: bank },
        'Match decision': { note: 'Need review — reversal recorded', source: 'Ledger' },
      },
      timeline: [
        ...gatheredPrefix(paymentRef),
        {
          at: '12 Jun · 15:40',
          label: 'Webhook payout.processed',
          detail: 'Original credit observed',
          source: 'API webhook',
          status: 'ok',
        },
        {
          at: '14 Jun · 11:10',
          label: 'Webhook payout.reversed',
          detail: `Reversal ${utr}`,
          source: 'API webhook',
          status: 'review',
        },
        {
          at: '14 Jun · 11:11',
          label: 'Bank reversal observed',
          detail: note,
          source: 'Bank statement',
          status: 'review',
        },
        {
          at: '14 Jun · 11:12',
          label: 'Match decision',
          detail: 'Need review — reversal',
          source: 'Ledger',
          status: 'review',
        },
      ],
      webhooks: [
        { at: '12 Jun · 10:05', event: 'payout.processing', source: 'API webhook', status: 'received', detail: 'Rail processing' },
        { at: '12 Jun · 15:40', event: 'payout.processed', source: 'API webhook', status: 'received', detail: 'Original credit observed' },
        { at: '14 Jun · 11:10', event: 'payout.reversed', source: 'API webhook', status: 'review', detail: `Reversal ${utr}` },
      ],
      sources: sourcesFor('exception'),
    }
  }

  if (outcome === 'Missing reference') {
    return {
      businessOutcome: 'Need review',
      outcomeDetail: 'Amount present · provider ref unlinked',
      integrity: 'Verified',
      governance: 'Partial',
      coverage: 'P3 Instruction proven',
      coverageRank: 3,
      missingItems: ['Linked bank UTR', 'Match decision', 'Provider reference mapping'],
      verifyScopeNote:
        'Gathered payout.processed amount without a mappable UTR. Need review to link the bank row — not failed.',
      evidenceOverrides: {
        ...gatheredEvidence(),
        'Outcome webhook': {
          note: 'Webhook payout.processed · amount present · UTR unlinked',
          source: 'API webhook',
        },
        'Bank credit': {
          available: false,
          hash: null,
          note: 'Bank amount present, UTR not mapped to this payout',
          source: 'Bank statement',
        },
        'Ledger posting': { note: `Debit posted ${expectedLabel}`, source: 'Ledger' },
        'Settlement record': {
          available: false,
          hash: null,
          note: 'Settlement not linked — Need review',
          source: bank,
        },
        'Match decision': { available: false, hash: null, note: 'Need review — pending UTR map', source: 'Ledger' },
      },
      timeline: [
        ...gatheredPrefix(paymentRef),
        {
          at: '12 Jun · 16:50',
          label: 'Webhook payout.processed',
          detail: 'Amount present · UTR not mapped',
          source: 'API webhook',
          status: 'review',
        },
        {
          at: '12 Jun · 16:51',
          label: 'Bank credit',
          detail: 'Row exists, provider ref unlinked',
          source: 'Bank statement',
          status: 'missing',
        },
        {
          at: '12 Jun · 16:52',
          label: 'Match decision',
          detail: 'Need review — pending UTR map',
          source: 'Ledger',
          status: 'review',
        },
      ],
      webhooks: [
        { at: '12 Jun · 10:05', event: 'payout.processing', source: 'API webhook', status: 'received', detail: 'Rail processing' },
        { at: '12 Jun · 16:50', event: 'payout.processed', source: 'API webhook', status: 'review', detail: 'Amount present · provider reference not mapped' },
      ],
      sources: sourcesFor('exception'),
    }
  }

  return {
    businessOutcome: 'Need review',
    outcomeDetail: 'Awaiting final credit / file signal',
    integrity: 'Verified',
    governance: 'Passed',
    coverage: 'P3 Instruction proven',
    coverageRank: 3,
    missingItems: ['payout.processed webhook', 'Bank credit', 'Match decision'],
    verifyScopeNote:
      'Gathered payout.pending and payout.processing. payout.processed and bank credit have not landed — Need review, not failed.',
    evidenceOverrides: {
      ...gatheredEvidence(),
      'Outcome webhook': {
        available: false,
        hash: null,
        note: 'payout.processed not received yet',
        source: 'API webhook',
      },
      'Bank credit': { available: false, hash: null, note: 'No matching bank credit yet', source: 'Bank statement' },
      'Ledger posting': { note: 'Instruction booked; debit not confirmed', source: 'Ledger' },
      'Settlement record': { available: false, hash: null, note: 'Waiting for credit / file signal', source: bank },
      'Match decision': { available: false, hash: null, note: 'Need review — pending settlement', source: 'Ledger' },
    },
    timeline: [
      ...gatheredPrefix(paymentRef),
      {
        at: '12 Jun · 16:00',
        label: 'Webhook payout.processed',
        detail: 'Not received yet',
        source: 'API webhook',
        status: 'missing',
      },
      {
        at: '12 Jun · 16:00',
        label: 'Bank credit',
        detail: 'No matching credit gathered yet',
        source: 'Bank statement',
        status: 'missing',
      },
      {
        at: '12 Jun · 16:05',
        label: 'Match decision',
        detail: 'Need review — awaiting outcome',
        source: 'Ledger',
        status: 'review',
      },
    ],
    webhooks: [
      { at: '12 Jun · 10:02', event: 'payout.pending', source: 'API webhook', status: 'received', detail: '202 Accepted' },
      { at: '12 Jun · 10:05', event: 'payout.processing', source: 'API webhook', status: 'received', detail: 'Waiting for payout.processed' },
    ],
    sources: sourcesFor('waiting'),
  }
}

function buildPackFromRow(i: number): ProofPack {
  const d = DEMO_DISPATCH_ROWS[i]!
  const s = DEMO_SETTLEMENT_ROWS[i]!
  const n = i + 1
  const id = `EP-${String(n).padStart(4, '0')}`
  const signalSource = mapSignalSource(s.signalSource)
  const profile = profileFor({
    outcome: s.outcome,
    sealed: d.sealed,
    paymentRef: d.humanRef,
    signalSource,
    providerRef: s.providerRef,
    expectedLabel: s.expectedLabel,
    observedLabel: s.observedLabel,
    note: s.note,
  })
  const packHash =
    profile.integrity === 'Pending' ? '-' : `0x${hexTail(n)}…${hexTail(n + 17).slice(0, 4)}`
  const merkleRoot =
    profile.integrity === 'Pending' ? '-' : `0xmkr_${d.humanRef.toLowerCase()}_p${profile.coverageRank}`
  const signature =
    profile.integrity === 'Pending' ? '-' : `ed25519:zord-demo-sig-${String(n).padStart(4, '0')}`
  const evidence = baseEvidence(profile.evidenceOverrides)

  return {
    id,
    paymentRef: d.humanRef,
    contractId: d.contractId,
    payeeLabel: d.payeeLabel,
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    businessOutcome: profile.businessOutcome,
    outcomeDetail: profile.outcomeDetail,
    integrity: profile.integrity,
    governance: profile.governance,
    coverage: profile.coverage,
    coverageRank: profile.coverageRank,
    generatedAt: profile.coverageRank >= 4 ? '12 Jun 2026 · 16:40 IST' : '12 Jun 2026 · 16:05 IST',
    amountLabel: d.amountLabel,
    packHash,
    merkleRoot,
    signature,
    verifyScopeNote: profile.verifyScopeNote,
    missingItems: profile.missingItems,
    evidence,
    timeline: profile.timeline,
    webhooks: profile.webhooks,
    sources: profile.sources,
    signalSource,
    graph: graphFromEvidence(evidence, id),
    contractHref: `${d.contractHref}?demo=sandbox`,
    traceHref: `${d.traceHref}?demo=sandbox`,
    outcomeHref: `/settlement/review?demo=sandbox&focus=${d.humanRef}`,
  }
}

/**
 * One evidence pack per demo payout (100) - coverage follows Settlement Journal outcome
 * for that payment (exact → P5 processed, exception → Need review).
 */
export const DEMO_PROOF_PACKS: ProofPack[] = DEMO_DISPATCH_ROWS.map((_, i) => buildPackFromRow(i))

export function getProofPack(id: string): ProofPack | undefined {
  return DEMO_PROOF_PACKS.find((p) => p.id === id)
}

export function packsForBatch(packs: ProofPack[], batchId: string): ProofPack[] {
  return packs.filter((p) => p.batchId === batchId)
}

function isCountedException(p: ProofPack): boolean {
  const row = DEMO_SETTLEMENT_ROWS.find((s) => s.paymentRef === p.paymentRef)
  return Boolean(row && isExceptionOutcome(row.outcome))
}

export function buildProofBatches(packs: ProofPack[]): ProofBatch[] {
  const byBatch = new Map<string, ProofPack[]>()
  for (const p of packs) {
    const list = byBatch.get(p.batchId) ?? []
    list.push(p)
    byBatch.set(p.batchId, list)
  }
  return [...byBatch.entries()].map(([batchId, list]) => ({
    batchId,
    label: list[0]?.batchLabel ?? batchId,
    packCount: list.length,
    p5Count: list.filter((p) => p.coverageRank === 5).length,
    verifiedCount: list.filter((p) => p.integrity === 'Verified').length,
    exceptionCount: list.filter(isCountedException).length,
  }))
}

export function proofCenterStats(packs: ProofPack[]) {
  return {
    total: packs.length,
    verified: packs.filter((p) => p.integrity === 'Verified').length,
    p5: packs.filter((p) => p.coverageRank === 5).length,
    exceptionOutcome: packs.filter(isCountedException).length,
  }
}
