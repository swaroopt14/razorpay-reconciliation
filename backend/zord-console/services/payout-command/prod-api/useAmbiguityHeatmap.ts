'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getAmbiguityHeatmap } from './getIntelligenceKpis'
import { mapAmbiguityHeatmapResponse } from './mapAmbiguityHeatmap'
import type { MatchingExecutionHeatmap } from './intelligenceTypes'

const DEFAULT_POLL_MS = 30_000

export type UseAmbiguityHeatmapResult = {
  heatmap: MatchingExecutionHeatmap | null
  loading: boolean
  refresh: () => Promise<void>
}

export function useAmbiguityHeatmap(tenantReady: boolean, intervalMs = DEFAULT_POLL_MS): UseAmbiguityHeatmapResult {
  const [heatmap, setHeatmap] = useState<MatchingExecutionHeatmap | null>(null)
  const [loading, setLoading] = useState(false)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!tenantReady) {
      setHeatmap(null)
      return
    }
    setLoading(true)
    try {
      const res = await getAmbiguityHeatmap()
      if (cancelledRef.current) return
      setHeatmap(mapAmbiguityHeatmapResponse(res))
    } catch {
      if (!cancelledRef.current) setHeatmap(null)
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [tenantReady])

  useEffect(() => {
    cancelledRef.current = false
    void refresh()
    if (!tenantReady) return undefined
    const id = window.setInterval(() => void refresh(), intervalMs)
    return () => {
      cancelledRef.current = true
      window.clearInterval(id)
    }
  }, [tenantReady, intervalMs, refresh])

  return { heatmap, loading, refresh }
}
