'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchProdJsonGet } from '@/services/payout-command/prod-api/fetchProdJsonGet'
import type { SettlementObservationBatchListResponse } from '@/services/payout-command/prod-api/settlementObservations'
import type { IntentEngineBatchSidebarItem } from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import type { ListPacksResponse } from '@/services/payout-command/prod-api/evidenceTypes'
import { evidenceReadinessFromPacks } from '@/services/payout-command/prod-api/layeredVerification'

type IntentBatchesProbe = {
  items?: IntentEngineBatchSidebarItem[]
}

export type DataSourceBadgeStatus = 'received' | 'missing' | 'partial' | 'ready' | 'processing'

export type PaymentCommandDataSources = {
  intentStatus: DataSourceBadgeStatus
  settlementStatus: DataSourceBadgeStatus
  bankStatementStatus: DataSourceBadgeStatus
  evidenceStatus: DataSourceBadgeStatus
  loading: boolean
  refresh: () => Promise<void>
}

export function usePaymentCommandDataSources(options: {
  tenantReady: boolean
  evidencePackRate?: number | null
  auditReadyPct?: number | null
}): PaymentCommandDataSources {
  const { tenantReady } = options
  const [intentStatus, setIntentStatus] = useState<DataSourceBadgeStatus>('missing')
  const [settlementStatus, setSettlementStatus] = useState<DataSourceBadgeStatus>('missing')
  const [bankStatementStatus, setBankStatementStatus] = useState<DataSourceBadgeStatus>('missing')
  const [evidenceStatus, setEvidenceStatus] = useState<DataSourceBadgeStatus>('missing')
  const [loading, setLoading] = useState(false)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!tenantReady) return
    setLoading(true)
    try {
      const [ingest, packs] = await Promise.all([
        fetchProdJsonGet<{
          sources?: Array<{ id: string; status: DataSourceBadgeStatus }>
        }>('/api/prod/ingest-status'),
        fetchProdJsonGet<ListPacksResponse>('/api/prod/evidence/packs?limit=50'),
      ])
      if (cancelledRef.current) return
      const byId = new Map((ingest?.sources ?? []).map((s) => [s.id, s.status]))
      setIntentStatus(byId.get('intent_file') ?? 'missing')
      setSettlementStatus(byId.get('settlement_file') ?? 'missing')
      setBankStatementStatus(byId.get('bank_statement') ?? 'missing')
      const fromPacks = evidenceReadinessFromPacks(packs?.packs ?? [])
      const fromIngest = byId.get('evidence')
      setEvidenceStatus(fromPacks !== 'missing' ? fromPacks : fromIngest === 'ready' ? 'ready' : fromIngest === 'partial' ? 'partial' : 'missing')
    } catch {
      const [intents, settlement, packs] = await Promise.all([
        fetchProdJsonGet<IntentBatchesProbe>('/api/prod/intents/batches?page=1&page_size=5'),
        fetchProdJsonGet<SettlementObservationBatchListResponse>(
          '/api/prod/settlement/observations/batches',
        ),
        fetchProdJsonGet<ListPacksResponse>('/api/prod/evidence/packs?limit=50'),
      ])
      if (cancelledRef.current) return
      const intentCount = intents?.items?.length ?? 0
      setIntentStatus(intentCount > 0 ? 'received' : 'missing')
      const settlementCount = settlement?.items?.length ?? 0
      setSettlementStatus(settlementCount > 0 ? 'received' : 'missing')
      setBankStatementStatus('missing')
      setEvidenceStatus(evidenceReadinessFromPacks(packs?.packs ?? []))
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [tenantReady])

  useEffect(() => {
    cancelledRef.current = false
    if (!tenantReady) {
      setIntentStatus('missing')
      setSettlementStatus('missing')
      setBankStatementStatus('missing')
      setEvidenceStatus('missing')
      return
    }
    void refresh()
    return () => {
      cancelledRef.current = true
    }
  }, [tenantReady, refresh])

  return {
    intentStatus,
    settlementStatus,
    bankStatementStatus,
    evidenceStatus,
    loading,
    refresh,
  }
}
