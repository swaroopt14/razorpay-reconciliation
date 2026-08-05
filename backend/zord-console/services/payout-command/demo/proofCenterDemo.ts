/**
 * Proof Center data module — API-backed via evidence BFF.
 * Surfaces keep importing DEMO_PROOF_PACKS / getProofPack; this module loads live packs.
 */

import { notifyDemoDataListeners } from './demoBatchReadiness'
import { DEMO_BATCH_LABEL, DEMO_SMOKE_BATCH_ID } from './ycDemoConstants'
import { getEvidencePackFull, listEvidencePacks } from '@/services/payout-command/prod-api/getEvidencePacks'
import { getEvidencePackTimeline } from '@/services/payout-command/prod-api/getEvidencePackTimeline'
import { postEvidencePackVerify } from '@/services/payout-command/prod-api/postEvidencePackVerify'
import type {
  ApiEvidenceItem,
  EvidencePackFull,
  EvidencePackSummaryRow,
  EvidenceTimelineEntry,
} from '@/services/payout-command/prod-api/evidenceTypes'

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

const COVERAGE_BY_RANK: CoverageLevel[] = [
  'P0 Captured',
  'P1 Source authenticated',
  'P2 Authority proven',
  'P3 Instruction proven',
  'P4 Outcome proven',
  'P5 Business complete',
]

