'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchSettlementObservationsPageWithMeta,
  fetchSettlementObservationsWithMeta,
  type SettlementObservationsFetchResult,
} from '../settlementBatchCache'
import { LIVE_SETTLEMENT_POLL_MS } from '../settlementConstants'
import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'

export type UseSettlementObservationRowsOptions = {
  page?: number
  pageSize?: number
  /** When true, aggregates all API pages (for client-side filters / export). */
  fetchAll?: boolean
}

/** Loads canonical observation rows for one client_batch_id (deduped via settlementBatchCache). */
export function useSettlementObservationRows(
  clientBatchId: string,
  enabled: boolean,
  opts?: UseSettlementObservationRowsOptions,
  pollMs = LIVE_SETTLEMENT_POLL_MS,
) {
  const page = Math.max(1, opts?.page ?? 1)
  const pageSize = Math.max(1, opts?.pageSize ?? 50)
  const fetchAll = opts?.fetchAll === true

  const [rows, setRows] = useState<SettlementObservationTableRow[]>([])
  const [observationTotal, setObservationTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyResult = useCallback((result: SettlementObservationsFetchResult) => {
    setRows(result.rows)
    setObservationTotal(result.total)
  }, [])

  const load = useCallback(async () => {
    const bid = clientBatchId.trim()
    if (!bid || !enabled) {
      setRows([])
      setObservationTotal(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = fetchAll
        ? await fetchSettlementObservationsWithMeta(bid)
        : await fetchSettlementObservationsPageWithMeta(bid, page, pageSize)
      applyResult(result)
    } catch {
      setError('Could not load settlement observations.')
      setRows([])
      setObservationTotal(null)
    } finally {
      setLoading(false)
    }
  }, [applyResult, clientBatchId, enabled, fetchAll, page, pageSize])

  useEffect(() => {
    if (!enabled || !clientBatchId.trim()) {
      setRows([])
      setObservationTotal(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, clientBatchId, load, pollMs])

  return { rows, observationTotal, loading, error, refetch: load }
}
