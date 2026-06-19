'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  getDefensibilityKpis,
  getIntelligenceBatches,
} from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type {
  DefensibilityKpiResolved,
  IntelligenceBatchRow,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { stubIntelligenceBatchRow } from '@/services/payout-command/prod-api/evidenceBatchScope'
import {
  getEvidenceBatchIdsForSession,
  listEvidencePacksForBatch,
  listEvidencePacksForFirstBatchWithData,
} from '@/services/payout-command/prod-api/listEvidencePacksForBatch'
import { useIntelligenceBatchHealth } from '@/services/payout-command/prod-api/useIntelligenceBatchHealth'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { EvidencePageTabs } from './components/EvidencePageTabs'
import { EvidenceHeroBanner } from './components/EvidenceHeroBanner'
import { EvidenceKpiStrip } from './components/EvidenceKpiStrip'
import { ProofBreakdownSection } from './components/ProofBreakdownSection'
import { EvidencePackBrowser } from './components/EvidencePackBrowser'
import { DisputeResolverPanel } from './components/DisputeResolverPanel'
import { EvidenceQuickActions } from './components/EvidenceQuickActions'
import { EvidencePackBreakdownChart } from './components/EvidencePackBreakdownChart'
import { EvidencePackTrendChart } from './components/EvidencePackTrendChart'
import { mapPackTableRow } from './mappers/mapPackTableRow'
import { deriveEvidenceKpis } from './selectors/deriveEvidenceKpis'
import { deriveProofBreakdown } from './selectors/deriveProofBreakdown'
import { deriveEvidenceAnalytics } from './selectors/deriveEvidenceAnalytics'
import type { EvidencePageTab } from './types/evidenceViewModels'

/** Prefer batches like 1234 over 123 when both exist in the journal list. */
function sortBatchPickerRows(rows: IntelligenceBatchRow[]): IntelligenceBatchRow[] {
  return [...rows].sort((a, b) =>
    b.batch_id.localeCompare(a.batch_id, undefined, { numeric: true, sensitivity: 'base' }),
  )
}

/**
 * APIs (3 on workspace load):
 * 1. GET /api/prod/intelligence/defensibility
 * 2. GET /api/prod/intelligence/batches
 * 3. GET /api/prod/evidence/packs (+ intent journal for full batch list)
 * Export tab: GET /api/prod/evidence/packs/{packId} on demand
 */
export function EvidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const [pageTab, setPageTab] = useState<EvidencePageTab>('workspace')
  const [search, setSearch] = useState('')
  const [batchId, setBatchId] = useState<string>(() => apiTrimmedString(initialBatchId))
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [packSummaries, setPackSummaries] = useState<EvidencePackSummaryRow[]>([])
  const [packListError, setPackListError] = useState<string | null>(null)
  const [packsLoading, setPacksLoading] = useState(false)
  const [defensibility, setDefensibility] = useState<DefensibilityKpiResolved | null>(null)
  const [kpisLoading, setKpisLoading] = useState(false)
  const autoBatchFallbackPending = useRef(!apiTrimmedString(initialBatchId))

  const { tenantReady } = useSessionTenant()
  const { batchHealth } = useIntelligenceBatchHealth(tenantReady, batchId || undefined)

  useEffect(() => {
    const fromUrl = apiTrimmedString(initialBatchId)
    if (fromUrl) setBatchId(fromUrl)
  }, [initialBatchId])

  useEffect(() => {
    if (!tenantReady) {
      setBatches([])
      if (!apiTrimmedString(initialBatchId)) setBatchId('')
      return
    }
    let cancelled = false
    void Promise.all([getIntelligenceBatches({ limit: 80 }), getEvidenceBatchIdsForSession()]).then(
      ([res, journalBatchIds]) => {
        if (cancelled) return
        const intelList = res?.batches ?? []
        const seen = new Set<string>()
        const merged: IntelligenceBatchRow[] = []
        for (const id of journalBatchIds) {
          if (!id || seen.has(id)) continue
          seen.add(id)
          merged.push(stubIntelligenceBatchRow(id, apiTrimmedString(res?.tenant_id)))
        }
        for (const row of intelList) {
          const id = apiTrimmedString(row.batch_id)
          if (!id || seen.has(id)) continue
          seen.add(id)
          merged.push(row)
        }
        const sorted = sortBatchPickerRows(merged)
        setBatches(sorted)
        setBatchId((prev) => {
          const pinned = apiTrimmedString(prev) || apiTrimmedString(initialBatchId)
          if (pinned && sorted.some((b) => b.batch_id === pinned)) return pinned
          return sorted[0]?.batch_id ?? ''
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [tenantReady, initialBatchId])

  useEffect(() => {
    if (!tenantReady) {
      setDefensibility(null)
      return
    }
    let cancelled = false
    setKpisLoading(true)
    void getDefensibilityKpis().then((def) => {
      if (cancelled) return
      setDefensibility(isDataAvailable(def) ? def : null)
      setKpisLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tenantReady])

  useEffect(() => {
    const bid = apiTrimmedString(batchId)
    if (!tenantReady || !bid) {
      setPackSummaries([])
      setPackListError(null)
      setPacksLoading(false)
      return
    }
    let cancelled = false
    setPacksLoading(true)
    setPackListError(null)
    void (async () => {
      try {
        let { packs, errors } = await listEvidencePacksForBatch(bid)
        if (cancelled) return

        if (
          !packs.length &&
          autoBatchFallbackPending.current &&
          batches.length > 1 &&
          !apiTrimmedString(initialBatchId)
        ) {
          autoBatchFallbackPending.current = false
          const fallback = await listEvidencePacksForFirstBatchWithData(batches.map((b) => b.batch_id))
          if (cancelled) return
          if (fallback.resolvedBatchId && fallback.packs.length > 0) {
            setBatchId(fallback.resolvedBatchId)
            setPackListError(null)
            setPackSummaries(fallback.packs)
            setPacksLoading(false)
            return
          }
          if (fallback.errors.length) errors = [...errors, ...fallback.errors]
        } else {
          autoBatchFallbackPending.current = false
        }

        if (!packs.length) {
          const detail = errors.length ? errors.join(' · ') : 'All three evidence list calls returned empty.'
          setPackListError(
            `No evidence packs for batch ${bid}. APIs hit: GET /api/prod/evidence/packs?client_batch_id=…, GET /api/prod/evidence/batch/${bid}/intents, GET /api/prod/evidence/batch/${bid}/lineage-graph. ${detail}`,
          )
          setPackSummaries([])
        } else {
          setPackListError(null)
          setPackSummaries(packs)
        }
        setPacksLoading(false)
      } catch (error: unknown) {
        if (cancelled) return
        autoBatchFallbackPending.current = false
        setPackListError(error instanceof Error ? error.message : `Evidence pack list failed for batch ${bid}.`)
        setPackSummaries([])
        setPacksLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenantReady, batchId, batches, initialBatchId])

  const packRows = useMemo(
    () =>
      packSummaries.map((summary) => ({
        summary,
        itemCount: summary.leaf_count ?? summary.artifact_count ?? undefined,
      })),
    [packSummaries],
  )

  const tableRows = useMemo(
    () =>
      packRows.map((row) =>
        mapPackTableRow(row.summary, row.itemCount, defensibility?.defensibility_score ?? null),
      ),
    [packRows, defensibility],
  )

  const intentPackCount = useMemo(
    () => tableRows.filter((row) => row.scope === 'intent').length,
    [tableRows],
  )

  const batchBrowserRow = useMemo(
    () => tableRows.find((row) => row.scope === 'batch') ?? null,
    [tableRows],
  )

  const batchPackId = batchBrowserRow?.packId

  const kpiCards = useMemo(
    () => deriveEvidenceKpis({ defensibility, packRows, batchHealth, batchId }),
    [defensibility, packRows, batchHealth, batchId],
  )

  const breakdownRows = useMemo(
    () =>
      deriveProofBreakdown({
        defensibility,
        patterns: null,
        packCount: packRows.length,
      }),
    [defensibility, packRows.length],
  )

  const analytics = useMemo(() => deriveEvidenceAnalytics(tableRows), [tableRows])
  const batchOptions = useMemo(() => batches.map((b) => ({ batch_id: b.batch_id })), [batches])

  const dataLoading = packsLoading || kpisLoading

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <EvidencePageTabs active={pageTab} onChange={setPageTab} />
      </div>

      {!tenantReady ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-[14px] font-medium text-slate-500 shadow-sm">
          Sign in to load evidence for your workspace.
        </p>
      ) : (
        <>
          <EvidenceHeroBanner
            search={search}
            onSearchChange={setSearch}
            batchId={batchId}
            onBatchChange={setBatchId}
            batchOptions={batchOptions}
          />

          <EvidenceKpiStrip
            cards={kpiCards}
            loading={dataLoading}
            defensibilityTier={defensibility?.defensibility_tier}
          />

          <ProofBreakdownSection rows={breakdownRows} />

          <div className="grid gap-4 lg:grid-cols-2">
            <EvidencePackBreakdownChart
              segments={analytics.segments}
              mixArea={analytics.mixArea}
              mixSeries={analytics.mixSeries}
              preview={!analytics.hasLiveData}
            />
            <EvidencePackTrendChart trend={analytics.trend} preview={!analytics.hasLiveData} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5 min-w-0">
              <EvidencePackBrowser
                batchRow={batchBrowserRow}
                intentPackCount={intentPackCount}
                batchId={batchId}
                onBatchChange={setBatchId}
                batchOptions={batchOptions}
                intelBatches={batches}
                tenantReady={tenantReady}
                packsLoading={dataLoading}
                packListError={packListError}
              />
              <EvidenceQuickActions
                batchId={batchId}
                firstPackId={batchPackId}
              />
            </div>

            <DisputeResolverPanel packRows={tableRows} />
          </div>
        </>
      )}
    </div>
  )
}
