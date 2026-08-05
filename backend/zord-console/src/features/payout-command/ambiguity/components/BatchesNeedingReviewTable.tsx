'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { clampZeroBasedPage } from '../../_lib/clampPage'
import type { FinalityStatus, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'
import { batchDisplayValue, batchMatchPctDisplay } from '../utils/ambiguityApiMappers'
import { Glyph } from '../../shared'
import { HOME_TITLE_BLACK } from '../../command-center/homeCommandCenterTokens'
import { displayApiField } from '../../shared/formatApiKpiFields'

const FINALITY_FILTERS: Array<{ value: '' | FinalityStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'REQUIRES_REVIEW', label: 'Needs review' },
  { value: 'PARTIALLY_SETTLED', label: 'Partial' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SETTLED', label: 'Settled' },
]

// Human-readable labels for raw API finality_status enum values.
const FINALITY_DISPLAY: Record<string, string> = {
  REQUIRES_REVIEW: 'Needs review',
  PARTIALLY_SETTLED: 'Partial',
  FAILED: 'Failed',
  PENDING: 'Pending',
  SETTLED: 'Settled',
  FULLY_SETTLED: 'Settled',
  PROCESSING: 'Processing',
}

const PAGE_SIZE = 10

function statusBadge(status: string): string {
  switch (status) {
    case 'SETTLED':
    case 'FULLY_SETTLED':
      return 'bg-slate-900 text-white'
    case 'REQUIRES_REVIEW':
      return 'bg-amber-50 text-amber-800'
    case 'PARTIALLY_SETTLED':
      return 'bg-orange-50 text-orange-800'
    default:
      return 'bg-red-50 text-red-700'
  }
}

function batchStatus(b: IntelligenceBatchRow): string | undefined {
  return b.batch_finality_status
}

type Props = {
  batches: IntelligenceBatchRow[]
  loading: boolean
  finalityFilter: '' | FinalityStatus
  onFilterChange: (v: '' | FinalityStatus) => void
  highlightedBatchId?: string
  onRowSelect?: (batchId: string) => void
}

export function BatchesNeedingReviewTable({
  batches,
  loading,
  finalityFilter,
  onFilterChange,
  highlightedBatchId,
  onRowSelect,
}: Props) {
  const pathname = usePathname()
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return batches
    return batches.filter(
      (b) =>
        b.batch_id.toLowerCase().includes(q) ||
        (b.source_reference?.toLowerCase().includes(q) ?? false),
    )
  }, [batches, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => {
    setPage((p) => clampZeroBasedPage(p, totalPages))
  }, [totalPages])

  useEffect(() => {
    if (!highlightedBatchId) return
    const idx = filtered.findIndex((b) => b.batch_id === highlightedBatchId)
    if (idx < 0) return
    setPage(Math.floor(idx / PAGE_SIZE))
  }, [highlightedBatchId, filtered])

  return (
    <section
      className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="ambiguity-batch-queue"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>{ambiguityCopy.batches.title}</p>
          <p className="text-[12px] font-medium text-[#00239C]">
            Click a batch to scope Match Review and open the intent journal
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Glyph name="search" className="h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Search batch ID or provider"
            className={`w-52 border-0 bg-transparent text-[14px] font-medium outline-none placeholder:text-slate-400 ${HOME_TITLE_BLACK}`}
            aria-label="Search batch queue"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {FINALITY_FILTERS.map((f) => {
          const active = finalityFilter === f.value
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => {
                onFilterChange(f.value)
                setPage(0)
              }}
              className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition ${
                active
                  ? 'border-[#0f172a] bg-[#0f172a] text-white'
                  : `border-slate-300 bg-white ${HOME_TITLE_BLACK} hover:bg-slate-50`
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-slate-200">
        <table className="min-w-full border-collapse text-left text-[15px]">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-3 py-3 text-[14px] font-semibold text-[#00239C]">Batch</th>
              <th className="px-3 py-3 text-[14px] font-semibold text-[#00239C]">Status</th>
              <th className="px-3 py-3 text-right text-[14px] font-semibold text-[#00239C]">Match conf</th>
              <th className="px-3 py-3 text-right text-[14px] font-semibold text-[#00239C]">Value at risk</th>
              <th className="px-3 py-3 text-right text-[14px] font-semibold text-[#00239C]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-200">
                  <td colSpan={5} className="px-3 py-3">
                    <div className="h-4 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[14px] font-medium text-[#00239C]">
                  {query.trim() ? 'No batches match your search.' : ambiguityCopy.batches.empty}
                </td>
              </tr>
            ) : (
              visible.map((b) => {
                const highlighted = b.batch_id === highlightedBatchId
                const status = batchStatus(b)
                return (
                  <tr
                    key={b.batch_id}
                    id={`batch-row-${b.batch_id}`}
                    className={`cursor-pointer border-t border-slate-200 transition hover:bg-sky-50/50 ${
                      highlighted ? 'bg-sky-50/80' : ''
                    }`}
                    onClick={() => onRowSelect?.(b.batch_id)}
                  >
                    <td className="px-3 py-3">
                      <p className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
                        {b.source_reference?.trim() || b.batch_id}
                      </p>
                      <p className="font-mono text-[13px] font-medium text-[#00239C]">{b.batch_id}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${statusBadge(status ?? '')}`}
                      >
                        {status ? (FINALITY_DISPLAY[status] ?? displayApiField(status)) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-900">
                      {batchMatchPctDisplay(b)}
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-700">
                      {batchDisplayValue(b)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`${pathname}?dock=grid&batch_id=${encodeURIComponent(b.batch_id)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex rounded-lg bg-slate-900 px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-slate-700"
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

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-[13px] text-slate-500">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => setPage((p) => p + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </section>
  )
}
