'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDisbursementTrend } from './getDisbursementTrend'
import type { DisbursementTrendRange, DisbursementTrendResponse } from './disbursementTrendTypes'

const DEFAULT_POLL_MS = 30_000

export type UseDisbursementTrendOptions = {
  tenantReady: boolean
  range: DisbursementTrendRange
  intervalMs?: number
}

/** Disbursement trend chart — session-scoped BFF; polls every 30s by default. */
export function useDisbursementTrend(options: UseDisbursementTrendOptions) {
  const { tenantReady, range, intervalMs = DEFAULT_POLL_MS } = options
  const [data, setData] = useState<DisbursementTrendResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const cancelledRef = useRef(false)
  const rangeRef = useRef(range)
  rangeRef.current = range

  const refresh = useCallback(async () => {
    if (!tenantReady) {
      setData(null)
      return
    }
    const requestedRange = range
    setLoading(true)
    try {
      const res = await getDisbursementTrend(requestedRange)
      if (!cancelledRef.current && rangeRef.current === requestedRange) {
        setData(res)
      }
    } finally {
      if (!cancelledRef.current && rangeRef.current === requestedRange) {
        setLoading(false)
      }
    }
  }, [tenantReady, range])

  useEffect(() => {
    cancelledRef.current = false
    if (!tenantReady) {
      setData(null)
      setLoading(false)
      return
    }
    setData(null)
    setLoading(true)
    void refresh()
    const id = window.setInterval(() => void refresh(), intervalMs)
    return () => {
      cancelledRef.current = true
      window.clearInterval(id)
    }
  }, [tenantReady, range, refresh, intervalMs])

  return { data, loading, refresh }
}
