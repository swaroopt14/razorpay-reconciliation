'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  extractClientBatchIdsFromListResponse,
  getSettlementObservationBatchesForSession,
  getSettlementObservationsForClientBatch,
  mapObservationToTableRow,
  SETTLEMENT_OBSERVATIONS_BFF_PATH,
  type SettlementObservationTableRow,
} from '@/services/payout-command/prod-api/settlementObservations'

export type SettlementJournalFeedMeta = {
  ok: boolean
  status: number
  batchCount: number
  bffPath: string
  sessionTenantId: string
  errorSnippet?: string
}

export type SettlementJournalFeed = {
  tenantReady: boolean
  tenantId: string
  clientBatches: string[]
  selectedClientBatchId: string
  observationRows: SettlementObservationTableRow[]
  feedLoaded: boolean
  detailLoading: boolean
  syncAt: Date | null
  feedError: string | null
  feedMeta: SettlementJournalFeedMeta | null
  selectClientBatch: (clientBatchId: string) => void
  refreshFeed: () => Promise<void>
}

function mergeBatchIds(apiIds: string[], pinned?: string): string[] {
  const out = [...apiIds]
  const pin = pinned?.trim()
  if (pin && !out.includes(pin)) out.unshift(pin)
  return out
}

export function useSettlementJournalFeed(options: {
  enabled: boolean
  initialClientBatchId?: string
  pollMs?: number
}): SettlementJournalFeed {
  const { enabled, initialClientBatchId, pollMs = 12_000 } = options
  const { tenantId, tenantReady } = useSessionTenant()

  const initialBatchRef = useRef(initialClientBatchId?.trim() ?? '')
  initialBatchRef.current = initialClientBatchId?.trim() ?? ''

  const [clientBatches, setClientBatches] = useState<string[]>(() =>
    initialBatchRef.current ? [initialBatchRef.current] : [],
  )
  const [selectedClientBatchId, setSelectedClientBatchId] = useState(() => initialBatchRef.current)
  const [observationRows, setObservationRows] = useState<SettlementObservationTableRow[]>([])
  const [feedLoaded, setFeedLoaded] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [syncAt, setSyncAt] = useState<Date | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [feedMeta, setFeedMeta] = useState<SettlementJournalFeedMeta | null>(null)

  const selectedRef = useRef(selectedClientBatchId)
  selectedRef.current = selectedClientBatchId

  const refreshSidebar = useCallback(async () => {
    const pinned = initialBatchRef.current
    const fetchRes = await getSettlementObservationBatchesForSession()
    const apiIds = fetchRes.ok && fetchRes.data ? extractClientBatchIdsFromListResponse(fetchRes.data) : []
    const ids = mergeBatchIds(apiIds, pinned)

    setFeedMeta({
      ok: fetchRes.ok,
      status: fetchRes.status,
      batchCount: ids.length,
      bffPath: SETTLEMENT_OBSERVATIONS_BFF_PATH,
      sessionTenantId: tenantId,
      errorSnippet: fetchRes.errorText,
    })

    if (!fetchRes.ok) {
      setFeedError(null)
      if (pinned) {
        setClientBatches([pinned])
        setSelectedClientBatchId(pinned)
      } else {
        setClientBatches([])
      }
      return
    }

    setClientBatches(ids)
    setFeedError(null)
    setSelectedClientBatchId((prev) => {
      if (pinned && ids.includes(pinned)) return pinned
      if (prev && ids.includes(prev)) return prev
      if (pinned) return pinned
      return ids[0] ?? ''
    })
  }, [tenantId])

  const loadObservations = useCallback(async (clientBatchId: string) => {
    const bid = clientBatchId.trim()
    if (!bid) {
      setObservationRows([])
      return
    }
    setDetailLoading(true)
    try {
      const res = await getSettlementObservationsForClientBatch(bid)
      if (!res.ok || !res.data) {
        setFeedError(null)
        setObservationRows([])
        return
      }
      const items = res.data.items ?? []
      if (items.length === 0) {
        setFeedError(null)
        setObservationRows([])
        return
      }
      setFeedError(null)
      setObservationRows(
        items.map((it, rowIndex) =>
          mapObservationToTableRow(it, { clientBatchId: bid, rowIndex }),
        ),
      )
    } catch {
      setFeedError(null)
      setObservationRows([])
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const refreshFeed = useCallback(async () => {
    await refreshSidebar()
    const bid = selectedRef.current.trim()
    if (bid) await loadObservations(bid)
    setSyncAt(new Date())
  }, [refreshSidebar, loadObservations])

  const selectClientBatch = useCallback((clientBatchId: string) => {
    setSelectedClientBatchId(clientBatchId)
  }, [])

  useEffect(() => {
    if (!enabled || !tenantReady) {
      setClientBatches(initialBatchRef.current ? [initialBatchRef.current] : [])
      setObservationRows([])
      setFeedLoaded(false)
      return
    }

    let cancelled = false
    setFeedLoaded(false)

    const tick = async () => {
      if (cancelled) return
      try {
        await refreshSidebar()
        if (!cancelled) {
          const bid = selectedRef.current.trim()
          if (bid) await loadObservations(bid)
        }
      } catch {
        if (!cancelled) setFeedError(null)
      }
      if (!cancelled) {
        setFeedLoaded(true)
        setSyncAt(new Date())
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled, tenantReady, refreshSidebar, loadObservations, pollMs])

  useEffect(() => {
    if (!enabled || !tenantReady || !selectedClientBatchId.trim()) {
      setObservationRows([])
      return
    }
    void loadObservations(selectedClientBatchId)
  }, [enabled, tenantReady, selectedClientBatchId, loadObservations])

  useEffect(() => {
    const bid = initialClientBatchId?.trim()
    if (!bid) return
    initialBatchRef.current = bid
    setSelectedClientBatchId(bid)
    setClientBatches((prev) => mergeBatchIds(prev, bid))
  }, [initialClientBatchId])

  return {
    tenantReady,
    tenantId,
    clientBatches,
    selectedClientBatchId,
    observationRows,
    feedLoaded,
    detailLoading,
    syncAt,
    feedError,
    feedMeta,
    selectClientBatch,
    refreshFeed,
  }
}
