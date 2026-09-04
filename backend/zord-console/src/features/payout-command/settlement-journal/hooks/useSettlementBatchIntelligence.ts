'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getBatchContractKpis,
  getIntelligenceBatchDetail,
} from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { BatchContractKpiResponse, BatchDetailResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import {
  resolveSettlementIntelligenceKpis,
  type ResolvedSettlementIntelligenceKpis,
} from '../selectors/resolveSettlementIntelligenceKpis'

const inflight = new Map<string, Promise<SettlementBatchIntelligenceState>>()

type SettlementBatchIntelligenceState = {
  batchContract: BatchContractKpiResponse | null
  batchDetail: BatchDetailResponse | null
  kpis: ResolvedSettlementIntelligenceKpis
}

const EMPTY_KPIS = resolveSettlementIntelligenceKpis(null, null)

export function useSettlementBatchIntelligence(clientBatchId: string, enabled: boolean) {
  const [batchContract, setBatchContract] = useState<BatchContractKpiResponse | null>(null)
  const [batchDetail, setBatchDetail] = useState<BatchDetailResponse | null>(null)
  const [kpis, setKpis] = useState<ResolvedSettlementIntelligenceKpis>(EMPTY_KPIS)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const bid = clientBatchId.trim()
    if (!bid || !enabled) {
      setBatchContract(null)
      setBatchDetail(null)
      setKpis(EMPTY_KPIS)
      return
    }

    setLoading(true)
    try {
      const existing = inflight.get(bid)
      const promise =
        existing ??
        (async (): Promise<SettlementBatchIntelligenceState> => {
          const [contract, detail] = await Promise.all([
            getBatchContractKpis(bid),
            getIntelligenceBatchDetail(bid),
          ])
          return {
            batchContract: contract,
            batchDetail: detail,
            kpis: resolveSettlementIntelligenceKpis(contract, detail),
          }
        })()

      if (!existing) {
        inflight.set(bid, promise)
        promise.finally(() => inflight.delete(bid))
      }

      const result = await promise
      setBatchContract(result.batchContract)
      setBatchDetail(result.batchDetail)
      setKpis(result.kpis)
    } finally {
      setLoading(false)
    }
  }, [clientBatchId, enabled])

  useEffect(() => {
    void load()
  }, [load])

  return { batchContract, batchDetail, kpis, loading, refetch: load }
}
