'use client'

import { useCallback, useEffect, useState } from 'react'
import { getProdDlqManualReview } from '@/services/payout-command/prod-api/getProdDlqManualReview'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'

/** Manual-review DLQ queue count from GET /api/prod/dlq/manual-review (`pagination.total`). */
export function useDlqManualReviewCount(
  enabled: boolean,
  batchId?: string,
  pollMs = LIVE_JOURNAL_POLL_MS,
) {
  const [total, setTotal] = useState<number | null>(null)
  const [batchCount, setBatchCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!enabled) {
      setTotal(null)
      setBatchCount(null)
      return
    }
    setLoading(true)
    try {
      const res = await getProdDlqManualReview()
      const items = res?.items ?? []
      const apiTotal = res?.pagination?.total ?? items.length
      setTotal(apiTotal)

      const bid = apiTrimmedString(batchId)
      if (bid) {
        const scoped = items.filter((row) => {
          const rowBatch = apiTrimmedString(row.client_batch_ref) || apiTrimmedString(row.batch_id)
          return rowBatch === bid
        }).length
        setBatchCount(scoped)
      } else {
        setBatchCount(null)
      }
    } catch {
      setTotal(null)
      setBatchCount(null)
    } finally {
      setLoading(false)
    }
  }, [enabled, batchId])

  useEffect(() => {
    if (!enabled) {
      setTotal(null)
      setBatchCount(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, load, pollMs])

  const bid = apiTrimmedString(batchId)
  const displayCount = bid ? (batchCount ?? total) : total

  return { total, batchCount, displayCount, loading, refetch: load }
}
