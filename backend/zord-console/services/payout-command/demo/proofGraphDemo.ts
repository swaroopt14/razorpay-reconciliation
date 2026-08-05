/**
 * Spec 7.15 - Proof Graph node builders for Proof Center demo packs.
 * Business labels on the canvas; technical IDs live in the inspector.
 */

import type { ProofPack } from './proofCenterDemo'

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
    'See how source, policy, execution, outcome, and evidence roll into one verifiable bundle.',
} as const

/** Spec-required source artefacts (left → right before derived). */
const SOURCE_LABELS = [
  'Original obligation',
  'Canonical intent',
  'Policy decision',
  'Action Contract',
  'Dispatch request',
  'Outcome signal',
  'Match decision',
  'Evidence pack',
] as const

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
  kind: string,
): { state: GraphNodeState; hash: string | null; note: string } {
  const item = pack.evidence.find((e) => e.kind === kind)
  if (!item) {
    if (kind === 'Outcome signal') {
      const provider = pack.evidence.find((e) => e.kind === 'Provider signal')
      const settlement = pack.evidence.find((e) => e.kind === 'Settlement record')
      const hit = settlement?.available ? settlement : provider
      if (!hit?.available) {
        return { state: 'Missing', hash: null, note: 'No outcome signal bound' }
      }
      return {
        state: 'Valid',
        hash: hit.hash,
        note: hit.note,
      }
    }
    return { state: 'Missing', hash: null, note: 'Not in pack' }
  }
  if (!item.available) {
    const invalid =
      kind === 'Policy decision' && pack.governance === 'Failed' && pack.businessOutcome === 'Blocked'
    return {
      state: invalid ? 'Invalid' : 'Missing',
      hash: null,
      note: item.note,
    }
  }
  return { state: 'Valid', hash: item.hash, note: item.note }
}

/** Build Spec 7.15 graph for a pack - same objects as Evidence tab where possible. */
export function buildProofLineageGraph(pack: ProofPack): ProofGraphNode[] {
  const incomplete = pack.integrity === 'Pending' || pack.packHash === '-'

  const sourceSeeds: NodeSeed[] = SOURCE_LABELS.map((label) => {
    if (label === 'Evidence pack') {
      return {
        label,
        state: 'Valid',
        role: 'source',
        technicalId: pack.id,
        source: 'Proof Center',
        capturedAt: pack.generatedAt,
        hash: incomplete ? null : pack.packHash,
        integrity: incomplete ? 'Pending - pack incomplete' : 'Present in pack',
      }
    }
    if (label === 'Action Contract') {
      const e = evidenceState(pack, 'Action Contract')
      return {
        label,
        state: e.state,
        role: 'source',
        technicalId: pack.contractId,
        source: 'Action Contract seal',
        capturedAt: pack.generatedAt,
        hash: e.hash,
        integrity: e.state === 'Valid' ? 'Bound to pack' : e.note,
      }
    }
    if (label === 'Outcome signal') {
      const e = evidenceState(pack, 'Outcome signal')
      return {
        label,
        state: e.state,
        role: 'source',
        technicalId:
          pack.evidence.find((x) => x.kind === 'Provider signal' && x.available)?.note.match(/UTR[\w-]*/)?.[0] ??
          `${pack.paymentRef}-outcome`,
        source: 'Bank / provider feed',
        capturedAt: pack.generatedAt,
        hash: e.hash,
        integrity: e.state === 'Valid' ? 'Bound to pack' : e.note,
      }
    }
    const kind =
      label === 'Original obligation'
        ? 'Original obligation'
        : label === 'Canonical intent'
          ? 'Canonical intent'
          : label === 'Policy decision'
            ? 'Policy decision'
            : label === 'Dispatch request'
              ? 'Dispatch request'
              : 'Match decision'
    const e = evidenceState(pack, kind)
    return {
      label,
      state: e.state,
      role: 'source',
      technicalId: `${pack.paymentRef}:${label.slice(0, 6).toLowerCase().replace(/\s/g, '_')}`,
      source:
        label === 'Original obligation'
          ? 'File / API intake'
          : label === 'Canonical intent'
            ? 'Intent Journal'
            : label === 'Policy decision'
              ? 'Policy Studio'
              : label === 'Dispatch request'
                ? 'Dispatch & Relay'
                : 'Outcome Review',
      capturedAt: pack.generatedAt,
      hash: e.hash,
      integrity: e.state === 'Valid' ? 'Bound to pack' : e.note,
    }
  })

  // Optional extras that appear in exceptions (still business-labelled).
  const extras: NodeSeed[] = []
  if (pack.id === 'EP-0019') {
    extras.push({
      label: 'Fee schedule',
      state: 'Missing',
      role: 'source',
      technicalId: `${pack.paymentRef}:fee`,
      source: 'Settlement feed',
      capturedAt: '-',
      hash: null,
      integrity: 'Not captured - does not block pack digest recompute',
    })
  }
  if (pack.id === 'EP-0015') {
    extras.push({
      label: 'Beneficiary update',
      state: 'Missing',
      role: 'source',
      technicalId: `${pack.paymentRef}:bene`,
      source: 'ERP / beneficiary file',
      capturedAt: '-',
      hash: null,
      integrity: 'Missing - distinct from Invalid',
    })
  }

  // Insert extras before Evidence pack.
  const evidenceIdx = sourceSeeds.findIndex((s) => s.label === 'Evidence pack')
  const withExtras = [
    ...sourceSeeds.slice(0, evidenceIdx),
    ...extras,
    ...sourceSeeds.slice(evidenceIdx),
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

  return wireChain([...withExtras, ...derivedSeeds])
}

export function graphHasMissing(nodes: ProofGraphNode[]) {
  return nodes.some((n) => n.state === 'Missing')
}

export function graphHasInvalid(nodes: ProofGraphNode[]) {
  return nodes.some((n) => n.state === 'Invalid')
}
