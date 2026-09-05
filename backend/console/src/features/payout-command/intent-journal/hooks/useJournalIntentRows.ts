'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchJournalPaymentIntents } from '../journalBatchCache'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'
import { mapPaymentIntentListItemToRow } from '../mappers/mapIntentTableRow'
import type { JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

export function useJournalIntentRows(
  batchId: string,
  enabled: boolean,
  sessionTenantId: string,
  pollMs = LIVE_JOURNAL_POLL_MS,
) {
  const [rows, setRows] = useState<JournalIntentRow[]>([])
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
      const res = await fetchJournalPaymentIntents(bid)
      if (!res) {
        setError('Could not load payment intents for this batch.')
        setRows([])
        setPagination(null)
        return
      }
      setRows(
        (res.items ?? []).map((item, index) =>
          mapPaymentIntentListItemToRow(item, bid, index, sessionTenantId),
        ),
      )
      setPagination(res.pagination ?? null)
    } catch {
      setError('Could not load payment intents.')
      setRows([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [batchId, enabled, sessionTenantId])

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
