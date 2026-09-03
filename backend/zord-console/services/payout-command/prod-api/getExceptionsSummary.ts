import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { IntelligenceDateQuery } from './getIntelligenceKpis'
import type { ExceptionsSummaryResponse } from './exceptionsSummaryTypes'

function dateQueryExtra(dates?: IntelligenceDateQuery): Record<string, string> {
  if (!dates) return {}
  return { from_date: dates.from_date, to_date: dates.to_date }
}

export async function getExceptionsSummary(
  dates?: IntelligenceDateQuery,
  batchId?: string,
): Promise<ExceptionsSummaryResponse | null> {
  const extra = dateQueryExtra(dates)
  const bid = batchId?.trim()
  if (bid) extra.batch_id = bid
  const params = new URLSearchParams(extra)
  const qs = params.toString()
  return fetchProdJsonGet<ExceptionsSummaryResponse>(
    qs ? `/api/prod/exceptions/summary?${qs}` : '/api/prod/exceptions/summary',
  )
}
