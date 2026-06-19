'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { useAmbiguityHeatmap } from '@/services/payout-command/prod-api/useAmbiguityHeatmap'
import { batchHealthToAmbiguityKpis } from '@/services/payout-command/prod-api/mapBatchHealthKpis'
import { useIntelligenceBatchHealth } from '@/services/payout-command/prod-api/useIntelligenceBatchHealth'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type {
  AmbiguityKpiResolved,
  FinalityStatus,
  IntelligenceBatchRow,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { MatchingConfidenceKpiStrip } from './components/MatchingConfidenceKpiStrip'
import { TopReasonsForReview } from './components/TopReasonsForReview'
import { AmbiguityVelocityChart } from './components/AmbiguityVelocityChart'
import { MatchingExecutionLog } from './components/MatchingExecutionLog'
import { BatchesNeedingReviewTable } from './components/BatchesNeedingReviewTable'
import { AmbiguityMixDonut } from './components/AmbiguityMixDonut'
import { BatchControlList, DataQualityAuditCard } from './components/BatchControlList'
import { useBatchSelectWithUrl } from '../hooks/useIntelligenceBatchUrlSync'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import { LiveDataHint } from '../shared'
import { intelligenceKpiScopeLabel } from '../shared/batchKpiScope'

export function MatchingConfidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const pathname = usePathname()
  const { tenantReady } = useSessionTenant()

  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(() =>
    initialBatchId?.trim() || undefined,
  )
  const handleSelectBatch = useBatchSelectWithUrl('ambiguity', setSelectedBatchId)
  const { ambiguity, loading: kpiLoading, refresh } = useIntelligenceKpis({
    tenantReady,
    batchId: selectedBatchId,
  })
  const {
    heatmap: matchingHeatmap,
    loading: heatmapLoading,
    refresh: refreshHeatmap,
  } = useAmbiguityHeatmap(tenantReady)
  const amb = isDataAvailable(ambiguity) ? ambiguity : null

  const { batchHealth, loading: batchHealthLoading } = useIntelligenceBatchHealth(
    tenantReady,
    selectedBatchId,
  )

  useEffect(() => {
    const pinned = initialBatchId?.trim()
    if (pinned) setSelectedBatchId(pinned)
  }, [initialBatchId])

  const effectiveAmb = useMemo((): AmbiguityKpiResolved | null => {
    if (amb) {
      if (batchHealth && selectedBatchId) {
        const kpis = batchHealthToAmbiguityKpis(batchHealth)
        return {
          ...amb,
          ambiguous_intent_count: kpis.ambiguous_intent_count,
          ambiguity_rate: kpis.ambiguity_rate,
          provider_ref_missing_rate: kpis.provider_ref_missing_rate,
        }
      }
      return amb
    }
    if (selectedBatchId && batchHealth) {
      const kpis = batchHealthToAmbiguityKpis(batchHealth)
      return {
        data_available: true,
        tenant_id: '',
        ambiguous_intent_count: kpis.ambiguous_intent_count,
        ambiguity_rate: kpis.ambiguity_rate,
        provider_ref_missing_rate: kpis.provider_ref_missing_rate,
        value_at_risk_minor: '',
        avg_attachment_confidence: 0,
        risk_tier: 'LOW',
      } as AmbiguityKpiResolved
    }
    return null
  }, [amb, batchHealth, selectedBatchId])

  const handlePageRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshHeatmap()])
  }, [refresh, refreshHeatmap])

  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: kpiLoading || heatmapLoading || batchHealthLoading,
  })

  const kpiScopeHint = intelligenceKpiScopeLabel(selectedBatchId)

  const stripLoading = kpiLoading && !effectiveAmb

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

  return (
    <div className="min-h-screen space-y-4 bg-[#f4f4f1] p-4 text-slate-900 sm:p-6">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[1.25rem] font-bold tracking-tight text-[#000000]">
              Ambiguity &amp; Match Review
            </h1>
            <Link
              href={`${pathname}?dock=leakage`}
              className="text-[13px] font-medium text-[#00239C] underline decoration-[#00239C]/30 underline-offset-2 hover:text-[#103a9e]"
            >
              ← Payment Gaps
            </Link>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] font-medium leading-relaxed text-[#00239C]">
            See where Zord cannot confidently connect payment instructions to bank, PSP, or settlement outcomes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Batch selector */}
          <div className="relative">
            <select
              value={selectedBatchId ?? ''}
              onChange={(e) => handleSelectBatch(e.target.value || undefined)}
              className="h-9 appearance-none rounded-full border border-slate-200 bg-white pl-4 pr-8 text-[13px] font-medium text-slate-700 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="">All Batches (Tenant)</option>
              {batches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.batch_id.length > 18 ? `${b.batch_id.slice(0, 18)}…` : b.batch_id}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              fill="none" viewBox="0 0 20 20" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8l4 4 4-4" />
            </svg>
          </div>

          {/* Search icon */}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
            aria-label="Search"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => {
              void refresh()
              void refreshHeatmap()
            }}
            disabled={kpiLoading || heatmapLoading}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            aria-label="Refresh"
          >
            <svg
              className={`h-4 w-4 ${kpiLoading ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 20 20"
            >
              <path d="M16 6.5V3.8l-2.6 2.3A6.2 6.2 0 1 0 16 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Profile circle */}
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-[13px] font-bold text-slate-600 shadow-sm hover:bg-slate-300">
            Z
          </button>
        </div>
      </header>

      <LiveDataHint
        isLive={Boolean(tenantReady && (effectiveAmb || amb))}
        source="intelligence"
      />

      {/* ── Row 1+2: KPIs & Velocity (left) + Zord Intelligence & Heatmap (right) */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">

        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* KPI cards strip */}
          <MatchingConfidenceKpiStrip
            amb={effectiveAmb}
            loading={stripLoading}
            scopeHint={kpiScopeHint}
          />

          {/* Ambiguity Velocity chart */}
          <AmbiguityVelocityChart amb={effectiveAmb ?? amb} batchId={selectedBatchId} />
        </div>

        {/* Right column: Zord Intelligence + Heatmap */}
        <div className="flex flex-col gap-4">
          <TopReasonsForReview amb={amb} />
          <MatchingExecutionLog
            amb={amb}
            heatmap={matchingHeatmap}
            heatmapLoading={heatmapLoading && !matchingHeatmap}
          />
        </div>
      </div>

      {/* ── Row 3: Batch table + Donut + Control list ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">

        {/* Batch Performance Table */}
        <BatchesNeedingReviewTable
          batches={batches}
          loading={batchesLoading}
          finalityFilter={finalityFilter}
          onFilterChange={setFinalityFilter}
        />

        {/* Ambiguity Mix Donut */}
        <AmbiguityMixDonut amb={amb} />

        {/* Batch Control + Data Quality Audit */}
        <div className="flex flex-col gap-4">
          <BatchControlList batches={batches} />
          <DataQualityAuditCard amb={amb} />
        </div>
      </div>
    </div>
  )
}
