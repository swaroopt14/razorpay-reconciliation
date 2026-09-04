'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getProdIntentEngineBatchDetail,
  getProdIntentEngineBatchesForSession,
} from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import { isZordProcessingPaymentIntent } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

const MAX_BATCHES_SCAN = 15

export function useZordProcessingIntentCount(enabled = true) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const listRes = await getProdIntentEngineBatchesForSession()
      if (!listRes.ok || !listRes.data?.items?.length) {
        setCount(0)
        return
      }
      const batchIds = (listRes.data.items ?? [])
        .slice(0, MAX_BATCHES_SCAN)
        .map((it) => String(it.batchId ?? '').trim())
        .filter(Boolean)

      let processing = 0
      await Promise.all(
        batchIds.map(async (batchId) => {
          const detail = await getProdIntentEngineBatchDetail(undefined, batchId, {
            page: 1,
            pageSize: 200,
          })
          const intents = detail?.batchDetails?.paymentIntents?.items ?? []
          for (const intent of intents) {
            if (isZordProcessingPaymentIntent(intent)) processing += 1
          }
        }),
      )
      setCount(processing)
    } catch {
      setCount(null)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { count, loading, refresh }
}
