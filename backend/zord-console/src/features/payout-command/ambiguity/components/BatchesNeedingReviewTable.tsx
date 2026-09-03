'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { clampZeroBasedPage } from '../../_lib/clampPage'
import type { FinalityStatus, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'
import { batchDisplayValue, batchMatchPctDisplay } from '../utils/ambiguityApiMappers'
import { displayApiField } from '../../shared/formatApiKpiFields'

const FINALITY_FILTERS: Array<{ value: '' | FinalityStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'REQUIRES_REVIEW', label: 'Needs review' },
  { value: 'PARTIALLY_SETTLED', label: 'Partial' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SETTLED', label: 'Settled' },
]

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

function statusBadge(_status: string): string {
  return 'border-[#0B1324] bg-[#0B1324] text-white'
}

function batchStatus(batch: IntelligenceBatchRow): string | undefined {
  return batch.batch_finality_status
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
      (batch) =>
        batch.batch_id.toLowerCase().includes(q) ||
        (batch.source_reference?.toLowerCase().includes(q) ?? false),
    )
  }, [batches, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => {
    setPage((current) => clampZeroBasedPage(current, totalPages))
  }, [totalPages])

  useEffect(() => {
    if (!highlightedBatchId) return
    const idx = filtered.findIndex((batch) => batch.batch_id === highlightedBatchId)
    if (idx < 0) return
    setPage(Math.floor(idx / PAGE_SIZE))
  }, [highlightedBatchId, filtered])

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
      data-testid="ambiguity-batch-queue"
    >
      <div className="bg-slate-950 p-4 text-white sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-white/45">Review queue</p>
            <h3 className="mt-1 text-[1.35rem] font-semibold leading-tight">{ambiguityCopy.batches.title}</h3>
            <p className="mt-1 text-[13px] font-medium text-white/55">
              Select a batch to scope the live ambiguity workspace.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase text-white/40">Rows returned</p>
            <p className="mt-1 text-[1.6rem] font-semibold leading-none tabular-nums">{batches.length}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FINALITY_FILTERS.map((filter) => {
              const active = finalityFilter === filter.value
              return (
                <button
                  key={filter.label}
                  type="button"
                  onClick={() => {
                    onFilterChange(filter.value)
                    setPage(0)
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                    active
                      ? 'border-white bg-white text-slate-950'
                      : 'border-white/10 bg-white/5 text-white/65 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>

          <label className="relative inline-flex min-w-[250px] items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-white/35" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(0)
              }}
              placeholder="Search batch or provider"
              className="h-10 w-full rounded-full border border-white/10 bg-white/5 pl-9 pr-3 text-[13px] font-semibold text-white outline-none placeholder:text-white/35 focus:border-white/40"
              aria-label="Search batch queue"
            />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto p-3 sm:p-4">
        <table className="min-w-[880px] w-full border-separate border-spacing-y-2 text-left">
          <thead>
            <tr>
              <th className="px-3 text-[11px] font-bold uppercase text-slate-400">Batch</th>
              <th className="px-3 text-[11px] font-bold uppercase text-slate-400">Status</th>
              <th className="px-3 text-right text-[11px] font-bold uppercase text-slate-400">Match conf</th>
              <th className="px-3 text-right text-[11px] font-bold uppercase text-slate-400">Value at risk</th>
              <th className="px-3 text-right text-[11px] font-bold uppercase text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}>
                  <td colSpan={5} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="h-4 animate-pulse rounded bg-slate-200" />
                  </td>
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
                  <p className="text-[14px] font-semibold text-slate-600">
                    {query.trim() ? 'No batches match your search.' : ambiguityCopy.batches.empty}
                  </p>
                </td>
              </tr>
            ) : (
              visible.map((batch) => {
                const highlighted = batch.batch_id === highlightedBatchId
                const status = batchStatus(batch)
                return (
                  <tr
                    key={batch.batch_id}
                    id={`batch-row-${batch.batch_id}`}
                    className="group cursor-pointer"
                    onClick={() => onRowSelect?.(batch.batch_id)}
                  >
                    <td
                      className={`rounded-l-2xl border-y border-l px-3 py-3 transition ${
                        highlighted
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-950 group-hover:bg-white'
                      }`}
                    >
                      <p className="font-mono text-[14px] font-semibold">{batch.batch_id}</p>
                      {batch.source_reference?.trim() && batch.source_reference.trim() !== batch.batch_id ? (
                        <p className={`mt-0.5 text-[12px] font-medium ${highlighted ? 'text-white/55' : 'text-slate-400'}`}>
                          {batch.source_reference.trim()}
                        </p>
                      ) : null}
                    </td>
                    <td className={`border-y px-3 py-3 transition ${highlighted ? 'border-slate-950 bg-slate-950' : 'border-slate-200 bg-slate-50 group-hover:bg-white'}`}>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                          status ? statusBadge(status) : 'border-slate-200 bg-slate-100 text-slate-500'
                        }`}
                      >
                        {status ? (FINALITY_DISPLAY[status] ?? displayApiField(status)) : '-'}
                      </span>
                    </td>
                    <td className={`border-y px-3 py-3 text-right text-[14px] font-semibold tabular-nums transition ${highlighted ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-950 group-hover:bg-white'}`}>
                      {batchMatchPctDisplay(batch)}
                    </td>
                    <td className={`border-y px-3 py-3 text-right text-[14px] font-semibold tabular-nums transition ${highlighted ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 group-hover:bg-white'}`}>
                      {batchDisplayValue(batch)}
                    </td>
                    <td className={`rounded-r-2xl border-y border-r px-3 py-3 text-right transition ${highlighted ? 'border-slate-950 bg-slate-950' : 'border-slate-200 bg-slate-50 group-hover:bg-white'}`}>
                      <Link
                        href={`${pathname}?dock=grid&batch_id=${encodeURIComponent(batch.batch_id)}`}
                        onClick={(event) => event.stopPropagation()}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                          highlighted ? 'bg-white text-slate-950' : 'bg-slate-950 text-white hover:bg-slate-800'
                        }`}
                      >
                        Review
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((current) => current - 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          aria-label="Previous batch page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="text-[13px] font-semibold text-slate-500">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => setPage((current) => current + 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          aria-label="Next batch page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
