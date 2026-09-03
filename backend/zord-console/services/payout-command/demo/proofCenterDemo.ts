import { DEMO_DISPATCH_ROWS } from './dispatchRelayDemo'
import { DEMO_SETTLEMENT_ROWS, type SettlementOutcome } from './settlementJournalDemo'
import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'

/** Spec 7.14 - Proof Center demo fixtures. */

export const PROOF_CENTER_HEADER = {
  title: 'Proof Center',
  subtitle: 'Portable, tamper-evident evidence for every payout.',
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
export type GovernanceStatus = 'Passed' | 'Failed' | 'Partial'
export type BusinessOutcomeStatus =
  | 'Exact'
  | 'Short-settled'
  | 'Returned'
  | 'Reversed'
  | 'Unresolved'
  | 'Blocked'

export type EvidenceItemKind =
  | 'Original obligation'
  | 'Canonical intent'
  | 'Policy decision'
  | 'Action Contract'
  | 'Dispatch request'
  | 'Provider signal'
  | 'Settlement record'
  | 'Match decision'

export type EvidenceItem = {
  id: string
  kind: EvidenceItemKind
  available: boolean
  hash: string | null
  note: string
  href?: string
}

export type TimelineEvent = {
  at: string
  label: string
  detail: string
  status: 'ok' | 'warn' | 'missing'
}

export type GraphNode = {
  id: string
  label: string
  state: 'Valid' | 'Missing' | 'Invalid' | 'Derived'
  technicalId?: string
}

export type ProofPack = {
  id: string
  paymentRef: string
  contractId: string
  payeeLabel: string
  batchId: string
  batchLabel: string
  /** Business outcome - separate from integrity. */
  businessOutcome: BusinessOutcomeStatus
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
  { level: 'P0 Captured', rank: 0, blurb: 'Raw artefacts landed in the pack' },
  { level: 'P1 Source authenticated', rank: 1, blurb: 'Source system identity attested' },
  { level: 'P2 Authority proven', rank: 2, blurb: 'Approver / authority bound' },
  { level: 'P3 Instruction proven', rank: 3, blurb: 'Sealed Payment Action Contract present' },
  { level: 'P4 Outcome proven', rank: 4, blurb: 'Settlement / provider outcome bound' },
  { level: 'P5 Business complete', rank: 5, blurb: 'Match decision + business close-out' },
]

function baseEvidence(overrides: Partial<Record<EvidenceItemKind, Partial<EvidenceItem>>> = {}): EvidenceItem[] {
  const kinds: EvidenceItemKind[] = [
    'Original obligation',
    'Canonical intent',
    'Policy decision',
    'Action Contract',
    'Dispatch request',
    'Provider signal',
    'Settlement record',
    'Match decision',
  ]
  return kinds.map((kind, i) => {
    const o = overrides[kind] ?? {}
    return {
      id: `ev-${i}`,
      kind,
      available: o.available ?? true,
      hash: o.hash ?? (o.available === false ? null : `sha256:${kind.slice(0, 4).toLowerCase()}_${i}a9f`),
      note: o.note ?? 'Present in pack',
      href: o.href,
    }
  })
}

function hexTail(n: number): string {
  return ((n * 7919 + 104729) >>> 0).toString(16).padStart(8, '0')
}

type ScenarioProfile = {
  businessOutcome: BusinessOutcomeStatus
  integrity: IntegrityStatus
  governance: GovernanceStatus
  coverage: CoverageLevel
  coverageRank: 0 | 1 | 2 | 3 | 4 | 5
  missingItems: string[]
  verifyScopeNote: string
  evidenceOverrides: Partial<Record<EvidenceItemKind, Partial<EvidenceItem>>>
  timeline: TimelineEvent[]
  graphExtras: GraphNode[]
}

/** Align coverage / outcome with Settlement Journal for the same payout. */
function profileFor(
  outcome: SettlementOutcome,
  sealed: boolean,
  paymentRef: string,
  contractId: string,
): ScenarioProfile {
  if (!sealed) {
    return {
      businessOutcome: 'Blocked',
      integrity: 'Pending',
      governance: 'Failed',
      coverage: 'P1 Source authenticated',
      coverageRank: 1,
      missingItems: [
        'Policy decision',
        'Action Contract',
        'Dispatch request',
        'Provider signal',
        'Settlement record',
        'Match decision',
      ],
      verifyScopeNote:
        'Verification not available - pack is incomplete. Seal and dispatch before expecting integrity verification.',
      evidenceOverrides: {
        'Original obligation': { available: true, note: 'File row captured' },
        'Canonical intent': { available: true, note: 'Draft intent only' },
        'Policy decision': { available: false, hash: null, note: 'Blocked - beneficiary change' },
        'Action Contract': { available: false, hash: null, note: 'Not sealed' },
        'Dispatch request': { available: false, hash: null, note: 'Not dispatched' },
        'Provider signal': { available: false, hash: null, note: 'None' },
        'Settlement record': { available: false, hash: null, note: 'None' },
        'Match decision': { available: false, hash: null, note: 'None' },
      },
      timeline: [
        { at: '12 Jun · 09:02', label: 'Original obligation', detail: 'Captured', status: 'ok' },
        { at: '12 Jun · 09:04', label: 'Policy decision', detail: 'Blocked', status: 'missing' },
        { at: '12 Jun · 09:05', label: 'Evidence pack', detail: 'P1 only', status: 'missing' },
      ],
      graphExtras: [
        { id: 'n3', label: 'Policy decision', state: 'Invalid' },
        { id: 'n4', label: 'Action Contract', state: 'Missing' },
      ],
    }
  }

  if (outcome === 'Exact') {
    return {
      businessOutcome: 'Exact',
      integrity: 'Verified',
      governance: 'Passed',
      coverage: 'P5 Business complete',
      coverageRank: 5,
      missingItems: [],
      verifyScopeNote:
        'Integrity verified against this evidence pack. Hashing alone does not prove upstream source data was truthful - verifier did not independently retrieve bank/ERP originals.',
      evidenceOverrides: {
        'Action Contract': { href: `/contracts/${contractId}?demo=sandbox`, note: `Sealed ${contractId} v1` },
        'Match decision': { note: 'Exact match · deterministic' },
      },
      timeline: [
        { at: '12 Jun · 09:12', label: 'Original obligation', detail: 'File ingest accepted', status: 'ok' },
        { at: '12 Jun · 09:14', label: 'Policy decision', detail: 'POL-PAYOUT-CORE passed', status: 'ok' },
        { at: '12 Jun · 09:15', label: 'Action Contract sealed', detail: `${contractId} v1`, status: 'ok' },
        { at: '12 Jun · 10:02', label: 'Dispatch request', detail: 'NEFT sent · ack', status: 'ok' },
        { at: '12 Jun · 15:40', label: 'Settlement record', detail: 'Exact credit observed', status: 'ok' },
        { at: '12 Jun · 16:22', label: 'Evidence pack generated', detail: 'P5 Business complete', status: 'ok' },
      ],
      graphExtras: [
        { id: 'n8', label: 'Match decision', state: 'Valid', technicalId: `match_${paymentRef}` },
        { id: 'n10', label: 'Proof bundle hash', state: 'Derived' },
      ],
    }
  }

  if (outcome === 'Short') {
    return {
      businessOutcome: 'Short-settled',
      integrity: 'Verified',
      governance: 'Passed',
      coverage: 'P4 Outcome proven',
      coverageRank: 4,
      missingItems: ['Fee schedule artefact', 'Final match close-out (P5)'],
      verifyScopeNote:
        'Integrity verified against this evidence pack while business outcome remains Short-settled. Integrity ≠ exact settlement.',
      evidenceOverrides: {
        'Action Contract': { href: `/contracts/${contractId}?demo=sandbox`, note: `Sealed ${contractId} v1` },
        'Settlement record': { note: 'Short credit vs sealed amount' },
        'Match decision': {
          available: true,
          note: 'Short-settled recorded - open Outcome Review',
          href: `/settlement/review?demo=sandbox&gap=short_settled&focus=${paymentRef}`,
        },
      },
      timeline: [
        { at: '12 Jun · 09:20', label: 'Action Contract sealed', detail: contractId, status: 'ok' },
        { at: '12 Jun · 10:10', label: 'Dispatch request', detail: 'Acknowledged', status: 'ok' },
        { at: '12 Jun · 16:12', label: 'Settlement record', detail: 'Short vs sealed amount', status: 'warn' },
        { at: '12 Jun · 16:13', label: 'Match decision', detail: 'Short-settled', status: 'warn' },
        { at: '12 Jun · 16:40', label: 'Evidence pack', detail: 'P4 - P5 incomplete', status: 'warn' },
      ],
      graphExtras: [
        { id: 'n5', label: 'Match decision', state: 'Valid' },
        { id: 'n6', label: 'Fee schedule', state: 'Missing' },
      ],
    }
  }

  if (outcome === 'Returned') {
    return {
      businessOutcome: 'Returned',
      integrity: 'Verified',
      governance: 'Passed',
      coverage: 'P4 Outcome proven',
      coverageRank: 4,
      missingItems: ['Updated beneficiary confirmation'],
      verifyScopeNote:
        'Integrity verified against this evidence pack. Value-date failure on the return remains visible - dimensions stay separate.',
      evidenceOverrides: {
        'Settlement record': { note: 'Return advice received' },
        'Match decision': { note: 'Returned - distinct from short settlement' },
      },
      timeline: [
        { at: '12 Jun · 11:00', label: 'Dispatch request', detail: 'IMPS sent', status: 'ok' },
        { at: '13 Jun · 09:04', label: 'Provider signal', detail: 'Return R03', status: 'warn' },
        { at: '13 Jun · 09:20', label: 'Evidence pack', detail: 'P4 with return outcome', status: 'warn' },
      ],
      graphExtras: [
        { id: 'n3', label: 'Return advice', state: 'Valid' },
        { id: 'n4', label: 'Beneficiary update', state: 'Missing' },
      ],
    }
  }

  if (outcome === 'Reversal') {
    return {
      businessOutcome: 'Reversed',
      integrity: 'Verified',
      governance: 'Passed',
      coverage: 'P4 Outcome proven',
      coverageRank: 4,
      missingItems: ['Reversal close-out (P5)'],
      verifyScopeNote:
        'Integrity verified against this evidence pack. Reversal exposure is a business outcome - separate from integrity.',
      evidenceOverrides: {
        'Settlement record': { note: 'Reversal advice bound to contract' },
        'Match decision': { note: 'Reversal recorded - open Outcome Review' },
      },
      timeline: [
        { at: '12 Jun · 10:02', label: 'Dispatch request', detail: 'Acknowledged', status: 'ok' },
        { at: '14 Jun · 11:10', label: 'Settlement record', detail: 'Reversal observed', status: 'warn' },
        { at: '14 Jun · 11:20', label: 'Evidence pack', detail: 'P4 - reversal', status: 'warn' },
      ],
      graphExtras: [{ id: 'n4', label: 'Reversal advice', state: 'Valid' }],
    }
  }

  if (outcome === 'Missing reference') {
    return {
      businessOutcome: 'Unresolved',
      integrity: 'Verified',
      governance: 'Partial',
      coverage: 'P3 Instruction proven',
      coverageRank: 3,
      missingItems: ['Linked settlement record', 'Match decision', 'Provider reference mapping'],
      verifyScopeNote:
        'Integrity verified against this evidence pack. Settlement amount is present but unmapped - coverage stops at P3.',
      evidenceOverrides: {
        'Provider signal': { available: true, note: 'Amount present · ref unlinked' },
        'Settlement record': { available: false, note: 'Not linked to contract', hash: null },
        'Match decision': { available: false, note: 'Unresolved - pending link', hash: null },
      },
      timeline: [
        { at: '12 Jun · 14:00', label: 'Action Contract sealed', detail: contractId, status: 'ok' },
        { at: '12 Jun · 16:50', label: 'Provider signal', detail: 'Unlinked amount', status: 'warn' },
        { at: '12 Jun · 17:05', label: 'Evidence pack', detail: 'Partial - P3 only', status: 'missing' },
      ],
      graphExtras: [
        { id: 'n3', label: 'Settlement record', state: 'Missing' },
        { id: 'n4', label: 'Match decision', state: 'Missing' },
      ],
    }
  }

  // Waiting / Mixed / Over → unresolved until final signal
  return {
    businessOutcome: 'Unresolved',
    integrity: 'Verified',
    governance: 'Passed',
    coverage: 'P3 Instruction proven',
    coverageRank: 3,
    missingItems: ['Settlement record', 'Match decision'],
    verifyScopeNote:
      'Integrity verified against sealed instruction artefacts. Settlement signal not yet final - coverage stops at P3.',
    evidenceOverrides: {
      'Action Contract': { href: `/contracts/${contractId}?demo=sandbox`, note: `Sealed ${contractId} v1` },
      'Settlement record': { available: false, hash: null, note: 'Waiting for credit / file signal' },
      'Match decision': { available: false, hash: null, note: 'Pending settlement' },
    },
    timeline: [
      { at: '12 Jun · 09:15', label: 'Action Contract sealed', detail: contractId, status: 'ok' },
      { at: '12 Jun · 10:02', label: 'Dispatch request', detail: 'Prepared or ack only', status: 'ok' },
      { at: '12 Jun · 16:00', label: 'Settlement record', detail: 'Waiting', status: 'missing' },
      { at: '12 Jun · 16:05', label: 'Evidence pack', detail: 'P3 - awaiting outcome', status: 'warn' },
    ],
    graphExtras: [
      { id: 'n3', label: 'Settlement record', state: 'Missing' },
      { id: 'n4', label: 'Match decision', state: 'Missing' },
    ],
  }
}

function buildPackFromRow(i: number): ProofPack {
  const d = DEMO_DISPATCH_ROWS[i]!
  const s = DEMO_SETTLEMENT_ROWS[i]!
  const n = i + 1
  const id = `EP-${String(n).padStart(4, '0')}`
  const profile = profileFor(s.outcome, d.sealed, d.humanRef, d.contractId)
  const packHash =
    profile.integrity === 'Pending' ? '-' : `0x${hexTail(n)}…${hexTail(n + 17).slice(0, 4)}`
  const merkleRoot =
    profile.integrity === 'Pending' ? '-' : `0xmkr_${d.contractId.toLowerCase()}_p${profile.coverageRank}`
  const signature =
    profile.integrity === 'Pending' ? '-' : `ed25519:zord-demo-sig-${String(n).padStart(4, '0')}`

  const graph: GraphNode[] = [
    { id: 'n1', label: 'Original obligation', state: 'Valid', technicalId: `obl_${String(n).padStart(4, '0')}` },
    { id: 'n2', label: 'Canonical intent', state: 'Valid', technicalId: `int_${String(n).padStart(4, '0')}` },
    ...profile.graphExtras,
    { id: 'n9', label: 'Evidence pack', state: 'Valid', technicalId: id },
  ]

  return {
    id,
    paymentRef: d.humanRef,
    contractId: d.contractId,
    payeeLabel: d.payeeLabel,
    batchId: DEMO_SMOKE_BATCH_ID,
    batchLabel: DEMO_BATCH_LABEL,
    businessOutcome: profile.businessOutcome,
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
    evidence: baseEvidence(profile.evidenceOverrides),
    timeline: profile.timeline,
    graph,
    contractHref: `${d.contractHref}?demo=sandbox`,
    traceHref: `${d.traceHref}?demo=sandbox`,
    outcomeHref: `/settlement/review?demo=sandbox&focus=${d.humanRef}`,
  }
}

/**
 * One evidence pack per demo payout (100) - coverage follows Settlement Journal outcome
 * for that payment (exact → P5, short/return → P4, waiting/missing → P3, blocked → P1).
 */
export const DEMO_PROOF_PACKS: ProofPack[] = DEMO_DISPATCH_ROWS.map((_, i) => buildPackFromRow(i))

export function getProofPack(id: string): ProofPack | undefined {
  return DEMO_PROOF_PACKS.find((p) => p.id === id)
}

export function packsForBatch(packs: ProofPack[], batchId: string): ProofPack[] {
  return packs.filter((p) => p.batchId === batchId)
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
    exceptionCount: list.filter(
      (p) =>
        p.businessOutcome === 'Short-settled' ||
        p.businessOutcome === 'Returned' ||
        p.businessOutcome === 'Reversed' ||
        (p.businessOutcome === 'Unresolved' && p.missingItems.includes('Provider reference mapping')),
    ).length,
  }))
}

export function proofCenterStats(packs: ProofPack[]) {
  return {
    total: packs.length,
    verified: packs.filter((p) => p.integrity === 'Verified').length,
    p5: packs.filter((p) => p.coverageRank === 5).length,
    exceptionOutcome: packs.filter(
      (p) =>
        p.businessOutcome === 'Short-settled' ||
        p.businessOutcome === 'Returned' ||
        p.businessOutcome === 'Reversed' ||
        (p.businessOutcome === 'Unresolved' && p.missingItems.includes('Provider reference mapping')),
    ).length,
  }
}
