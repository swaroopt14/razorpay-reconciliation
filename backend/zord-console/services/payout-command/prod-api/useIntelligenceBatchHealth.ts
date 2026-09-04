'use client'

import { useEffect, useState } from 'react'
import { getIntelligenceBatchDetail } from './getIntelligenceKpis'
import type { BatchHealth } from './intelligenceTypes'
import { apiTrimmedString } from './coerceApiField'

/** Loads `batch_health` projection when a batch is selected (batch-scoped KPIs). */
export function useIntelligenceBatchHealth(tenantReady: boolean, batchId?: string) {
  const [batchHealth, setBatchHealth] = useState<BatchHealth | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const bid = apiTrimmedString(batchId)
    if (!tenantReady || !bid) {
      setBatchHealth(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void getIntelligenceBatchDetail(bid).then((res) => {
      if (cancelled) return
      setBatchHealth(res?.batch_health ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tenantReady, batchId])

  return { batchHealth, loading }
}
