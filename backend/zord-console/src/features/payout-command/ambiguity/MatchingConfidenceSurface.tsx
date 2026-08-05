'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useAmbiguityHeatmap } from '@/services/payout-command/prod-api/useAmbiguityHeatmap'
import { getAmbiguityKpis, getIntelligenceBatches, getLeakageKpis } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { AmbiguityKpiResponse, FinalityStatus, IntelligenceBatchRow , LeakageKpiResponse} from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { MatchingConfidenceKpiStrip } from './components/MatchingConfidenceKpiStrip'
import { AmbiguityVelocityChart } from './components/AmbiguityVelocityChart'
import { MatchingExecutionLog } from './components/MatchingExecutionLog'
import { BatchesNeedingReviewTable } from './components/BatchesNeedingReviewTable'
import { SignalClarityBar } from './components/SignalClarityBar'
import { ZordInsightsPanel } from '../shared/ZordInsightsPanel'
import { buildMatchReviewInsightItems } from '../insights/buildPageZordInsightItems'
import { useBatchSelectWithUrl } from '../hooks/useIntelligenceBatchUrlSync'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import { LiveDataHint } from '../shared'
import { intelligenceKpiScopeLabel } from '../shared/batchKpiScope'

const POLL_MS = 30_000

export function MatchingConfidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tenantReady } = useSessionTenant()

  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(() =>
    initialBatchId?.trim() || undefined,
  )
  const handleSelectBatch = useBatchSelectWithUrl('ambiguity', setSelectedBatchId)
  const signalClarityDateQuery = useMemo(() => {
    const fromDate = apiTrimmedString(searchParams.get('from_date'))
    const toDate = apiTrimmedString(searchParams.get('to_date'))
    return fromDate || toDate ? { from_date: fromDate, to_date: toDate } : undefined
  }, [searchParams])

  // Endpoint split: ambiguity feeds Match Review insights/KPIs; leakage feeds Payment Signal Clarity.
  const [ambiguity, setAmbiguity] = useState<AmbiguityKpiResponse | null>(null)
  const [signalClarityLeakage, setSignalClarityLeakage] = useState<LeakageKpiResponse | null>(null)
  const [kpiLoading, setKpiLoading] = useState(false)
  const [signalClarityLoading, setSignalClarityLoading] = useState(false)
  const cancelledRef = useRef(false)
  const signalClarityCancelledRef = useRef(false)
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
  const refreshSignalClarityLeakage = useCallback(async () => {
    if (!tenantReady) return
    setSignalClarityLoading(true)
    try {
      const lk = await getLeakageKpis(signalClarityDateQuery)
      if (!signalClarityCancelledRef.current) setSignalClarityLeakage(lk)
    } finally {
      if (!signalClarityCancelledRef.current) setSignalClarityLoading(false)
    }
  }, [tenantReady, signalClarityDateQuery])

  useEffect(() => {
    cancelledRef.current = false
    if (!tenantReady) { setAmbiguity(null); return }
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => { cancelledRef.current = true; window.clearInterval(id) }
  }, [tenantReady, refresh])
  useEffect(() => {
    signalClarityCancelledRef.current = false
    if (!tenantReady) { setSignalClarityLeakage(null); return }
    void refreshSignalClarityLeakage()
    const id = window.setInterval(() => void refreshSignalClarityLeakage(), POLL_MS)
    return () => { signalClarityCancelledRef.current = true; window.clearInterval(id) }
  }, [tenantReady, refreshSignalClarityLeakage])
  const {
    heatmap: matchingHeatmap,
    loading: heatmapLoading,
    refresh: refreshHeatmap,
  } = useAmbiguityHeatmap(tenantReady)
  const amb = isDataAvailable(ambiguity) ? ambiguity : null
  const signalClarityData = isDataAvailable(signalClarityLeakage) ? signalClarityLeakage : null

  useEffect(() => {
    const pinned = initialBatchId?.trim()
    if (pinned) setSelectedBatchId(pinned)
  }, [initialBatchId])

  const [finalityFilter, setFinalityFilter] = useState<'' | FinalityStatus>('')
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [dataRefreshToken, setDataRefreshToken] = useState(0)

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
    setDataRefreshToken((token) => token + 1)
    router.refresh()
    await Promise.all([refresh(), refreshSignalClarityLeakage(), refreshHeatmap(), loadBatches()])
  }, [refresh, refreshSignalClarityLeakage, refreshHeatmap, loadBatches, router])


  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: kpiLoading || signalClarityLoading || heatmapLoading || batchesLoading,
  })

  const kpiScopeHint = intelligenceKpiScopeLabel(selectedBatchId)
  const stripLoading = kpiLoading && !amb
  const signalClarityBarLoading = signalClarityLoading && !signalClarityData
  const zordInsights = useMemo(
    () =>
      buildMatchReviewInsightItems({
        ambiguity: isDataAvailable(ambiguity) ? ambiguity : null,
      }),
    [ambiguity],
  )

  return (
    <div className="min-h-screen space-y-4 bg-[#f4f4f1] p-4 text-slate-900 sm:p-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={selectedBatchId ?? ''}
          onChange={(e) => handleSelectBatch(e.target.value || undefined)}
          className="h-9 appearance-none rounded-full border border-slate-200 bg-white pl-4 pr-8 text-[13px] font-medium text-slate-700 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          aria-label="Scope batch"
        >
          <option value="">All batches (tenant)</option>
          {batches.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.source_reference?.trim() || b.batch_id}
            </option>
          ))}
        </select>
      </div>

      <LiveDataHint isLive={Boolean(tenantReady && amb)} source="intelligence" />

      <MatchingConfidenceKpiStrip amb={amb} loading={stripLoading} scopeHint={kpiScopeHint} />

      <SignalClarityBar amb={amb} leakage={signalClarityData} loading={signalClarityBarLoading} />

      <MatchingExecutionLog
        amb={amb}
        heatmap={matchingHeatmap}
        heatmapLoading={heatmapLoading && !matchingHeatmap}
      />

      <AmbiguityVelocityChart
        amb={amb}
        batchId={selectedBatchId}
        selectedBatchId={selectedBatchId}
        onSelectBatch={handleSelectBatch}
        refreshToken={dataRefreshToken}
      />

      <BatchesNeedingReviewTable
        batches={batches}
        loading={batchesLoading}
        finalityFilter={finalityFilter}
        onFilterChange={setFinalityFilter}
        highlightedBatchId={selectedBatchId}
        onRowSelect={handleSelectBatch}
      />

            <ZordInsightsPanel
        insights={zordInsights}
        sourcePage="match-review"
        sectionTitle="Batches needing review"
        batchId={selectedBatchId}
      />
    </div>
  )
}
