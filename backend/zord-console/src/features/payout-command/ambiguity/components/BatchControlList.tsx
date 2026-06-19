'use client'

import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { batchDisplayValue, batchMatchPct, criticalAlertCount } from '../utils/ambiguityApiMappers'

type BatchControlListProps = {
  batches: IntelligenceBatchRow[]
}

export function BatchControlList({ batches }: BatchControlListProps) {
  const shown = batches.slice(0, 4)

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-[#000000]">
          Batch Control
        </span>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
          aria-label="Add"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 4v12M4 10h12" />
          </svg>
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {shown.length === 0 ? (
          <p className="text-[13px] font-medium text-[#00239C]">No batches loaded.</p>
        ) : (
          shown.map((b) => {
            const pct = batchMatchPct(b)
            const shortId = b.batch_id.length > 14 ? `${b.batch_id.slice(0, 14)}…` : b.batch_id
            const value = batchDisplayValue(b)
            return (
              <div key={b.batch_id}>
                <div className="flex items-center justify-between">
                  <span className="truncate font-mono text-[13px] font-semibold text-slate-900">
                    {shortId}
                  </span>
                  <span className="ml-2 tabular-nums text-[13px] text-slate-500">{value}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-black transition-all duration-700"
                    style={{ width: `${pct ?? 0}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </article>
  )
}

type DataQualityAuditCardProps = {
  amb: AmbiguityKpiResolved | null
}

export function DataQualityAuditCard({ amb }: DataQualityAuditCardProps) {
  const count = criticalAlertCount(amb)

  return (
    <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 shadow-sm">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-200">
        <svg className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      </div>
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-[#000000]">Data Quality Audit</p>
        <p className="text-[11px] font-medium text-[#00239C]">
          {count != null ? `${count} Critical Alerts Pending` : '—'}
        </p>
      </div>
    </article>
  )
}
