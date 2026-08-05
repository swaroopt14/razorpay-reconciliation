import type { GlyphName } from '@/services/payout-command/model'
import { PROOF_NODE_BUSINESS_LABELS } from '../evidence/copy/evidenceCopy'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import type {
  EvidencePackFull,
  EvidencePackLineageGraphResponse,
} from '@/services/payout-command/prod-api/evidenceTypes'
import type {
  EvidencePackGraph,
  EvidencePackMode,
  IntermediateNode,
  LeafNode,
  LeafStatus,
  RootNode,
} from './evidenceGraphTypes'

function shortHash(h: string | undefined): string {
  if (!h || h.length < 10) return '—'
  const s = h.startsWith('sha256:') ? h.slice(7) : h
  return `${s.slice(0, 4)}…`
}

function humanizeType(t: string): string {
  return t
    .toLowerCase()
    .split(/_/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function iconForType(t: string): GlyphName {
  const u = t.toUpperCase()
  if (u.includes('SETTLEMENT') || u.includes('PAYOUT')) return 'bank'
  if (u.includes('GOVERNANCE') || u.includes('VARIANCE')) return 'shield'
  if (u.includes('INTENT') || u.includes('CANONICAL')) return 'zap'
  if (u.includes('ENVELOPE') || u.includes('INGRESS')) return 'arrow-up-right'
  if (u.includes('ATTACH')) return 'bank'
  if (u.includes('FINAL') || u.includes('EVIDENCE')) return 'grid'
  if (u.includes('SIGNATURE') || u.includes('CERT')) return 'lock'
  return 'document'
}

function normalizeItemType(t: string): LeafNode['itemType'] {
  const allowed = new Set<string>([
    'RAW_INGRESS_ENVELOPE',
    'CANONICAL_INTENT',
    'GOVERNANCE_DECISION_AT_CANONICAL',
    'RAW_SETTLEMENT_ENVELOPE',
    'CANONICAL_SETTLEMENT_OBSERVATION',
    'ATTACHMENT_DECISION',
    'VARIANCE_DECISION',
    'DISPATCH_ATTEMPT',
    'PROVIDER_ACK',
    'OUTCOME_SIGNAL',
    'FUSED_OUTCOME',
    'FINALITY_CERT',
    'FINAL_CONTRACT',
    'FINAL_EVIDENCE_VIEW',
    'PREPARED_PAYOUT_CONTRACT',
    'ZORD_SIGNATURE_CARRIER',
  ])
  if (allowed.has(t)) return t as LeafNode['itemType']
  if (t === 'CANONICAL_INTENT_HASH') return 'CANONICAL_INTENT'
  if (t === 'ENVELOPE_HASH') return 'RAW_INGRESS_ENVELOPE'
  if (t === 'RAW_SETTLEMENT_FILE' || t === 'RAW_SETTLEMENT_LINE') return 'RAW_SETTLEMENT_ENVELOPE'
  return 'FINAL_EVIDENCE_VIEW'
}

function leafStatusForItem(it: EvidencePackFull['items'][0]): LeafStatus {
  if (!apiTrimmedString(it.hash) && !apiTrimmedString(it.leaf_hash)) return 'missing'
  return 'valid'
}

function normalizeMode(mode: unknown): EvidencePackMode {
  const m = apiTrimmedString(mode).toUpperCase()
  if (m === 'INTELLIGENCE_ATTACH' || m === 'SECONDARY_DISPATCH' || m === 'FULL_CONTROL' || m === 'BATCH_ATTACH') {
    return m as EvidencePackMode
  }
  return 'INTELLIGENCE_ATTACH'
}

function normalizeNodeTypeFromLineage(nodeType: string | undefined): string {
  const upper = apiTrimmedString(nodeType).toUpperCase()
  return upper || 'UNKNOWN'
}

function resolveSchemaVersions(pack: EvidencePackFull): {
  intent: string
  outcome: string
  contract: string
  attachment?: string
} {
  const schema = pack.schema_versions ?? {}
  return {
    intent: schema.intent ?? schema.intent_schema ?? 'v1',
    outcome: schema.outcome ?? schema.outcome_schema ?? 'v1',
    contract: schema.contract ?? schema.contract_schema ?? 'v1',
    attachment: schema.attachment ?? schema.attachment_schema,
  }
}

function normalizeItemTypeFromLineageNode(
  label: string | undefined,
  nodeType: string | undefined,
): LeafNode['itemType'] {
  const raw = `${apiTrimmedString(label)} ${apiTrimmedString(nodeType)}`.toUpperCase()
  if (raw.includes('PAYMENT') && raw.includes('FILE')) return 'RAW_INGRESS_ENVELOPE'
  if (raw.includes('SETTLEMENT') && raw.includes('FILE')) return 'RAW_SETTLEMENT_ENVELOPE'
  if (raw.includes('STRUCTURED') && raw.includes('INTENT')) return 'CANONICAL_INTENT'
  if (raw.includes('CANONICAL') && raw.includes('INTENT')) return 'CANONICAL_INTENT'
  if (raw.includes('STRUCTURED') && raw.includes('SETTLEMENT')) return 'CANONICAL_SETTLEMENT_OBSERVATION'
  if (raw.includes('GOVERNANCE')) return 'GOVERNANCE_DECISION_AT_CANONICAL'
  if (raw.includes('MATCH') && raw.includes('DECISION')) return 'ATTACHMENT_DECISION'
  if (raw.includes('ATTACHMENT') && raw.includes('DECISION')) return 'ATTACHMENT_DECISION'
  if (raw.includes('VARIANCE')) return 'VARIANCE_DECISION'
  if (raw.includes('OUTCOME')) return 'FINAL_CONTRACT'
  if (raw.includes('EVIDENCE') && raw.includes('SUMMARY')) return 'FINAL_EVIDENCE_VIEW'
  return 'FINAL_EVIDENCE_VIEW'
}

function rootFromPack(pack: EvidencePackFull): RootNode {
  const st = pack.pack_status?.toUpperCase() || ''
  const status: RootNode['status'] =
    st === 'ACTIVE' || st === 'SEALED' || st === 'VERIFIED' ? 'verified' : st === 'SUPERSEDED' ? 'partial' : 'partial'
  const full = pack.merkle_root || 'sha256:unknown'
  return {
    id: 'root',
    hashFull: full,
    hashShort: shortHash(full),
    status,
    tamper: 'no-changes',
  }
}

/**
 * Builds a graph the canvas can render: one synthetic intermediate combining all API leaves,
 * wired to the committed Merkle root from the pack. Defensibility score is tenant-level (caller).
 */
export function buildEvidencePackGraphFromApi(
  pack: EvidencePackFull,
  opts: { batchId: string; defensibilityScore: number },
): EvidencePackGraph {
  let leaves: LeafNode[] = (pack.items ?? []).map((it, i) => {
    const id = `L${i + 1}`
    const h = it.hash || it.leaf_hash || ''
    const status = leafStatusForItem(it)
    const typeKey = apiTrimmedString(it.type)
    const itemType = normalizeItemType(typeKey)
    const businessName = PROOF_NODE_BUSINESS_LABELS[typeKey] || humanizeType(typeKey)
    return {
      id,
      name: businessName,
      artifact: `${typeKey.toLowerCase().replace(/_/g, '-')}.json`,
      itemType,
      stableRef: apiTrimmedString(it.ref) || '—',
      version: it.schema_version || 'v1',
      sourceService: 'zord-evidence',
      hashFull: h || '—',
      hashShort: shortHash(h),
      leafHash: it.leaf_hash || h || '—',
      source: 'Service 6 — Evidence',
      receivedAt: new Date(pack.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      status,
      impact: `${typeKey} · ${apiTrimmedString(it.ref) || 'no ref'}`,
      iconName: iconForType(typeKey),
    }
  })

  if (leaves.length === 0) {
    leaves = [
      {
        id: 'L1',
        name: 'No evidence items',
        artifact: 'empty.json',
        itemType: 'FINAL_EVIDENCE_VIEW',
        stableRef: pack.evidence_pack_id,
        version: pack.ruleset_version || 'v1',
        sourceService: 'zord-evidence',
        hashFull: '—',
        hashShort: '—',
        leafHash: '—',
        source: 'Service 6 — Evidence',
        receivedAt: new Date(pack.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        status: 'missing',
        impact: 'GET /v1/evidence/packs/:id returned an empty items array.',
        iconName: 'document',
      },
    ]
  }

  const leafIds = leaves.map((l) => l.id)
  const intermediates: IntermediateNode[] = [
    {
      id: 'H1',
      hashFull: 'sha256:combined_placeholder',
      hashShort: 'comb…',
      derivedFrom: leafIds,
    },
  ]

  return {
    packId: pack.evidence_pack_id,
    intentId: pack.intent_id || '—',
    contractId: pack.contract_id || '—',
    batchId: opts.batchId,
    tenantId: pack.tenant_id,
    mode: normalizeMode(pack.mode),
    rulesetVersion: pack.ruleset_version || 'v1',
    schemaVersions: resolveSchemaVersions(pack),
    createdAt: pack.created_at,
    defensibilityScore: Math.round(opts.defensibilityScore),
    proofScore: pack.proof_score != null ? Math.round(Number(pack.proof_score)) : Math.round(opts.defensibilityScore),
    leaves,
    intermediates,
    root: rootFromPack(pack),
  }
}

export function buildEvidencePackGraphFromLineage(
  pack: EvidencePackFull,
  lineage: EvidencePackLineageGraphResponse,
  opts: { batchId: string; defensibilityScore: number },
): EvidencePackGraph {
  const isRootNode = (id: string, label: string, nodeType: string): boolean => {
    const uid = id.toUpperCase()
    const ulabel = label.toUpperCase()
    const utype = nodeType.toUpperCase()
    return (
      uid === 'MERKLE_ROOT' ||
      ulabel === 'PROOF ROOT' ||
      utype === 'ROOT' ||
      (utype === 'SEAL' && ulabel === 'PROOF ROOT')
    )
  }

  let leaves: LeafNode[] = (lineage.nodes ?? [])
    .filter((node) => {
      const nodeId = apiTrimmedString(node.id)
      const nodeLabel = apiTrimmedString(node.label)
      const nodeType = normalizeNodeTypeFromLineage(node.node_type)
      return !isRootNode(nodeId, nodeLabel, nodeType)
    })
    .map((node, i) => {
      const nodeId = apiTrimmedString(node.id)
      const nodeLabel = apiTrimmedString(node.label) || `Lineage node ${i + 1}`
      const nodeType = normalizeNodeTypeFromLineage(node.node_type)
      const hash = apiTrimmedString(node.leaf_hash)
      const itemType = normalizeItemTypeFromLineageNode(nodeLabel, nodeType)

      return {
        id: `L${i + 1}`,
        name: nodeLabel,
        artifact: `${nodeType.toLowerCase()}-${i + 1}.json`,
        itemType,
        stableRef: apiTrimmedString(node.item_ref) || nodeId || '—',
        version: apiTrimmedString(node.schema_version) || pack.ruleset_version || 'v1',
        sourceService: 'zord-evidence',
        hashFull: hash || '—',
        hashShort: shortHash(hash),
        leafHash: hash || '—',
        source: `Service 6 — ${humanizeType(nodeType)}`,
        receivedAt: new Date(pack.created_at).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }),
        status: hash ? 'valid' : 'missing',
        impact: `${nodeType} · ${apiTrimmedString(node.item_ref) || nodeId || 'no ref'}`,
        iconName: iconForType(nodeLabel || nodeType),
      }
    })

  if (!leaves.length) {
    leaves = [
      {
        id: 'L1',
        name: 'No lineage nodes',
        artifact: 'lineage-empty.json',
        itemType: 'FINAL_EVIDENCE_VIEW',
        stableRef: pack.evidence_pack_id,
        version: pack.ruleset_version || 'v1',
        sourceService: 'zord-evidence',
        hashFull: '—',
        hashShort: '—',
        leafHash: '—',
        source: 'Service 6 — Evidence',
        receivedAt: new Date(pack.created_at).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }),
        status: 'missing',
        impact: 'No lineage nodes returned from /lineage-graph.',
        iconName: 'document',
      },
    ]
  }

  const intermediates: IntermediateNode[] = [
    {
      id: 'H1',
      hashFull: 'sha256:lineage_combined',
      hashShort: shortHash('sha256:lineage_combined'),
      derivedFrom: leaves.map((leaf) => leaf.id),
    },
  ]

  const st = pack.pack_status?.toUpperCase() || ''
  const rootStatus: RootNode['status'] =
    st === 'ACTIVE' || st === 'SEALED' || st === 'VERIFIED' ? 'verified' : st === 'SUPERSEDED' ? 'partial' : 'partial'
  const merkleRoot =
    apiTrimmedString(lineage.merkle_root) || apiTrimmedString(pack.merkle_root) || 'sha256:unknown'

  return {
    packId: apiTrimmedString(lineage.evidence_pack_id) || pack.evidence_pack_id,
    intentId: apiTrimmedString(lineage.intent_id) || pack.intent_id || '—',
    contractId: pack.contract_id || '—',
    batchId: opts.batchId,
    tenantId: apiTrimmedString(lineage.tenant_id) || pack.tenant_id,
    mode: normalizeMode(pack.mode),
    rulesetVersion: pack.ruleset_version || 'v1',
    schemaVersions: resolveSchemaVersions(pack),
    createdAt: pack.created_at,
    defensibilityScore: Math.round(opts.defensibilityScore),
    proofScore: pack.proof_score != null ? Math.round(Number(pack.proof_score)) : Math.round(opts.defensibilityScore),
    leaves,
    intermediates,
    root: {
      id: 'root',
      hashFull: merkleRoot,
      hashShort: shortHash(merkleRoot),
      status: rootStatus,
      tamper: 'no-changes',
    },
  }
}
