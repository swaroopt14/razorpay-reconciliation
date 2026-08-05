import { apiTrimmedString } from './coerceApiField'
import { fetchProdJsonGetWithMeta } from './fetchProdJsonGet'
import type { EvidencePackSummaryRow, ListPacksResponse } from './evidenceTypes'

const EVIDENCE_BASE = '/api/prod/evidence'

/**
 * Intent-level evidence packs for one batch — BFF injects session tenant.
 * Maps to GET /v1/evidence/batch/:batchId/intents
 */
export async function getEvidencePacksForBatchIntents(
  batchId: string,
): Promise<{ packs: EvidencePackSummaryRow[]; error?: string }> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return { packs: [] }

  const path = `${EVIDENCE_BASE}/batch/${encodeURIComponent(bid)}/intents`
  const res = await fetchProdJsonGetWithMeta<ListPacksResponse>(path)
  if (!res.ok) {
    const detail = res.errorText?.trim().slice(0, 280)
    return {
      packs: [],
      error: detail || `Evidence batch intents failed (${res.status || 'network'})`,
    }
  }
  return { packs: res.data?.packs ?? [] }
}
