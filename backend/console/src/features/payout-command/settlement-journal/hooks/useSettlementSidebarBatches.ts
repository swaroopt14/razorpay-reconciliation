'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { getSettlementObservationBatchesForSession } from '@/services/payout-command/prod-api/settlementObservations'
import { fetchSettlementSidebarBatches } from '../settlementBatchCache'
import { LIVE_SETTLEMENT_POLL_MS, SETTLEMENT_OBSERVATIONS_BFF_PATH } from '../settlementConstants'

export type SettlementSidebarFetchMeta = {
  ok: boolean
  status: number
  batchCount: number
  bffPath: string
  sessionTenantId: string
  errorSnippet?: string
}

export function useSettlementSidebarBatches(options: {
  enabled: boolean
  initialClientBatchId?: string
  selectedClientBatchId: string
  setSelectedClientBatchId: Dispatch<SetStateAction<string>>
  pollMs?: number
}) {
  const { enabled, initialClientBatchId, selectedClientBatchId, setSelectedClientBatchId, pollMs = LIVE_SETTLEMENT_POLL_MS } =
    options
  const { tenantId, tenantReady } = useSessionTenant()

  const [clientBatches, setClientBatches] = useState<string[]>(() =>
    initialClientBatchId?.trim() ? [initialClientBatchId.trim()] : [],
  )
  const [feedLoaded, setFeedLoaded] = useState(false)
  const [feedMeta, setFeedMeta] = useState<SettlementSidebarFetchMeta | null>(null)
  const [syncAt, setSyncAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    if (!tenantId.trim()) {
      setClientBatches(initialClientBatchId?.trim() ? [initialClientBatchId.trim()] : [])
      return
    }
    const pinned = initialClientBatchId?.trim()

    const fetchRes = await getSettlementObservationBatchesForSession()
    const ids = await fetchSettlementSidebarBatches(pinned)

    setFeedMeta({
      ok: fetchRes.ok,
      status: fetchRes.status,
      batchCount: ids.length,
      bffPath: SETTLEMENT_OBSERVATIONS_BFF_PATH,
      sessionTenantId: tenantId,
      errorSnippet: fetchRes.errorText,
    })

    setClientBatches(ids)
    setSyncAt(new Date())
    setSelectedClientBatchId((prev) => {
      if (ids.length === 0) return ''
      if (pinned && ids.includes(pinned)) return pinned
      if (prev && ids.includes(prev)) return prev
      if (pinned) return pinned
      return ids[0] ?? ''
    })
  }, [tenantId, initialClientBatchId, setSelectedClientBatchId])

  useEffect(() => {
    if (!enabled || !tenantReady || !tenantId.trim()) {
      setClientBatches(initialClientBatchId?.trim() ? [initialClientBatchId.trim()] : [])
      setFeedLoaded(false)
      return
    }

    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        await refresh()
      } catch {
        /* ignore */
      }
      if (!cancelled) setFeedLoaded(true)
    }

    void tick()
    const id = window.setInterval(() => void tick(), pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled, tenantReady, tenantId, refresh, pollMs, initialClientBatchId])

  useEffect(() => {
    const bid = initialClientBatchId?.trim()
    if (!bid) return
    setSelectedClientBatchId(bid)
    setClientBatches((prev) => (prev.includes(bid) ? prev : [bid, ...prev]))
  }, [initialClientBatchId, setSelectedClientBatchId])

  return {
    tenantId,
    tenantReady,
    clientBatches,
    selectedClientBatchId,
    feedLoaded,
    feedMeta,
    syncAt,
    refresh,
  }
}
