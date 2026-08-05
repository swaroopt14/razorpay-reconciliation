import { fetchProdJsonGet, fetchProdJsonGetWithMeta } from './fetchProdJsonGet'
import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackFull, ListPacksResponse } from './evidenceTypes'

const EVIDENCE_BASE = '/api/prod/evidence'

function evidenceQueryPath(path: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export type ListEvidencePacksOptions = {
  batchId?: string
  intentId?: string
}

/** Evidence pack list — BFF injects session tenant. */
export async function listEvidencePacks(opts: ListEvidencePacksOptions = {}): Promise<ListPacksResponse | null> {
  const extra: Record<string, string> = {}
  const batchId = apiTrimmedString(opts.batchId)
  const intentId = apiTrimmedString(opts.intentId)
  if (batchId) extra.client_batch_id = batchId
  if (intentId) extra.intent_id = intentId
  const path = evidenceQueryPath(`${EVIDENCE_BASE}/packs`, extra)
  const res = await fetchProdJsonGetWithMeta<ListPacksResponse>(path)
  if (!res.ok && res.status === 401) {
    console.warn('[evidence] packs list unauthorized — sign in so BFF can inject session tenant', res.url)
  } else if (!res.ok) {
    console.warn('[evidence] packs list failed', res.status, res.errorText?.slice(0, 200) ?? res.url)
  }
  return res.data
}

export async function getEvidencePackFull(packId: string): Promise<EvidencePackFull | null> {
  const pid = apiTrimmedString(packId)
  if (!pid) return null
  return fetchProdJsonGet<EvidencePackFull>(evidenceQueryPath(`${EVIDENCE_BASE}/packs/${encodeURIComponent(pid)}`))
}
