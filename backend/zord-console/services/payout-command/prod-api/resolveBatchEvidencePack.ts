import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackFull, EvidencePackLineageGraphResponse, EvidencePackSummaryRow } from './evidenceTypes'
import { getEvidenceBatchLineageGraph } from './getEvidenceBatchLineageGraph'

/** Batch-level pack row derived from GET /v1/evidence/batch/:batchId/lineage-graph. */
export function batchPackSummaryFromLineage(
  batchId: string,
  lineage: NonNullable<Awaited<ReturnType<typeof getEvidenceBatchLineageGraph>>['data']>,
): EvidencePackSummaryRow | null {
  const packId = apiTrimmedString(lineage.evidence_pack_id)
  if (!packId) return null

  return {
    evidence_pack_id: packId,
    tenant_id: apiTrimmedString(lineage.tenant_id) || '—',
    intent_id: apiTrimmedString(lineage.intent_id) || undefined,
    batch_id: batchId,
    mode: 'BATCH_PROOF',
    pack_status: 'READY',
    merkle_root: apiTrimmedString(lineage.merkle_root) || '',
    ruleset_version: '1',
    created_at: new Date().toISOString(),
  }
}

export async function resolveBatchPackFromLineageGraph(
  batchId: string,
): Promise<EvidencePackSummaryRow | null> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return null
  const { data } = await getEvidenceBatchLineageGraph(bid)
  if (!data?.evidence_pack_id) return null
  return batchPackSummaryFromLineage(bid, data)
}

export function isBatchEvidencePack(summary: EvidencePackSummaryRow): boolean {
  const intentId = apiTrimmedString(summary.intent_id)
  const mode = apiTrimmedString(summary.mode).toUpperCase()
  return !intentId && (mode.includes('BATCH') || mode === '')
}

/** Synthetic full pack when GET /packs/:id is empty but batch lineage graph exists. */
export function evidencePackFullFromBatchLineage(
  batchId: string,
  lineage: EvidencePackLineageGraphResponse,
  summary?: EvidencePackSummaryRow | null,
  packIdOverride?: string,
): EvidencePackFull {
  const packId =
    apiTrimmedString(packIdOverride) ||
    apiTrimmedString(lineage.evidence_pack_id) ||
    apiTrimmedString(summary?.evidence_pack_id) ||
    ''
  return {
    evidence_pack_id: packId,
    tenant_id: apiTrimmedString(lineage.tenant_id) || apiTrimmedString(summary?.tenant_id) || '—',
    intent_id: '',
    batch_id: batchId,
    contract_id: apiTrimmedString(summary?.contract_id) || '-',
    mode: apiTrimmedString(summary?.mode) || 'BATCH_PROOF',
    pack_status: apiTrimmedString(summary?.pack_status) || 'ACTIVE',
    items: [],
    merkle_root: apiTrimmedString(lineage.merkle_root) || apiTrimmedString(summary?.merkle_root) || '',
    ruleset_version: apiTrimmedString(summary?.ruleset_version) || 'v1',
    created_at: apiTrimmedString(summary?.created_at) || new Date().toISOString(),
  }
}
