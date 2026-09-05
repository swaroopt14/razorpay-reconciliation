'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchJournalDlqItems } from '../journalBatchCache'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'
import { mapDlqListItemToReviewRow } from '../mappers/mapIntentReviewItem'
import type { JournalFailureRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

export function useJournalFailureRows(batchId: string, enabled: boolean, pollMs = LIVE_JOURNAL_POLL_MS) {
  const [rows, setRows] = useState<JournalFailureRow[]>([])
  const [pagination, setPagination] = useState<{ page?: number; page_size?: number; total?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const bid = batchId.trim()
    if (!bid || !enabled) {
      setRows([])
      setPagination(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchJournalDlqItems(bid)
      if (!res) {
        setError('Could not load review items for this batch.')
        setRows([])
        setPagination(null)
        return
      }
      setRows((res.items ?? []).map((row) => mapDlqListItemToReviewRow(row, bid)))
      setPagination(res.pagination ?? null)
    } catch {
      setError('Could not load review items.')
      setRows([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [batchId, enabled])

  useEffect(() => {
    if (!enabled) {
      setRows([])
      setPagination(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, load, pollMs])

  return { rows, pagination, loading, error, refetch: load }
}
