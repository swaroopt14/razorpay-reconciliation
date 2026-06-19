'use client'

import { useEffect, useMemo, useState } from 'react'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { formatMinorInr } from '../../leakage-portfolio/utils/formatMinorInr'
import { batchReviewAmountMinor } from '../../leakage-portfolio/utils/batchReviewAmountMinor'

type ReviewWatchlistProps = {
  tenantReady: boolean
  batches?: IntelligenceBatchRow[]
  selectedBatchId?: string
  onSelectBatch?: (id: string) => void
}

export function ReviewWatchlist({
  tenantReady,
  batches: suppliedBatches,
  selectedBatchId,
  onSelectBatch,
}: ReviewWatchlistProps) {
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (suppliedBatches?.length) {
      setBatches(suppliedBatches)
      setLoading(false)
      return
    }
    if (!tenantReady) {
      setBatches([])
      return
    }
    let cancelled = false
    setLoading(true)
    void getIntelligenceBatches({ limit: 12 })
      .then((res) => {
        if (cancelled) return
        setBatches(res?.batches ?? [])
      })
      .catch(() => {
        if (!cancelled) setBatches([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [suppliedBatches, tenantReady])

  const filteredBatches = useMemo(() => {
    if (!searchQuery.trim()) return batches
    const q = searchQuery.toLowerCase().trim()
    return batches.filter((b) => b.batch_id.toLowerCase().includes(q))
  }, [batches, searchQuery])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-[14px] font-semibold text-slate-700">Watchlist</h2>
        
        <div className="relative w-full max-w-[240px]">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search batch ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200">
        {loading ? (
          <p className="text-[13px] text-slate-500">Loading batches…</p>
        ) : filteredBatches.length === 0 ? (
          <p className="text-[13px] text-slate-500">
            {searchQuery ? 'No batches match your search.' : 'No batches loaded for this tenant.'}
          </p>
        ) : (
          filteredBatches.map((b) => {
            const isSelected = b.batch_id === selectedBatchId
            return (
              <button
                key={b.batch_id}
                type="button"
                onClick={() => onSelectBatch?.(b.batch_id)}
                className={`group flex min-w-[180px] shrink-0 items-center justify-between rounded-full border px-4 py-2 text-left transition ${
                  isSelected
                    ? 'border-[#0f172a] bg-[#0f172a] text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className={`truncate font-mono text-[12px] font-semibold ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                  {b.batch_id.length > 12 ? `${b.batch_id.slice(0, 12)}…` : b.batch_id}
                </span>
                <span className={`ml-2 shrink-0 text-[11px] font-medium tabular-nums ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                  {formatMinorInr(batchReviewAmountMinor(b))}
                </span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
