'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clampZeroBasedPage } from '../../_lib/clampPage'
import type { FinalityStatus, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'
import { batchDisplayValue, batchMatchPct } from '../utils/ambiguityApiMappers'

const FINALITY_FILTERS: Array<{ value: '' | FinalityStatus; label: string }> = [
  { value: '', label: 'All batches' },
  { value: 'REQUIRES_REVIEW', label: 'Needs review' },
  { value: 'PARTIALLY_SETTLED', label: 'Partially settled' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SETTLED', label: 'Settled' },
]

const PAGE_SIZE = 6

function statusMeta(status: string): { dot: string; label: string; badge: string } {
  switch (status) {
    case 'SETTLED':
      return { dot: 'bg-black', label: 'Active', badge: 'bg-black text-white' }
    case 'REQUIRES_REVIEW':
      return { dot: 'bg-amber-500', label: 'Review', badge: 'bg-amber-50 text-amber-700' }
    case 'PARTIALLY_SETTLED':
      return { dot: 'bg-orange-400', label: 'Low Conf', badge: 'bg-orange-50 text-orange-700' }
    default:
      return { dot: 'bg-red-500', label: 'Critical', badge: 'bg-red-50 text-red-700' }
  }
}

function statusLabel(b: IntelligenceBatchRow, fallback: string): string {
  return b.status_label?.trim() || fallback
}

type Props = {
  batches: IntelligenceBatchRow[]
  loading: boolean
  finalityFilter: '' | FinalityStatus
  onFilterChange: (v: '' | FinalityStatus) => void
}

export function BatchesNeedingReviewTable({ batches, loading, finalityFilter, onFilterChange }: Props) {
  const pathname = usePathname()
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(batches.length / PAGE_SIZE))
  const visible = batches.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => {
    setPage((p) => clampZeroBasedPage(p, totalPages))
  }, [totalPages])

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-black" />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#000000]">
            Batch Performance
          </span>
          <span
            className="rounded-full bg-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          >
            Live Tracking
          </span>
        </div>
        <select
          value={finalityFilter}
          onChange={(e) => { onFilterChange(e.target.value as '' | FinalityStatus); setPage(0) }}
          className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12px] font-medium text-slate-700 focus:border-black focus:outline-none appearance-none"
        >
          {FINALITY_FILTERS.map((f) => (
            <option key={f.label} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 flex-1 overflow-x-auto">
        <table className="w-full min-w-[500px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="pb-2.5 pr-3">Batch ID</th>
              <th className="pb-2.5 pr-3">Status</th>
              <th className="pb-2.5 pr-3 text-right">Match %</th>
              <th className="pb-2.5 pr-3 text-right">Value</th>
              <th className="pb-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td colSpan={5} className="py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[13px] text-slate-400">
                  {ambiguityCopy.batches.empty}
                </td>
              </tr>
            ) : (
              visible.map((b) => {
                const pct = batchMatchPct(b)
                const s = statusMeta(b.finality_status)
                const shortId = b.batch_id.length > 16 ? `${b.batch_id.slice(0, 16)}…` : b.batch_id
                return (
                  <tr key={b.batch_id} className="border-b border-slate-50 transition hover:bg-slate-50">
                    <td className="py-3 pr-3 font-mono text-[12px] font-medium text-slate-900">
                      {shortId}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        {statusLabel(b, s.label)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <span className="tabular-nums text-[13px] font-semibold text-slate-900">
                        {pct != null ? `${pct}%` : '—'}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <span className="tabular-nums text-[13px] text-slate-600">{batchDisplayValue(b)}</span>
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`${pathname}?dock=grid&batch_id=${encodeURIComponent(b.batch_id)}`}
                        className="inline-flex rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-700"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-[12px] text-slate-400">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => setPage((p) => p + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </article>
  )
}
