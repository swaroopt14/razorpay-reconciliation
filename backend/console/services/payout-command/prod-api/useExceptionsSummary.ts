'use client'

import { useCallback, useEffect, useState } from 'react'
import { getExceptionsSummary } from '@/services/payout-command/prod-api/getExceptionsSummary'
import type { ExceptionsSummaryResponse } from '@/services/payout-command/prod-api/exceptionsSummaryTypes'
import type { IntelligenceDateQuery } from '@/services/payout-command/prod-api/getIntelligenceKpis'

export function useExceptionsSummary({
  tenantReady,
  batchId,
  dateQuery,
}: {
  tenantReady: boolean
  batchId?: string
  dateQuery?: IntelligenceDateQuery
}) {
  const [data, setData] = useState<ExceptionsSummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!tenantReady) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const res = await getExceptionsSummary(dateQuery, batchId)
      setData(res)
    } catch {
      setData({ data_available: false, reason: 'Failed to load exceptions summary.' })
    } finally {
      setLoading(false)
    }
  }, [tenantReady, batchId, dateQuery])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, loading, refresh }
}
