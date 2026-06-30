'use client'

import { useCallback, useEffect, useState } from 'react'
import { getOperationsSummary } from '@/services/payout-command/prod-api/getOperationsSummary'
import type { OperationsSummaryResponse } from '@/services/payout-command/prod-api/operationsSummaryTypes'
import type { IntelligenceDateQuery } from '@/services/payout-command/prod-api/getIntelligenceKpis'

export function useOperationsSummary({
  tenantReady,
  batchId,
  dateQuery,
}: {
  tenantReady: boolean
  batchId?: string
  dateQuery?: IntelligenceDateQuery
}) {
  const [data, setData] = useState<OperationsSummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!tenantReady) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const res = await getOperationsSummary(dateQuery, batchId)
      setData(res)
    } catch {
      setData({ data_available: false, reason: 'Failed to load operations summary.' })
    } finally {
      setLoading(false)
    }
  }, [tenantReady, batchId, dateQuery])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, loading, refresh }
}
