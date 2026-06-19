import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { AmbiguityVelocityScatterResponse } from './ambiguityVelocityTypes'

export type GetAmbiguityVelocityScatterParams = {
  /** Optional — forwarded as `batch_id` to bubble-map upstream. */
  batchId?: string
}

/**
 * Separate from intelligence KPI dashboard.
 * BFF: GET /api/prod/ambiguity/velocity
 * Upstream: GET /v1/intelligence/dashboard/bubble-map
 */
export async function getAmbiguityVelocityScatter(
  params: GetAmbiguityVelocityScatterParams = {},
): Promise<AmbiguityVelocityScatterResponse | null> {
  const search = new URLSearchParams()
  const batchId = params.batchId?.trim()
  if (batchId) search.set('batch_id', batchId)

  return fetchProdJsonGet<AmbiguityVelocityScatterResponse>(
    `/api/prod/ambiguity/velocity?${search.toString()}`,
  )
}
