import { fetchProdJsonGet } from './fetchProdJsonGet'
import type {
  LeakageExposureGranularity,
  LeakageExposureTimeseriesResponse,
} from './intelligenceTypes'

export type GetLeakageExposureTimeseriesParams = {
  granularity?: LeakageExposureGranularity
  batchId?: string
}

/**
 * BFF: GET /api/prod/intelligence/timeseries/leakage
 * Upstream: GET /v1/intelligence/timeseries/leakage-exposure
 */
export async function getLeakageExposureTimeseries(
  params: GetLeakageExposureTimeseriesParams = {},
): Promise<LeakageExposureTimeseriesResponse | null> {
  const granularity = params.granularity ?? 'day'
  const search = new URLSearchParams({ granularity })
  const batchId = params.batchId?.trim()
  if (batchId) search.set('batch_id', batchId)

  return fetchProdJsonGet<LeakageExposureTimeseriesResponse>(
    `/api/prod/intelligence/timeseries/leakage?${search.toString()}`,
  )
}
