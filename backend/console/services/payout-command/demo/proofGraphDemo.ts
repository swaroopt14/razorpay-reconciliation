/**
 * Spec 7.15 - Proof Graph node builders for Proof Center demo packs.
 * Leaves match the Evidence tab: Razorpay API + webhooks + bank + ledger.
 */

import type { EvidenceItemKind, ProofPack } from './proofCenterDemo'

export type GraphNodeState = 'Valid' | 'Missing' | 'Invalid' | 'Derived'

export type ProofGraphNode = {
  id: string
  label: string
  state: GraphNodeState
  /** Source artefact vs recomputed digest - Derived is never authoritative. */
  role: 'source' | 'derived'
  technicalId: string
  source: string
  capturedAt: string
  hash: string | null
  integrity: string
  parentIds: string[]
  childIds: string[]
}

export const PROOF_LINEAGE_HEADER = {
  title: 'Proof lineage',
  subtitle:
    'See how payout instruction, webhooks, bank credit, ledger, and match roll into one verifiable bundle.',
} as const

const EVIDENCE_LABELS: EvidenceItemKind[] = [
  'Payout instruction',
  'Provider acknowledgement',
  'Processing webhook',
  'Outcome webhook',
  'Bank credit',
  'Ledger posting',
  'Settlement record',
  'Match decision',
]

/** Spec-required derived objects (right side). */
const DERIVED_LABELS = [
  'Proof bundle hash',
  'Merkle root',
  'signature',
  'timestamp',
] as const

type NodeSeed = {
  label: string
  state: GraphNodeState
  role: 'source' | 'derived'
  technicalId: string
  source: string
  capturedAt: string
  hash: string | null
  integrity: string
}

function wireChain(seeds: NodeSeed[]): ProofGraphNode[] {
  return seeds.map((s, i) => {
    const id = `g${i + 1}`
    const parentIds = i === 0 ? [] : [`g${i}`]
    const childIds = i === seeds.length - 1 ? [] : [`g${i + 2}`]
    return { id, ...s, parentIds, childIds }
  })
}

function evidenceState(
  pack: ProofPack,
  kind: EvidenceItemKind,
): { state: GraphNodeState; hash: string | null; note: string; source: string } {
  const item = pack.evidence.find((e) => e.kind === kind)
  if (!item) {
    return { state: 'Missing', hash: null, note: 'Not in pack', source: 'Ledger' }
  }
  if (!item.available) {
    return {
      state: 'Missing',
      hash: null,
      note: item.note,
      source: item.source ?? pack.signalSource,
    }
  }
  return {
    state: 'Valid',
    hash: item.hash,
    note: item.note,
    source: item.source ?? pack.signalSource,
  }
}

/** Build Spec 7.15 graph for a pack - same objects as Evidence tab. */
export function buildProofLineageGraph(pack: ProofPack): ProofGraphNode[] {
  const incomplete = pack.integrity === 'Pending' || pack.packHash === '-'

  const sourceSeeds: NodeSeed[] = [
    ...EVIDENCE_LABELS.map((label) => {
      const e = evidenceState(pack, label)
      return {
        label,
        state: e.state,
        role: 'source' as const,
        technicalId: e.hash ?? `${pack.paymentRef}:${label.slice(0, 6).toLowerCase().replace(/\s/g, '_')}`,
        source: e.source,
        capturedAt: pack.generatedAt,
        hash: e.hash,
        integrity: e.state === 'Valid' ? 'Bound to pack' : e.note,
      }
    }),
    {
      label: 'Evidence pack',
      state: 'Valid' as const,
      role: 'source' as const,
      technicalId: pack.id,
      source: 'Proof Center',
      capturedAt: pack.generatedAt,
      hash: incomplete ? null : pack.packHash,
      integrity: incomplete ? 'Pending - pack incomplete' : 'Present in pack',
    },
  ]

  const derivedSeeds: NodeSeed[] = DERIVED_LABELS.map((label) => {
    if (incomplete) {
      return {
        label,
        state: 'Missing' as const,
        role: 'derived' as const,
        technicalId: '-',
        source: 'Recomputed from pack',
        capturedAt: '-',
        hash: null,
        integrity: 'Unavailable until pack is complete',
      }
    }
    if (label === 'Proof bundle hash') {
      return {
        label,
        state: 'Derived',
        role: 'derived',
        technicalId: pack.packHash,
        source: 'Recomputed from pack artefacts',
        capturedAt: pack.generatedAt,
        hash: pack.packHash,
        integrity: 'Derived digest - not an authoritative source artefact',
      }
    }
    if (label === 'Merkle root') {
      return {
        label,
        state: 'Derived',
        role: 'derived',
        technicalId: pack.merkleRoot,
        source: 'Merkle tree over pack leaves',
        capturedAt: pack.generatedAt,
        hash: pack.merkleRoot,
        integrity: 'Derived root - verify by recompute',
      }
    }
    if (label === 'signature') {
      return {
        label,
        state: 'Derived',
        role: 'derived',
        technicalId: pack.signature,
        source: 'Workspace signing key (sandbox)',
        capturedAt: pack.generatedAt,
        hash: pack.signature,
        integrity: 'Detached signature over Proof bundle hash',
      }
    }
    return {
      label,
      state: 'Derived',
      role: 'derived',
      technicalId: pack.generatedAt,
      source: 'Pack seal clock',
      capturedAt: pack.generatedAt,
      hash: null,
      integrity: 'Seal timestamp bound to signature',
    }
  })

  return wireChain([...sourceSeeds, ...derivedSeeds])
}

export function graphHasMissing(nodes: ProofGraphNode[]) {
  return nodes.some((n) => n.state === 'Missing')
}

export function graphHasInvalid(nodes: ProofGraphNode[]) {
  return nodes.some((n) => n.state === 'Invalid')
}
