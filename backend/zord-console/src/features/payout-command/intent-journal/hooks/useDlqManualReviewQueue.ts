'use client'

import { useCallback, useEffect, useState } from 'react'
import { getProdDlqManualReview } from '@/services/payout-command/prod-api/getProdDlqManualReview'
import type { ApiDlqRow } from '@/services/payout-command/prod-api/prodApiTypes'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'

/** Polls manual-review DLQ queue for the signed-in tenant. */
export function useDlqManualReviewQueue(enabled: boolean, pollMs = LIVE_JOURNAL_POLL_MS) {
  const [items, setItems] = useState<ApiDlqRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) {
      setItems([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await getProdDlqManualReview()
      setItems(res?.items ?? [])
    } catch {
      setError('Could not load manual-review queue.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setItems([])
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, load, pollMs])

  return { items, loading, error, refetch: load }
}
