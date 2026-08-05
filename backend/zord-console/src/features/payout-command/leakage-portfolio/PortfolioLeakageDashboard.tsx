'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getIntelligenceBatches, getLeakageKpis } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { LiveDataHint } from '../shared'
import { LeakageKpiStrip } from '../leakage/components/LeakageKpiStrip'
import { LeakageBatchWatchlistTable } from '../leakage/components/LeakageBatchWatchlistTable'
import { usePortfolioLeakageData } from './hooks/usePortfolioLeakageData'
import { PortfolioHeader } from './components/PortfolioHeader'
import { RiskAdjustedLeakageCard } from './components/RiskAdjustedLeakageCard'
import { BatchScoreHealthCard } from './components/BatchScoreHealthCard'
import { LeakageZordInsightsCard } from './components/LeakageZordInsightsCard'
import { LeakageWidgetChrome } from './components/LeakageWidgetChrome'
import {
  type LeakageFilterValues,
  LeakageFiltersForm,
} from './components/LeakageFiltersForm'
import {
  DEFAULT_LEAKAGE_WIDGET_ORDER,
  hiddenLeakageWidgetIds,
  loadLeakageWidgetLayout,
  restoreHiddenLeakageWidgets,
  saveLeakageWidgetLayout,
  type LeakageWidgetId,
} from './leakageWidgetLayout'
import { useBatchSelectWithUrl } from '../hooks/useIntelligenceBatchUrlSync'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'

type PortfolioLeakageDashboardProps = {
  tenantReady: boolean
  initialBatchId?: string
}

