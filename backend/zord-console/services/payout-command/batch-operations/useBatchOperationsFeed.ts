'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  getProdIntentEngineBatchDetailAll,
  getProdIntentEngineBatchesForSession,
} from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import {
  getAmbiguityKpis,
  getDefensibilityKpis,
  getIntelligenceBatchDetail,
  getIntelligenceBatches,
  getLeakageKpis,
  getPatternsKpis,
} from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type {
  AmbiguityKpiResponse,
  BatchDetailResponse,
  DefensibilityKpiResponse,
  LeakageKpiResponse,
  PatternsKpiResponse,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import {
  mapDlqToFailureRow,
  mapIntelligenceRowToBatchRecord,
  mapPaymentIntentToIntentRow,
  mapSidebarItemToBatchRecord,
  type JournalBatchRecord,
  type JournalFailureRow,
  type JournalIntentRow,
} from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import {
  getSettlementObservationsForClientBatch,
  mapObservationToTableRow,
  type SettlementObservationTableRow,
} from '@/services/payout-command/prod-api/settlementObservations'
import { enrichSettlementRowsWithPaymentIntentMatches } from '@/services/payout-command/prod-api/matchSettlementToPaymentIntents'
import { summaryFromIntelligenceBatchRow } from '@/services/payout-command/batch-model'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import type { BatchSummary } from '@/services/payout-command/batch-model'

export const BATCH_OPERATIONS_POLL_MS = 8_000

export type SettlementBatchSummary = {
  observationCount: number
  grossAmount: number
  settledAmount: number
  feeAmount: number
  settledPct: number
}

export type AttentionPreviewRow = {
  id: string
  kind: 'failure' | 'intent'
  beneficiary: string
  amount: number
  status: string
  reason: string
  lastUpdated: string
}

export type BatchOperationsFeed = {
  tenantId: string
  tenantReady: boolean
  batchId: string
  setBatchId: (id: string) => void
  recentBatches: JournalBatchRecord[]
  intentRows: JournalIntentRow[]
  failureRows: JournalFailureRow[]
  attentionPreview: AttentionPreviewRow[]
  attentionTotal: number
  intelBatchDetail: BatchDetailResponse | null
  patternsKpi: PatternsKpiResponse | null
  leakageKpi: LeakageKpiResponse | null
  ambiguityKpi: AmbiguityKpiResponse | null
  defensibilityKpi: DefensibilityKpiResponse | null
  intelligenceSummary: BatchSummary | null
  settlementSummary: SettlementBatchSummary | null
  settlementObservationRows: SettlementObservationTableRow[]
  feedLoaded: boolean
  detailLoading: boolean
  syncAt: Date | null
  feedError: string | null
  refreshBatchFeed: () => Promise<void>
}

function usePageVisible() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    onVis()
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  return visible
}

function summarizeSettlement(rows: SettlementObservationTableRow[]): SettlementBatchSummary {
  if (!rows.length) {
    return { observationCount: 0, grossAmount: 0, settledAmount: 0, feeAmount: 0, settledPct: 0 }
  }
  let grossAmount = 0
  let settledAmount = 0
  let feeAmount = 0
  let settledCount = 0
  for (const r of rows) {
    grossAmount += r.amount
    settledAmount += r.settledAmount
    feeAmount += r.feeAmount
    const st = (r.statusRaw ?? r.status ?? '').toUpperCase()
    if (st.includes('SETTL') || st.includes('SUCCESS') || st === 'CONFIRMED') settledCount += 1
  }
  return {
    observationCount: rows.length,
    grossAmount,
    settledAmount,
    feeAmount,
    settledPct: rows.length ? (settledCount / rows.length) * 100 : 0,
  }
}

export function buildAttentionPreview(
  failures: JournalFailureRow[],
  intents: JournalIntentRow[],
  max = 10,
): { preview: AttentionPreviewRow[]; total: number } {
  const failureItems: AttentionPreviewRow[] = failures.map((r) => ({
    id: r.requestId,
    kind: 'failure',
    beneficiary: r.reference || r.requestId,
    amount: r.amount,
    status: 'Requires review',
    reason: r.failureReason || r.failureStage,
    lastUpdated: r.lastUpdated,
  }))
  const intentAttention = intents.filter(
    (r) =>
      r.status === 'Needs Review' ||
      r.status === 'Pending' ||
      r.status === 'In Progress',
  )
  const intentItems: AttentionPreviewRow[] = intentAttention.map((r) => ({
    id: r.requestId,
    kind: 'intent',
    beneficiary: r.reference || r.requestId,
    amount: r.amount,
    status: r.status,
    reason: r.match,
    lastUpdated: r.lastUpdated,
  }))
  const total = failureItems.length + intentItems.length
  const preview = [...failureItems, ...intentItems].slice(0, max)
  return { preview, total }
}

