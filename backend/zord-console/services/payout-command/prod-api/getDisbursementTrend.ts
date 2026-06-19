import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { DisbursementTrendRange, DisbursementTrendResponse } from './disbursementTrendTypes'

/**
 * Home trend chart — BFF maps zord-intelligence leakage dashboard into chart buckets.
 * Upstream per bucket: GET /v1/intelligence/dashboard/leakage?from_date=&to_date=
 */
export async function getDisbursementTrend(
  range: DisbursementTrendRange,
): Promise<DisbursementTrendResponse | null> {
  const params = new URLSearchParams({ range })
  return fetchProdJsonGet<DisbursementTrendResponse>(`/api/prod/home/disbursement-trend?${params.toString()}`)
}
