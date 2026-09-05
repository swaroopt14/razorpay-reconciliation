import { apiTrimmedString } from './coerceApiField'
import { fetchProdJsonGetWithMeta } from './fetchProdJsonGet'
import type { EvidencePackLineageGraphResponse } from './evidenceTypes'

const EVIDENCE_BASE = '/api/prod/evidence'

export async function getEvidenceBatchLineageGraph(
  batchId: string,
): Promise<{ data: EvidencePackLineageGraphResponse | null; error?: string }> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return { data: null, error: 'Missing batch id' }

  const path = `${EVIDENCE_BASE}/batch/${encodeURIComponent(bid)}/lineage-graph`
  const res = await fetchProdJsonGetWithMeta<EvidencePackLineageGraphResponse>(path)
  if (!res.ok) {
    return {
      data: null,
      error:
        res.errorText?.trim().slice(0, 280) ||
        `Batch lineage graph failed (${res.status || 'network'})`,
    }
  }

  return { data: res.data }
}
