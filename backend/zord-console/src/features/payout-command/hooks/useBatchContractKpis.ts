'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getBatchContractKpis } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { BatchContractKpiResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

export function useBatchContractKpis(options: {
  tenantReady: boolean
  batchId?: string
}): {
  data: BatchContractKpiResponse | null
  loading: boolean
  refresh: () => Promise<void>
} {
  const { tenantReady, batchId } = options
  const bid = apiTrimmedString(batchId)
  const [data, setData] = useState<BatchContractKpiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!tenantReady || !bid) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const res = await getBatchContractKpis(bid)
      if (!cancelledRef.current) setData(res)
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [tenantReady, bid])

  useEffect(() => {
    cancelledRef.current = false
    void refresh()
    return () => {
      cancelledRef.current = true
    }
  }, [refresh])

  return { data, loading, refresh }
}

/** Parse API percent strings like "0.00%" or "16.0" into a 0–100 number. */
export function parseMissingReferenceRatePercent(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value <= 1 ? value * 100 : value
  }
  const trimmed = String(value).trim().replace(/%$/, '')
  const n = Number.parseFloat(trimmed)
  return Number.isFinite(n) ? n : null
}
