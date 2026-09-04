'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { getAmbiguityKpis, getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { AmbiguityKpiResponse, FinalityStatus, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { MatchingConfidenceKpiStrip } from './components/MatchingConfidenceKpiStrip'
import { AmbiguityIntelligencePanel } from './components/AmbiguityIntelligencePanel'
import { AmbiguityVelocityChart } from './components/AmbiguityVelocityChart'
import { MatchingExecutionLog } from './components/MatchingExecutionLog'
import { BatchesNeedingReviewTable } from './components/BatchesNeedingReviewTable'
import { SignalClarityBar } from './components/SignalClarityBar'
import { useBatchContractKpis } from '../hooks/useBatchContractKpis'
import { useBatchSelectWithUrl } from '../hooks/useIntelligenceBatchUrlSync'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import { LiveDataHint } from '../shared'
import { intelligenceKpiScopeLabel } from '../shared/batchKpiScope'

const POLL_MS = 30_000

export function MatchingConfidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const router = useRouter()
  const { tenantReady } = useSessionTenant()

  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(() =>
    initialBatchId?.trim() || undefined,
  )
  const handleSelectBatch = useBatchSelectWithUrl('ambiguity', setSelectedBatchId)

  const [ambiguity, setAmbiguity] = useState<AmbiguityKpiResponse | null>(null)
  const [kpiLoading, setKpiLoading] = useState(false)
  const cancelledRef = useRef(false)
  const refresh = useCallback(async () => {
    if (!tenantReady) return
    setKpiLoading(true)
    try {
      const am = await getAmbiguityKpis(undefined, apiTrimmedString(selectedBatchId) || undefined)
      if (!cancelledRef.current) setAmbiguity(am)
    } finally {
      if (!cancelledRef.current) setKpiLoading(false)
    }
  }, [tenantReady, selectedBatchId])

  useEffect(() => {
    cancelledRef.current = false
    if (!tenantReady) { setAmbiguity(null); return }
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => { cancelledRef.current = true; window.clearInterval(id) }
  }, [tenantReady, refresh])
  const amb = isDataAvailable(ambiguity) ? ambiguity : null
  const {
    data: batchContract,
    loading: batchContractLoading,
    refresh: refreshBatchContract,
  } = useBatchContractKpis({
    tenantReady,
    batchId: selectedBatchId,
  })

  useEffect(() => {
    const pinned = initialBatchId?.trim()
    if (pinned) setSelectedBatchId(pinned)
  }, [initialBatchId])

  const [finalityFilter, setFinalityFilter] = useState<'' | FinalityStatus>('')
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)

  const loadBatches = useCallback(async () => {
    if (!tenantReady) {
      setBatches([])
      return
    }
    setBatchesLoading(true)
    try {
      const res = await getIntelligenceBatches({
        status: finalityFilter || undefined,
        limit: 80,
      })
      setBatches(res?.batches ?? [])
    } catch {
      setBatches([])
    } finally {
      setBatchesLoading(false)
    }
  }, [tenantReady, finalityFilter])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const handlePageRefresh = useCallback(async () => {
    router.refresh()
    await Promise.all([refresh(), refreshBatchContract(), loadBatches()])
  }, [refresh, refreshBatchContract, loadBatches, router])


  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: kpiLoading || batchContractLoading || batchesLoading,
  })

  const kpiScopeHint = intelligenceKpiScopeLabel(selectedBatchId)
  const stripLoading = kpiLoading && !amb

  return (
    <div className="min-h-screen bg-[#f4f5f1] p-3 text-slate-900 sm:p-5">
      <main className="mx-auto max-w-[1280px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] sm:px-5">
          <p className="text-[12px] font-semibold text-slate-500">Scope by batch</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LiveDataHint isLive={Boolean(tenantReady && amb)} source="intelligence" />
            <label className="relative inline-flex items-center">
              <SlidersHorizontal className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <select
                value={selectedBatchId ?? ''}
                onChange={(e) => handleSelectBatch(e.target.value || undefined)}
                className="h-11 min-w-[250px] appearance-none rounded-full border border-slate-200 bg-slate-50 pl-9 pr-9 font-mono text-[13px] font-semibold text-slate-700 shadow-sm focus:border-slate-950 focus:outline-none focus:ring-1 focus:ring-slate-950"
                aria-label="Scope batch by batch id"
              >
                <option value="">All batches (tenant)</option>
                {batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    {b.batch_id}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.28fr)_minmax(360px,0.72fr)]">
          <MatchingConfidenceKpiStrip amb={amb} loading={stripLoading} scopeHint={kpiScopeHint} />
          <AmbiguityIntelligencePanel amb={amb} batchId={selectedBatchId} />
        </div>

        <SignalClarityBar amb={amb} loading={stripLoading} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <AmbiguityVelocityChart
            amb={amb}
            batchContract={batchContract}
            batchContractLoading={batchContractLoading}
            selectedBatchId={selectedBatchId}
          />
          <MatchingExecutionLog
            heatmap={amb?.matching_execution_heatmap}
            summary={amb?.matching_execution_summary}
            heatmapLoading={stripLoading}
          />
        </div>

        <BatchesNeedingReviewTable
          batches={batches}
          loading={batchesLoading}
          finalityFilter={finalityFilter}
          onFilterChange={setFinalityFilter}
          highlightedBatchId={selectedBatchId}
          onRowSelect={handleSelectBatch}
        />
      </main>
    </div>
  )
}