export function PortfolioLeakageDashboard({ tenantReady, initialBatchId }: PortfolioLeakageDashboardProps) {
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(() =>
    initialBatchId?.trim() || undefined,
  )
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [leakagePctCache, setLeakagePctCache] = useState<Record<string, number>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<LeakageFilterValues>({
    status: '',
    fromDate: '',
    toDate: '',
    batchId: '',
  })
  const [widgetOrder, setWidgetOrder] = useState<LeakageWidgetId[]>(DEFAULT_LEAKAGE_WIDGET_ORDER)
  const handleSelectBatch = useBatchSelectWithUrl('leakage', setSelectedBatchId)

  const scopedBatchId = filters.batchId.trim() || selectedBatchId

  const { viewModel, leak, ambiguity, patterns, patternsLoading, patternsEmptyReason, loading, refresh } =
    usePortfolioLeakageData(tenantReady, scopedBatchId)

  const displayData = viewModel
  const kpiLoading = loading && !displayData
  const showLiveHint = Boolean(displayData)

  useEffect(() => {
    setWidgetOrder(loadLeakageWidgetLayout())
  }, [])

  const loadBatches = useCallback(async () => {
    if (!tenantReady) {
      setBatches([])
      return
    }
    const res = await getIntelligenceBatches({
      limit: 20,
      status: filters.status || undefined,
    })
    const rows = res?.batches ?? []
    setBatches(rows)

    // Fetch leakage_percentage for all batches in parallel
    if (rows.length > 0) {
      const results = await Promise.allSettled(
        rows.map((b) => getLeakageKpis(undefined, b.batch_id)),
      )
      const cache: Record<string, number> = {}
      for (let i = 0; i < rows.length; i++) {
        const result = results[i]
        if (result?.status !== 'fulfilled' || !result.value) continue
        if (isDataAvailable(result.value) && result.value.leakage_percentage != null) {
          cache[rows[i]!.batch_id] = result.value.leakage_percentage
        }
      }
      setLeakagePctCache((prev) => ({ ...prev, ...cache }))
    }
  }, [tenantReady, filters.status])

  const handlePageRefresh = useCallback(async () => {
    await refresh()
    await loadBatches()
  }, [refresh, loadBatches])

  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: loading,
  })

  useEffect(() => {
    const pinned = initialBatchId?.trim()
    if (pinned) setSelectedBatchId(pinned)
  }, [initialBatchId])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const hiddenWidgetCount = hiddenLeakageWidgetIds(widgetOrder).length

  const restoreHiddenWidgets = useCallback(() => {
    setWidgetOrder((order) => {
      const next = restoreHiddenLeakageWidgets(order)
      saveLeakageWidgetLayout(next)
      return next
    })
  }, [])

  const widgetNodes = useMemo(
    () => ({
      kpiHero: displayData ? (
        <LeakageWidgetChrome widgetId="kpiHero">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <LeakageKpiStrip data={displayData} loading={kpiLoading} />
            </div>
            <div className="lg:col-span-2">
              <RiskAdjustedLeakageCard data={displayData} loading={kpiLoading} batchId={scopedBatchId} />
            </div>
          </div>
        </LeakageWidgetChrome>
      ) : null,
      trendChart: displayData ? (
        <LeakageWidgetChrome widgetId="trendChart">
          <RiskAdjustedLeakageCard data={displayData} loading={kpiLoading} batchId={scopedBatchId} />
        </LeakageWidgetChrome>
      ) : null,
      watchlistTable: (
        <LeakageWidgetChrome widgetId="watchlistTable">
          <LeakageBatchWatchlistTable
            batches={batches}
            loading={loading && batches.length === 0}
            selectedBatchId={selectedBatchId}
            onSelectBatch={handleSelectBatch}
            leakagePctCache={leakagePctCache}
          />
        </LeakageWidgetChrome>
      ),
      batchScoreHealth: (
        <LeakageWidgetChrome widgetId="batchScoreHealth">
          <BatchScoreHealthCard
            patterns={patterns}
            loading={patternsLoading}
            batchId={scopedBatchId}
            emptyReason={patternsEmptyReason}
          />
        </LeakageWidgetChrome>
      ),
      zordInsight: displayData ? (
        <LeakageWidgetChrome widgetId="zordInsight">
          <LeakageZordInsightsCard leakage={leak} ambiguity={ambiguity} />
        </LeakageWidgetChrome>
      ) : null,
    }),
    [
      displayData,
      scopedBatchId,
      kpiLoading,
      batches,
      loading,
      selectedBatchId,
      handleSelectBatch,
      leakagePctCache,
      leak,
      patterns,
      patternsLoading,
      patternsEmptyReason,
      ambiguity,
    ],
  )

  return (
    <div className="min-h-screen space-y-6 rounded-2xl bg-[#f4f4f1] p-4 sm:p-6">
      <div className="relative">
        <PortfolioHeader
          batches={batches}
          selectedBatchId={selectedBatchId}
          onSelectBatch={handleSelectBatch}
          hiddenWidgetCount={hiddenWidgetCount}
          onRestoreHiddenWidgets={restoreHiddenWidgets}
        />
        <LeakageFiltersForm
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          value={filters}
          onApply={(next) => {
            setFilters(next)
            if (next.batchId.trim()) setSelectedBatchId(next.batchId.trim())
          }}
        />
      </div>
      <LiveDataHint isLive={showLiveHint} source="intelligence" />

      {!tenantReady ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-[14px] text-slate-500 shadow-sm">
          Sign in to load payment gap intelligence for your workspace.
        </p>
      ) : (
        <div className="space-y-4">
          {!displayData ? (
            <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-[14px] text-slate-500 shadow-sm">
              {selectedBatchId
                ? loading
                  ? 'Loading batch payment gap data…'
                  : 'No leakage data for this batch yet.'
                : 'No workspace-wide leakage snapshot yet. Select a batch or wait for intelligence projections.'}
            </p>
          ) : null}
          {widgetOrder.map((id) => {
            const node = widgetNodes[id]
            if (!node) return null
            if (id === 'batchScoreHealth' || id === 'zordInsight') {
              return null
            }
            return <div key={id}>{node}</div>
          })}
          <div className="grid gap-4 lg:grid-cols-2">
            {widgetOrder.includes('batchScoreHealth') ? (
              <div>{widgetNodes.batchScoreHealth}</div>
            ) : null}
            {widgetOrder.includes('zordInsight') ? <div>{widgetNodes.zordInsight}</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}