function formatGeneratedAt(iso: string | undefined): string {
  if (!iso?.trim()) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function coverageFromPack(pack: EvidencePackSummaryRow | EvidencePackFull): {
  coverage: CoverageLevel
  coverageRank: 0 | 1 | 2 | 3 | 4 | 5
} {
  const score =
    typeof pack.proof_score === 'number'
      ? pack.proof_score
      : typeof pack.pack_completeness_score === 'number'
        ? pack.pack_completeness_score
        : null
  let rank: 0 | 1 | 2 | 3 | 4 | 5 = 3
  if (score != null) {
    if (score >= 90) rank = 5
    else if (score >= 75) rank = 4
    else if (score >= 55) rank = 3
    else if (score >= 35) rank = 2
    else if (score >= 15) rank = 1
    else rank = 0
  } else if (pack.settlement_leaf_present_flag) {
    rank = 4
  }
  return { coverage: COVERAGE_BY_RANK[rank]!, coverageRank: rank }
}

function integrityFromPack(
  pack: EvidencePackSummaryRow | EvidencePackFull,
  verifyStatus?: string,
): IntegrityStatus {
  const v = (verifyStatus || String(pack.verification_status ?? '')).toUpperCase()
  if (v.includes('FAIL') || v.includes('INVALID') || v.includes('MISMATCH')) return 'Failed'
  if (v.includes('VERIF') || v === 'TRUE' || v === 'OK' || v === 'PASSED') return 'Verified'
  const proof = String(pack.proof_status ?? pack.pack_status ?? '').toUpperCase()
  if (proof.includes('READY') || proof.includes('COMPLETE') || proof.includes('SEAL')) return 'Verified'
  if (proof.includes('FAIL')) return 'Failed'
  return 'Pending'
}

function governanceFromPack(pack: EvidencePackSummaryRow | EvidencePackFull): GovernanceStatus {
  const g = String(pack.governance_decision ?? '').toUpperCase()
  if (g.includes('FAIL') || g.includes('DENY') || g.includes('REJECT')) return 'Failed'
  if (g.includes('PASS') || g.includes('ALLOW') || g.includes('APPROVE')) return 'Passed'
  const govAvail = pack.proof_components?.governance_decision_available
  if (govAvail === false) return 'Failed'
  if (govAvail === true) return 'Passed'
  return 'Partial'
}

function businessOutcomeFromPack(pack: EvidencePackSummaryRow | EvidencePackFull): BusinessOutcomeStatus {
  const attach = String(pack.attachment_decision ?? '').toUpperCase()
  const amountMatch = 'amount_match' in pack ? pack.amount_match : undefined
  if (attach.includes('RETURN')) return 'Returned'
  if (attach.includes('REVERS')) return 'Reversed'
  if (attach.includes('SHORT') || amountMatch === false) return 'Short-settled'
  if (attach.includes('BLOCK')) return 'Blocked'
  if (pack.settlement_leaf_present_flag) return 'Exact'
  if (pack.pack_status?.toUpperCase().includes('BLOCK')) return 'Blocked'
  return 'Unresolved'
}

function kindFromItemType(type: string): EvidenceItemKind {
  const t = type.toLowerCase()
  if (t.includes('obligation') || t.includes('payment_file') || t.includes('original')) {
    return 'Original obligation'
  }
  if (t.includes('canonical') || t.includes('intent')) return 'Canonical intent'
  if (t.includes('policy') || t.includes('governance')) return 'Policy decision'
  if (t.includes('contract') || t.includes('action')) return 'Action Contract'
  if (t.includes('dispatch') || t.includes('instruction')) return 'Dispatch request'
  if (t.includes('provider') || t.includes('webhook') || t.includes('signal')) return 'Provider signal'
  if (t.includes('settlement') || t.includes('outcome')) return 'Settlement record'
  if (t.includes('match') || t.includes('attachment')) return 'Match decision'
  return 'Canonical intent'
}

function evidenceFromItems(items: ApiEvidenceItem[] | undefined): EvidenceItem[] {
  const baseKinds: EvidenceItemKind[] = [
    'Original obligation',
    'Canonical intent',
    'Policy decision',
    'Action Contract',
    'Dispatch request',
    'Provider signal',
    'Settlement record',
    'Match decision',
  ]
  if (!items?.length) {
    return baseKinds.map((kind, i) => ({
      id: `ev-${i + 1}`,
      kind,
      available: false,
      hash: null,
      note: 'Not present in pack payload',
    }))
  }

  const byKind = new Map<EvidenceItemKind, ApiEvidenceItem>()
  for (const item of items) {
    const kind = kindFromItemType(item.type)
    if (!byKind.has(kind)) byKind.set(kind, item)
  }

  return baseKinds.map((kind, i) => {
    const hit = byKind.get(kind)
    return {
      id: `ev-${i + 1}`,
      kind,
      available: Boolean(hit),
      hash: hit?.hash || hit?.leaf_hash || null,
      note: hit ? hit.ref : 'Missing from sealed pack',
    }
  })
}

function timelineFromApi(entries: EvidenceTimelineEntry[] | undefined): TimelineEvent[] {
  if (!entries?.length) return []
  return entries.map((e) => {
    const at = formatGeneratedAt(e.timestamp)
    const label = e.event || e.node_id || 'Event'
    return {
      at,
      label,
      detail: e.node_id && e.node_id !== e.event ? e.node_id : 'Recorded',
      status: 'ok' as const,
    }
  })
}

function graphFromEvidence(evidence: EvidenceItem[], packId: string): GraphNode[] {
  return [
    ...evidence.map((e, i) => ({
      id: `n${i + 1}`,
      label: e.kind,
      state: (e.available ? 'Valid' : 'Missing') as GraphNode['state'],
      technicalId: e.hash ?? undefined,
    })),
    { id: 'n9', label: 'Evidence pack', state: 'Valid', technicalId: packId },
  ]
}

function amountLabelFromPack(pack: EvidencePackSummaryRow | EvidencePackFull): string {
  const full = pack as EvidencePackFull
  const raw = full.amount ?? full.amount_minor
  if (raw == null || raw === '') return '-'
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return String(raw)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

function mapSummaryToProofPack(pack: EvidencePackSummaryRow): ProofPack {
  const { coverage, coverageRank } = coverageFromPack(pack)
  const paymentRef =
    pack.client_payout_ref?.trim() ||
    pack.client_reference?.trim() ||
    pack.intent_id?.trim() ||
    pack.evidence_pack_id
  const batchId = pack.batch_id?.trim() || DEMO_SMOKE_BATCH_ID
  const integrity = integrityFromPack(pack)
  const evidence = evidenceFromItems(undefined)
  const missingItems = evidence.filter((e) => !e.available).map((e) => e.kind)

  return {
    id: pack.evidence_pack_id,
    paymentRef,
    contractId: pack.contract_id?.trim() || '-',
    payeeLabel: pack.mode?.replace(/_/g, ' ') || 'Evidence pack',
    batchId,
    batchLabel: batchId === DEMO_SMOKE_BATCH_ID ? DEMO_BATCH_LABEL : batchId,
    businessOutcome: businessOutcomeFromPack(pack),
    integrity,
    governance: governanceFromPack(pack),
    coverage,
    coverageRank,
    generatedAt: formatGeneratedAt(pack.created_at),
    amountLabel: amountLabelFromPack(pack),
    packHash: pack.merkle_root ? `0x${pack.merkle_root.slice(0, 12)}…` : '-',
    merkleRoot: pack.merkle_root || '-',
    signature: pack.merkle_root ? `ed25519:${pack.evidence_pack_id.slice(0, 12)}` : '-',
    verifyScopeNote:
      'Integrity verification checks the sealed evidence pack digest. It does not independently attest upstream bank/ERP truthfulness.',
    missingItems,
    evidence,
    timeline: [],
    graph: graphFromEvidence(evidence, pack.evidence_pack_id),
    contractHref: `/contracts?demo=sandbox&ref=${encodeURIComponent(paymentRef)}`,
    traceHref: `/trace?demo=sandbox&ref=${encodeURIComponent(paymentRef)}`,
    outcomeHref: `/settlement/review?demo=sandbox&focus=${encodeURIComponent(paymentRef)}`,
  }
}

function mergeFullPack(base: ProofPack, full: EvidencePackFull): ProofPack {
  const evidence = evidenceFromItems(full.items)
  const missingItems = evidence.filter((e) => !e.available).map((e) => e.kind)
  const { coverage, coverageRank } = coverageFromPack(full)
  const sig = full.signatures?.[0]
  return {
    ...base,
    paymentRef:
      full.client_payout_ref?.trim() ||
      full.client_reference?.trim() ||
      full.intent_id?.trim() ||
      base.paymentRef,
    contractId: full.contract_id?.trim() || base.contractId,
    batchId: full.batch_id?.trim() || base.batchId,
    batchLabel:
      (full.batch_id?.trim() || base.batchId) === DEMO_SMOKE_BATCH_ID
        ? DEMO_BATCH_LABEL
        : full.batch_id?.trim() || base.batchLabel,
    businessOutcome: businessOutcomeFromPack(full),
    integrity: integrityFromPack(full),
    governance: governanceFromPack(full),
    coverage,
    coverageRank,
    generatedAt: formatGeneratedAt(full.created_at) || base.generatedAt,
    amountLabel: amountLabelFromPack(full),
    packHash: full.merkle_root ? `0x${full.merkle_root.slice(0, 12)}…` : base.packHash,
    merkleRoot: full.merkle_root || base.merkleRoot,
    signature: sig ? `${sig.alg}:${sig.sig.slice(0, 24)}…` : base.signature,
    missingItems,
    evidence,
    graph: graphFromEvidence(evidence, full.evidence_pack_id),
  }
}

/** Live packs — reassigned when evidence list loads (ESM live binding). */
export let DEMO_PROOF_PACKS: ProofPack[] = []

let loadPromise: Promise<void> | null = null
let loadGeneration = 0
const enrichInFlight = new Set<string>()

export async function loadProofCenterDemoData(): Promise<ProofPack[]> {
  const generation = ++loadGeneration
  const listed = await listEvidencePacks()
  if (generation !== loadGeneration) return DEMO_PROOF_PACKS

  const packs = listed?.packs ?? []
  DEMO_PROOF_PACKS = packs.map(mapSummaryToProofPack)
  notifyDemoDataListeners()
  return DEMO_PROOF_PACKS
}

export function ensureProofCenterDemoLoaded(): void {
  if (typeof window === 'undefined') return
  if (loadPromise) return
  loadPromise = loadProofCenterDemoData()
    .then(() => undefined)
    .catch(() => {
      DEMO_PROOF_PACKS = []
      notifyDemoDataListeners()
    })
}

if (typeof window !== 'undefined') {
  ensureProofCenterDemoLoaded()
}

async function enrichProofPack(id: string): Promise<void> {
  if (enrichInFlight.has(id)) return
  enrichInFlight.add(id)
  try {
    const [full, timelineRes, verifyRes] = await Promise.all([
      getEvidencePackFull(id),
      getEvidencePackTimeline(id),
      postEvidencePackVerify(id),
    ])

    const idx = DEMO_PROOF_PACKS.findIndex((p) => p.id === id)
    if (idx < 0) return
    let next = DEMO_PROOF_PACKS[idx]!
    if (full) next = mergeFullPack(next, full)
    if (timelineRes.data?.timeline?.length) {
      next = { ...next, timeline: timelineFromApi(timelineRes.data.timeline) }
    }
    if (verifyRes.ok && verifyRes.data) {
      next = {
        ...next,
        integrity: integrityFromPack(full ?? ({} as EvidencePackFull), verifyRes.data.status),
        merkleRoot: verifyRes.data.stored_root || next.merkleRoot,
        packHash: verifyRes.data.stored_root
          ? `0x${verifyRes.data.stored_root.slice(0, 12)}…`
          : next.packHash,
        verifyScopeNote: verifyRes.data.explanation || next.verifyScopeNote,
      }
    }
    const copy = DEMO_PROOF_PACKS.slice()
    copy[idx] = next
    DEMO_PROOF_PACKS = copy
    notifyDemoDataListeners()
  } finally {
    enrichInFlight.delete(id)
  }
}

export function getProofPack(id: string): ProofPack | undefined {
  const pack = DEMO_PROOF_PACKS.find((p) => p.id === id)
  if (pack && typeof window !== 'undefined') {
    void enrichProofPack(id)
  }
  return pack
}

/** Run Merkle verify and refresh cached pack integrity (used by export helpers / callers). */
export async function verifyProofPack(id: string): Promise<string> {
  const pack = getProofPack(id)
  if (!pack) return 'Evidence pack not found.'
  if (pack.integrity === 'Pending' || pack.packHash === '-') {
    return 'Cannot verify - pack incomplete. Capture and seal required artefacts before integrity verification.'
  }
  const res = await postEvidencePackVerify(id)
  if (!res.ok || !res.data) {
    return res.error || 'Verify request failed.'
  }
  await enrichProofPack(id)
  const refreshed = getProofPack(id)
  return (
    res.data.explanation ||
    `Integrity verified against this evidence pack · ${refreshed?.packHash ?? pack.packHash} · merkle ${res.data.stored_root}.`
  )
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
    exceptionCount: list.filter((p) =>
      ['Short-settled', 'Returned', 'Reversed', 'Unresolved', 'Blocked'].includes(p.businessOutcome),
    ).length,
  }))
}

export function proofCenterStats(packs: ProofPack[]) {
  return {
    total: packs.length,
    verified: packs.filter((p) => p.integrity === 'Verified').length,
    p5: packs.filter((p) => p.coverageRank === 5).length,
    exceptionOutcome: packs.filter((p) =>
      ['Short-settled', 'Returned', 'Reversed', 'Unresolved', 'Blocked'].includes(p.businessOutcome),
    ).length,
  }
}