export function useBatchOperationsFeed(options: {
  enabled: boolean
  batchId: string
  onBatchIdFromSidebar?: (id: string) => void
  pollMs?: number
}): BatchOperationsFeed {
  const { enabled, batchId, pollMs = BATCH_OPERATIONS_POLL_MS } = options
  const pageVisible = usePageVisible()
  const { tenantId, tenantReady } = useSessionTenant()

  const [recentBatches, setRecentBatches] = useState<JournalBatchRecord[]>([])
  const [intentRows, setIntentRows] = useState<JournalIntentRow[]>([])
  const [failureRows, setFailureRows] = useState<JournalFailureRow[]>([])
  const [intelBatchDetail, setIntelBatchDetail] = useState<BatchDetailResponse | null>(null)
  const [patternsKpi, setPatternsKpi] = useState<PatternsKpiResponse | null>(null)
  const [leakageKpi, setLeakageKpi] = useState<LeakageKpiResponse | null>(null)
  const [ambiguityKpi, setAmbiguityKpi] = useState<AmbiguityKpiResponse | null>(null)
  const [defensibilityKpi, setDefensibilityKpi] = useState<DefensibilityKpiResponse | null>(null)
  const [settlementSummary, setSettlementSummary] = useState<SettlementBatchSummary | null>(null)
  const [settlementObservationRows, setSettlementObservationRows] = useState<SettlementObservationTableRow[]>([])
  const [feedLoaded, setFeedLoaded] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [syncAt, setSyncAt] = useState<Date | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)

  const batchIdRef = useRef(batchId)
  batchIdRef.current = batchId

  const refreshRecentBatches = useCallback(async () => {
    const fetchRes = await getProdIntentEngineBatchesForSession()
    if (!fetchRes.ok || !fetchRes.data) {
      if (tenantId.trim()) {
        try {
          const batchesRes = await getIntelligenceBatches({ limit: 20 })
          const rows = (batchesRes?.batches ?? []).map(mapIntelligenceRowToBatchRecord)
          setRecentBatches(rows)
          return
        } catch {
          /* optional */
        }
      }
      setRecentBatches([])
      return
    }
    let batchRows = (fetchRes.data.items ?? []).map(mapSidebarItemToBatchRecord)
    if (batchRows.length === 0 && tenantId.trim()) {
      try {
        const batchesRes = await getIntelligenceBatches({ limit: 20 })
        batchRows = (batchesRes?.batches ?? []).map(mapIntelligenceRowToBatchRecord)
      } catch {
        /* optional */
      }
    }
    setRecentBatches(batchRows)
  }, [tenantId])

  const loadBatchScoped = useCallback(async (bid: string) => {
    const id = bid.trim()
    if (!id) {
      setIntentRows([])
      setFailureRows([])
      setIntelBatchDetail(null)
      setPatternsKpi(null)
      setLeakageKpi(null)
      setAmbiguityKpi(null)
      setDefensibilityKpi(null)
      setSettlementSummary(null)
      setSettlementObservationRows([])
      return
    }

    setDetailLoading(true)
    setFeedError(null)

    try {
      const [engineRes, intelRes, patternsRes, leakageRes, ambiguityRes, defensibilityRes, settleRes] =
        await Promise.all([
          getProdIntentEngineBatchDetailAll(undefined, id),
          getIntelligenceBatchDetail(id),
          getPatternsKpis(id),
          getLeakageKpis(undefined, id),
          getAmbiguityKpis(undefined, id),
          getDefensibilityKpis(),
          getSettlementObservationsForClientBatch(id),
        ])

      if (engineRes?.batchDetails && engineRes.batchDetails.batchId === id) {
        const { batchDetails } = engineRes
        setIntentRows(
          (batchDetails.paymentIntents?.items ?? []).map((it) =>
            mapPaymentIntentToIntentRow(it, id, tenantId),
          ),
        )
        setFailureRows((batchDetails.dlqItems?.items ?? []).map((row) => mapDlqToFailureRow(row)))
      } else {
        setIntentRows([])
        setFailureRows([])
        if (engineRes === null) {
          setFeedError((prev) => prev ?? 'Could not load batch rows from intent-engine.')
        }
      }
      setIntelBatchDetail(intelRes)
      setPatternsKpi(patternsRes)
      setLeakageKpi(leakageRes)
      setAmbiguityKpi(ambiguityRes)
      setDefensibilityKpi(defensibilityRes)

      if (settleRes.ok && settleRes.data?.items?.length) {
        const paymentItems = engineRes?.batchDetails?.paymentIntents?.items ?? []
        const rows = settleRes.data.items.map((item, i) =>
          mapObservationToTableRow(item, { clientBatchId: id, rowIndex: i }),
        )
        const enrichedRows = enrichSettlementRowsWithPaymentIntentMatches(rows, paymentItems)
        setSettlementObservationRows(enrichedRows)
        setSettlementSummary(summarizeSettlement(enrichedRows))
      } else {
        setSettlementObservationRows([])
        setSettlementSummary(null)
      }
    } catch {
      setFeedError('Could not refresh batch operations feed.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const refreshBatchFeed = useCallback(async () => {
    if (!tenantReady) return
    await refreshRecentBatches()
    const bid = batchIdRef.current.trim()
    if (bid) await loadBatchScoped(bid)
    setSyncAt(new Date())
  }, [tenantReady, refreshRecentBatches, loadBatchScoped])

  const setBatchId = useCallback((_id: string) => {
    /* controlled by parent — noop placeholder for API symmetry */
  }, [])

  useEffect(() => {
    if (!enabled || !tenantReady || !pageVisible) {
      if (!enabled || !tenantReady) setFeedLoaded(false)
      return
    }

    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        await refreshRecentBatches()
        const bid = batchIdRef.current.trim()
        if (bid) await loadBatchScoped(bid)
      } catch {
        if (!cancelled) setFeedError('Could not refresh batch operations feed.')
      }
      if (!cancelled) {
        setFeedLoaded(true)
        setSyncAt(new Date())
      }
    }

    void tick()
    const intervalId = window.setInterval(() => void tick(), pollMs)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [enabled, tenantReady, pageVisible, pollMs, refreshRecentBatches, loadBatchScoped])

  useEffect(() => {
    if (!enabled || !tenantReady) return
    void loadBatchScoped(batchId)
  }, [enabled, tenantReady, batchId, loadBatchScoped])

  const operatorIntelBatchId =
    batchId.trim() && !batchId.trim().startsWith('LOCAL-') ? batchId.trim() : ''

  const intelligenceSummary = ((): BatchSummary | null => {
    if (!operatorIntelBatchId || !intelBatchDetail?.batch) return null
    const loadedId = apiTrimmedString(intelBatchDetail.batch.batch_id)
    if (loadedId !== operatorIntelBatchId) return null
    return summaryFromIntelligenceBatchRow(intelBatchDetail.batch)
  })()

  const { preview: attentionPreview, total: attentionTotal } = buildAttentionPreview(failureRows, intentRows)

  return {
    tenantId,
    tenantReady,
    batchId,
    setBatchId,
    recentBatches,
    intentRows,
    failureRows,
    attentionPreview,
    attentionTotal,
    intelBatchDetail,
    patternsKpi,
    leakageKpi,
    ambiguityKpi,
    defensibilityKpi,
    intelligenceSummary,
    settlementSummary,
    settlementObservationRows,
    feedLoaded,
    detailLoading,
    syncAt,
    feedError,
    refreshBatchFeed,
  }
}

export function patternsInsight(patternsKpi: PatternsKpiResponse | null): string | null {
  if (!patternsKpi || !isDataAvailable(patternsKpi)) return null
  const sc = patternsKpi.batch_anomaly_score
  const level = patternsKpi.anomaly_level.replace(/_/g, ' ')
  const shown =
    Number.isFinite(sc) && sc >= 0 && sc <= 1 ? `${(sc * 100).toFixed(1)}%` : `${Number(sc).toFixed(3)}`
  return `Pattern KPI: anomaly ${shown} · ${level}.`
}
