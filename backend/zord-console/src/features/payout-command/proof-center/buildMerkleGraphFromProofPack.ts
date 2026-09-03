import type { ProofPack } from '@/services/payout-command/demo/proofCenterDemo'
import {
  buildProofLineageGraph,
  graphHasInvalid,
  graphHasMissing,
} from '@/services/payout-command/demo/proofGraphDemo'
import type { GlyphName } from '@/services/payout-command/model'
import type {
  EvidencePackGraph,
  LeafNode,
  LeafStatus,
} from '../surfaces/evidenceGraphTypes'

type LeafSeed = {
  name: string
  itemType: LeafNode['itemType']
  status: LeafStatus
  hash: string
  stableRef: string
  source: string
  iconName: GlyphName
  impact: string
}

function shortHash(h: string): string {
  if (!h || h === '-' || h.length < 6) return '-'
  const s = h.startsWith('sha256:') ? h.slice(7) : h.startsWith('0x') ? h.slice(2) : h
  return `${s.slice(0, 4)}…`
}

function leafStatusFromEvidence(
  pack: ProofPack,
  kind: string,
): { status: LeafStatus; hash: string; note: string } {
  if (kind === 'Outcome signal') {
    const provider = pack.evidence.find((e) => e.kind === 'Provider signal')
    const settlement = pack.evidence.find((e) => e.kind === 'Settlement record')
    const hit = settlement?.available ? settlement : provider
    if (!hit?.available) return { status: 'missing', hash: '-', note: 'No outcome signal' }
    return { status: 'valid', hash: hit.hash ?? '-', note: hit.note }
  }
  const item = pack.evidence.find((e) => e.kind === kind)
  if (!item) return { status: 'missing', hash: '-', note: 'Not in pack' }
  if (!item.available) {
    const invalid =
      kind === 'Policy decision' && pack.governance === 'Failed' && pack.businessOutcome === 'Blocked'
    return { status: invalid ? 'invalid' : 'missing', hash: '-', note: item.note }
  }
  return { status: 'valid', hash: item.hash ?? '-', note: item.note }
}

/**
  * Build the interactive Merkle canvas graph from a Proof Center demo pack.
  */
export function buildMerkleGraphFromProofPack(pack: ProofPack): EvidencePackGraph {
  const incomplete = pack.integrity === 'Pending' || pack.packHash === '-'
  const lineage = buildProofLineageGraph(pack)

  const defs: {
    name: string
    kind: string
    itemType: LeafNode['itemType']
    icon: GlyphName
    source: string
    ref: string
  }[] = [
    {
      name: 'Original obligation',
      kind: 'Original obligation',
      itemType: 'RAW_INGRESS_ENVELOPE',
      icon: 'arrow-up-right',
      source: 'File / API intake',
      ref: `${pack.paymentRef}:obl`,
    },
    {
      name: 'Canonical intent',
      kind: 'Canonical intent',
      itemType: 'CANONICAL_INTENT',
      icon: 'zap',
      source: 'Intent Journal',
      ref: `${pack.paymentRef}:intent`,
    },
    {
      name: 'Policy decision',
      kind: 'Policy decision',
      itemType: 'GOVERNANCE_DECISION_AT_CANONICAL',
      icon: 'shield',
      source: 'Policy Studio',
      ref: `${pack.paymentRef}:policy`,
    },
    {
      name: 'Action Contract',
      kind: 'Action Contract',
      itemType: 'PREPARED_PAYOUT_CONTRACT',
      icon: 'lock',
      source: 'Action Contract seal',
      ref: pack.contractId,
    },
    {
      name: 'Dispatch request',
      kind: 'Dispatch request',
      itemType: 'DISPATCH_ATTEMPT',
      icon: 'zap',
      source: 'Dispatch & Relay',
      ref: `${pack.paymentRef}:dispatch`,
    },
    {
      name: 'Outcome signal',
      kind: 'Outcome signal',
      itemType: 'OUTCOME_SIGNAL',
      icon: 'bank',
      source: 'Bank / provider feed',
      ref: `${pack.paymentRef}:outcome`,
    },
    {
      name: 'Match decision',
      kind: 'Match decision',
      itemType: 'ATTACHMENT_DECISION',
      icon: 'document',
      source: 'Outcome Review',
      ref: `${pack.paymentRef}:match`,
    },
    {
      name: 'Evidence pack',
      kind: 'Evidence pack',
      itemType: 'FINAL_EVIDENCE_VIEW',
      icon: 'grid',
      source: 'Proof Center',
      ref: pack.id,
    },
  ]

  const seeds: LeafSeed[] = defs.map((d) => {
    if (d.kind === 'Evidence pack') {
      return {
        name: d.name,
        itemType: d.itemType,
        status: 'valid',
        hash: incomplete ? '-' : pack.packHash,
        stableRef: d.ref,
        source: d.source,
        iconName: d.icon,
        impact: incomplete ? 'Pack incomplete' : 'Present in pack',
      }
    }
    const e = leafStatusFromEvidence(pack, d.kind)
    return {
      name: d.name,
      itemType: d.itemType,
      status: e.status,
      hash: e.hash,
      stableRef: d.ref,
      source: d.source,
      iconName: d.icon,
      impact: e.note,
    }
  })

  if (pack.id === 'EP-0019') {
    seeds.splice(seeds.length - 1, 0, {
      name: 'Fee schedule',
      itemType: 'FINAL_EVIDENCE_VIEW',
      status: 'missing',
      hash: '-',
      stableRef: `${pack.paymentRef}:fee`,
      source: 'Settlement feed',
      iconName: 'document',
      impact: 'Not captured',
    })
  }

  const leaves: LeafNode[] = seeds.map((s, i) => ({
    id: `L${i + 1}`,
    name: s.name,
    artifact: `${s.name.toLowerCase().replace(/\s+/g, '-')}.json`,
    itemType: s.itemType,
    stableRef: s.stableRef,
    version: 'v1',
    sourceService: 'zord-proof-center',
    hashFull: s.hash,
    hashShort: shortHash(s.hash),
    leafHash: s.hash,
    source: s.source,
    receivedAt: pack.generatedAt,
    status: s.status,
    impact: s.impact,
    iconName: s.iconName,
  }))

  const rootStatus =
    pack.integrity === 'Failed' || graphHasInvalid(lineage)
      ? 'invalid'
      : incomplete || graphHasMissing(lineage)
        ? 'partial'
        : 'verified'

  return {
    packId: pack.id,
    intentId: pack.paymentRef,
    contractId: pack.contractId,
    batchId: pack.batchId,
    tenantId: 'yc-review-workspace',
    mode: 'FULL_CONTROL',
    rulesetVersion: 'v1',
    schemaVersions: { intent: 'v1', outcome: 'v1', contract: 'v1', attachment: 'v1' },
    createdAt: pack.generatedAt,
    defensibilityScore: Math.min(100, 40 + pack.coverageRank * 12),
    proofScore: Math.min(100, 40 + pack.coverageRank * 12),
    leaves,
    intermediates: [
      {
        id: 'H1',
        hashFull: incomplete ? '-' : pack.packHash,
        hashShort: shortHash(incomplete ? '-' : pack.packHash),
        derivedFrom: leaves.map((l) => l.id),
      },
    ],
    root: {
      id: 'root',
      hashFull: incomplete ? '-' : pack.merkleRoot,
      hashShort: shortHash(incomplete ? '-' : pack.merkleRoot),
      status: rootStatus,
      tamper: rootStatus === 'invalid' ? 'changes-detected' : 'no-changes',
    },
  }
}
