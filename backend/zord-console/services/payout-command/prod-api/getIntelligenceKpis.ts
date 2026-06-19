import { fetchProdJsonGet } from './fetchProdJsonGet'
import { apiTrimmedString } from './coerceApiField'
import type {
  AmbiguityHeatmapResponse,
  AmbiguityKpiResponse,
  BatchContractKpiResponse,
  BatchDetailResponse,
  BatchesListResponse,
  DefensibilityKpiResponse,
  FinalityStatus,
  LeakageKpiResponse,
  PatternsKpiResponse,
  RcaKpiResponse,
  RecommendationsKpiResponse,
} from './intelligenceTypes'

const INTEL_BASE = '/api/prod/intelligence'

export type IntelligenceDateQuery = {
  from_date: string
  to_date: string
}

/** BFF injects tenant from session; client must not send tenant_id. */
function intelQueryPath(path: string, extraQuery: Record<string, string> = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(extraQuery)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

function dateQueryExtra(dates?: IntelligenceDateQuery): Record<string, string> {
  if (!dates) return {}
  return { from_date: dates.from_date, to_date: dates.to_date }
}

/** Tenant-wide leakage KPI — BFF injects session tenant. */
export async function getLeakageKpis(dates?: IntelligenceDateQuery, batchId?: string): Promise<LeakageKpiResponse | null> {
  const extra = dateQueryExtra(dates)
  const bid = apiTrimmedString(batchId)
  if (bid) extra.batch_id = bid
  return fetchProdJsonGet<LeakageKpiResponse>(
    intelQueryPath(`${INTEL_BASE}/leakage`, extra),
  )
}

export async function getAmbiguityKpis(dates?: IntelligenceDateQuery, batchId?: string): Promise<AmbiguityKpiResponse | null> {
  const extra = dateQueryExtra(dates)
  const bid = apiTrimmedString(batchId)
  if (bid) extra.batch_id = bid
  return fetchProdJsonGet<AmbiguityKpiResponse>(
    intelQueryPath(`${INTEL_BASE}/ambiguity`, extra),
  )
}

/** Per-batch matching execution heatmap — BFF injects session tenant. */
export async function getAmbiguityHeatmap(): Promise<AmbiguityHeatmapResponse | null> {
  return fetchProdJsonGet<AmbiguityHeatmapResponse>(`${INTEL_BASE}/ambiguity/heatmap`)
}

export async function getDefensibilityKpis(
  dates?: IntelligenceDateQuery,
): Promise<DefensibilityKpiResponse | null> {
  return fetchProdJsonGet<DefensibilityKpiResponse>(
    intelQueryPath(`${INTEL_BASE}/defensibility`, dateQueryExtra(dates)),
  )
}

/** Patterns KPI — optional `batch_id` scopes anomaly to one batch; omit for latest tenant snapshot. */
export async function getPatternsKpis(batchId?: string): Promise<PatternsKpiResponse | null> {
  const bid = apiTrimmedString(batchId)
  const path = bid
    ? intelQueryPath(`${INTEL_BASE}/patterns`, { batch_id: bid })
    : intelQueryPath(`${INTEL_BASE}/patterns`)
  return fetchProdJsonGet<PatternsKpiResponse>(path)
}

export async function getRecommendationsKpis(
  dates?: IntelligenceDateQuery,
): Promise<RecommendationsKpiResponse | null> {
  return fetchProdJsonGet<RecommendationsKpiResponse>(
    intelQueryPath(`${INTEL_BASE}/recommendations`, dateQueryExtra(dates)),
  )
}

export async function getRcaKpis(dates?: IntelligenceDateQuery): Promise<RcaKpiResponse | null> {
  return fetchProdJsonGet<RcaKpiResponse>(
    intelQueryPath(`${INTEL_BASE}/rca`, dateQueryExtra(dates)),
  )
}

export type BatchesListOptions = {
  status?: FinalityStatus | ''
  limit?: number
}

/** Intelligence batch list — BFF injects session tenant (no client tenant_id). */
export async function getIntelligenceBatches(
  opts: BatchesListOptions = {},
): Promise<BatchesListResponse | null> {
  const extra: Record<string, string> = {}
  if (opts.status) extra.status = opts.status
  if (opts.limit) extra.limit = String(opts.limit)
  return fetchProdJsonGet<BatchesListResponse>(intelQueryPath(`${INTEL_BASE}/batches`, extra))
}

/** Per-batch intelligence snapshot — BFF injects session tenant. */
export async function getIntelligenceBatchDetail(batchId: string): Promise<BatchDetailResponse | null> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return null
  return fetchProdJsonGet<BatchDetailResponse>(
    intelQueryPath(`${INTEL_BASE}/batches/${encodeURIComponent(bid)}`),
  )
}

/** Per-batch contract KPIs (variance, orphan, unmatch, reference coverage). */
export async function getBatchContractKpis(batchId: string): Promise<BatchContractKpiResponse | null> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return null
  return fetchProdJsonGet<BatchContractKpiResponse>(
    intelQueryPath(`${INTEL_BASE}/batch_contract/${encodeURIComponent(bid)}`),
  )
}
