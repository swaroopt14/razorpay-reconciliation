import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { IntelligenceDateQuery } from './getIntelligenceKpis'
import type { OperationsSummaryResponse } from './operationsSummaryTypes'

function dateQueryExtra(dates?: IntelligenceDateQuery): Record<string, string> {
  if (!dates) return {}
  return { from_date: dates.from_date, to_date: dates.to_date }
}

export async function getOperationsSummary(
  dates?: IntelligenceDateQuery,
  batchId?: string,
): Promise<OperationsSummaryResponse | null> {
  const extra = dateQueryExtra(dates)
  const bid = batchId?.trim()
  if (bid) extra.batch_id = bid
  const params = new URLSearchParams(extra)
  const qs = params.toString()
  return fetchProdJsonGet<OperationsSummaryResponse>(
    qs ? `/api/prod/operations/summary?${qs}` : '/api/prod/operations/summary',
  )
}
