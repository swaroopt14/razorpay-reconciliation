'use client'

import { leakageCopy } from '../../leakage/copy/leakageCopy'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'

type PortfolioHeaderProps = {
  batches?: IntelligenceBatchRow[]
  selectedBatchId?: string
  onSelectBatch?: (id: string | undefined) => void
  hiddenWidgetCount?: number
  onRestoreHiddenWidgets?: () => void
}

export function PortfolioHeader({
  batches = [],
  selectedBatchId,
  onSelectBatch,
  hiddenWidgetCount = 0,
  onRestoreHiddenWidgets,
}: PortfolioHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
      <h1 className="text-[1.25rem] font-semibold tracking-tight text-slate-900 sm:text-[1.35rem]">
        {leakageCopy.pageTitle}
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        {hiddenWidgetCount > 0 && onRestoreHiddenWidgets ? (
          <button
            type="button"
            onClick={onRestoreHiddenWidgets}
            className="h-9 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            data-testid="restore-hidden-widgets"
          >
            Restore hidden widgets ({hiddenWidgetCount})
          </button>
        ) : null}
        <select
          value={selectedBatchId || ''}
          onChange={(e) => onSelectBatch?.(e.target.value || undefined)}
          className="h-9 appearance-none rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
          aria-label="Scope batch"
        >
          <option value="">All Batches (Tenant)</option>
          {batches.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.batch_id.length > 15 ? `${b.batch_id.slice(0, 15)}…` : b.batch_id}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
}
