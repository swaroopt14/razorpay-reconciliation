'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSettlementParseErrorsForClientBatch } from '@/services/payout-command/prod-api/settlementObservations'

const inflight = new Map<string, Promise<number | null>>()

export function useSettlementParseErrorTotal(clientBatchId: string, enabled: boolean) {
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const bid = clientBatchId.trim()
    if (!bid || !enabled) {
      setTotal(null)
      return
    }

    setLoading(true)
    try {
      const existing = inflight.get(bid)
      const promise =
        existing ??
        (async () => {
          const res = await getSettlementParseErrorsForClientBatch(bid)
          return res.ok ? (res.data?.total ?? null) : null
        })()

      if (!existing) {
        inflight.set(bid, promise)
        promise.finally(() => inflight.delete(bid))
      }

      setTotal(await promise)
    } finally {
      setLoading(false)
    }
  }, [clientBatchId, enabled])

  useEffect(() => {
    void load()
  }, [load])

  return { total, loading }
}
