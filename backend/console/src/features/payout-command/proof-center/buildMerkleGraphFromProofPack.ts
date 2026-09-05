import type { EvidenceItemKind, ProofPack } from '@/services/payout-command/demo/proofCenterDemo'
import {
  buildProofLineageGraph,
  graphHasInvalid,
  graphHasMissing,
} from '@/services/payout-command/demo/proofGraphDemo'
import type { GlyphName } from '@/services/payout-command/model'
import type {
  EvidenceItemType,
  EvidencePackGraph,
  LeafNode,
  LeafStatus,
} from '../surfaces/evidenceGraphTypes'

const LEAF_META: Record<EvidenceItemKind, { itemType: EvidenceItemType; icon: GlyphName }> = {
  'Payout instruction': { itemType: 'RAW_INGRESS_ENVELOPE', icon: 'arrow-up-right' },
  'Provider acknowledgement': { itemType: 'PROVIDER_ACK', icon: 'zap' },
  'Processing webhook': { itemType: 'DISPATCH_ATTEMPT', icon: 'zap' },
  'Outcome webhook': { itemType: 'OUTCOME_SIGNAL', icon: 'bank' },
  'Bank credit': { itemType: 'RAW_SETTLEMENT_ENVELOPE', icon: 'bank' },
  'Ledger posting': { itemType: 'CANONICAL_SETTLEMENT_OBSERVATION', icon: 'document' },
  'Settlement record': { itemType: 'CANONICAL_SETTLEMENT_OBSERVATION', icon: 'bank' },
  'Match decision': { itemType: 'ATTACHMENT_DECISION', icon: 'document' },
}

function shortHash(h: string): string {
  if (!h || h === '-' || h.length < 6) return '-'
  const s = h.startsWith('sha256:') ? h.slice(7) : h.startsWith('0x') ? h.slice(2) : h
  return `${s.slice(0, 4)}…`
}

function leafStatusFromEvidence(
  pack: ProofPack,
  kind: EvidenceItemKind,
): { status: LeafStatus; hash: string; note: string; source: string } {
  const item = pack.evidence.find((e) => e.kind === kind)
  if (!item) return { status: 'missing', hash: '-', note: 'Not in pack', source: pack.signalSource }
  if (!item.available) {
    return { status: 'missing', hash: '-', note: item.note, source: item.source ?? pack.signalSource }
  }
  return {
    status: 'valid',
    hash: item.hash ?? '-',
    note: item.note,
    source: item.source ?? pack.signalSource,
  }
}

/**
 * Build the interactive Merkle canvas graph from a Proof Center demo pack.
 * Leaves are the same gathered artefacts as Timeline / Evidence.
 */
export function buildMerkleGraphFromProofPack(pack: ProofPack): EvidencePackGraph {
  const incomplete = pack.integrity === 'Pending' || pack.packHash === '-'
  const lineage = buildProofLineageGraph(pack)

  const leaves: LeafNode[] = pack.evidence.map((item, i) => {
    const meta = LEAF_META[item.kind]
    const e = leafStatusFromEvidence(pack, item.kind)
    return {
      id: `L${i + 1}`,
      name: item.kind,
      artifact: `${item.kind.toLowerCase().replace(/\s+/g, '-')}.json`,
      itemType: meta.itemType,
      stableRef: `${pack.paymentRef}:${item.kind.slice(0, 6).toLowerCase().replace(/\s/g, '_')}`,
      version: 'v1',
      sourceService: 'zord-proof-center',
      hashFull: e.hash,
      hashShort: shortHash(e.hash),
      leafHash: e.hash,
      source: e.source,
      receivedAt: pack.generatedAt,
      status: e.status,
      impact: e.note,
      iconName: meta.icon,
    }
  })

  leaves.push({
    id: `L${leaves.length + 1}`,
    name: 'Evidence pack',
    artifact: 'evidence-pack.json',
    itemType: 'FINAL_EVIDENCE_VIEW',
    stableRef: pack.id,
    version: 'v1',
    sourceService: 'zord-proof-center',
    hashFull: incomplete ? '-' : pack.packHash,
    hashShort: shortHash(incomplete ? '-' : pack.packHash),
    leafHash: incomplete ? '-' : pack.packHash,
    source: 'Proof Center',
    receivedAt: pack.generatedAt,
    status: 'valid',
    impact: incomplete ? 'Pack incomplete' : 'Present in pack',
    iconName: 'grid',
  })

  const rootStatus =
    pack.integrity === 'Failed' || graphHasInvalid(lineage)
      ? 'invalid'
      : incomplete || graphHasMissing(lineage)
        ? 'partial'
        : 'verified'

  return {
    packId: pack.id,
    intentId: pack.paymentRef,
    contractId: pack.paymentRef,
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
