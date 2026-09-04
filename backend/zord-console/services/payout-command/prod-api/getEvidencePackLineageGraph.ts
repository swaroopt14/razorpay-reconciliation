import { apiTrimmedString } from './coerceApiField'
import { fetchProdJsonGetWithMeta } from './fetchProdJsonGet'
import type { EvidencePackLineageGraphResponse } from './evidenceTypes'

const EVIDENCE_BASE = '/api/prod/evidence'

export async function getEvidencePackLineageGraph(
  packId: string,
): Promise<{ data: EvidencePackLineageGraphResponse | null; error?: string }> {
  const pid = apiTrimmedString(packId)
  if (!pid) return { data: null, error: 'Missing pack id' }

  const path = `${EVIDENCE_BASE}/packs/${encodeURIComponent(pid)}/lineage-graph`
  const res = await fetchProdJsonGetWithMeta<EvidencePackLineageGraphResponse>(path)
  if (!res.ok) {
    return {
      data: null,
      error:
        res.errorText?.trim().slice(0, 280) ||
        `Lineage graph failed (${res.status || 'network'})`,
    }
  }

  return { data: res.data }
}
