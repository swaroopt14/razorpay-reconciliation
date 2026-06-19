'use client'

import { leakageCopy, mapReviewPriorityLabel, mapReviewPriorityShort } from '../../leakage/copy/leakageCopy'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'

type PortfolioHeaderProps = {
  onRefresh?: () => void
  refreshing?: boolean
  riskTier?: string
  batches?: IntelligenceBatchRow[]
  selectedBatchId?: string
  onSelectBatch?: (id: string | undefined) => void
}

export function PortfolioHeader({ onRefresh, refreshing, riskTier, batches = [], selectedBatchId, onSelectBatch }: PortfolioHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
      <div>
        <h1 className="text-[1.25rem] font-semibold tracking-tight text-slate-900 sm:text-[1.35rem]">
          {leakageCopy.pageTitle}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {riskTier ? (
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-1.5 shadow-sm">
            <div className="flex gap-1">
              <div className="h-3 w-1 rounded-full bg-amber-500" />
              <div className="h-3 w-1 rounded-full bg-amber-500" />
              <div className="h-3 w-1 rounded-full bg-amber-500" />
              <div className="h-3 w-1 rounded-full bg-slate-200" />
              <div className="h-3 w-1 rounded-full bg-slate-200" />
            </div>
            <span className="text-[12px] font-semibold text-slate-700">
              {mapReviewPriorityShort(riskTier)}
            </span>
            <span className="text-[12px] text-slate-500">Risk Tier</span>
          </div>
        ) : null}
        
        <select
          value={selectedBatchId || ''}
          onChange={(e) => onSelectBatch?.(e.target.value || undefined)}
          className="h-9 appearance-none rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
        >
          <option value="">All Batches (Tenant)</option>
          {batches.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.batch_id.length > 15 ? `${b.batch_id.slice(0, 15)}…` : b.batch_id}
            </option>
          ))}
        </select>

        <HeaderActions onRefresh={onRefresh} refreshing={refreshing} />
      </div>
    </header>
  )
}

function HeaderActions({ onRefresh, refreshing }: { onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        aria-label="Filters"
      >
        Filters
        <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        aria-label="Refresh data"
      >
        <svg
          className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M16 6.5V3.8l-2.6 2.3A6.2 6.2 0 1 0 16 10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
        aria-label="Expand view"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M6 14 14 6M8 6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
