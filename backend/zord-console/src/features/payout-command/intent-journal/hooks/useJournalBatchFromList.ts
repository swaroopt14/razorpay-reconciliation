'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { fetchJournalSidebarBatches, findJournalBatch } from '../journalBatchCache'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'
import type { JournalBatchRecord } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

/** Loads a single batch row from the intent-engine batches list (decoupled widget fetch). */
export function useJournalBatchFromList(batchId: string, enabled: boolean, pollMs = LIVE_JOURNAL_POLL_MS) {
  const { tenantId, tenantReady } = useSessionTenant()
  const [batch, setBatch] = useState<JournalBatchRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const bid = batchId.trim()
    if (!bid || !tenantReady || !enabled) {
      setBatch(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await fetchJournalSidebarBatches(tenantId)
      setBatch(findJournalBatch(list, bid))
    } catch {
      setError('Could not load batch summary.')
      setBatch(null)
    } finally {
      setLoading(false)
    }
  }, [batchId, tenantId, tenantReady, enabled])

  useEffect(() => {
    if (!enabled || !tenantReady) {
      setBatch(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, tenantReady, load, pollMs])

  return { batch, loading, error, refetch: load }
}
