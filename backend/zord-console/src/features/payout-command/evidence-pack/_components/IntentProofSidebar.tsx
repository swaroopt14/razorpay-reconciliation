'use client'

import { useMemo } from 'react'
import { Glyph } from '../../shared'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { mapPackTableRow } from '../../evidence/mappers/mapPackTableRow'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

export const INTENTS_PER_PAGE = 10

type IntentProofSidebarProps = {
  intentPacks: EvidencePackSummaryRow[]
  activePackId: string
  onSelect: (packId: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  page: number
  onPageChange: (page: number) => void
}

function truncateId(id: string, head = 8): string {
  const v = id.trim()
  if (!v || v === '—') return '—'
  if (v.length <= head + 4) return v
  return `${v.slice(0, head)}…`
}

function paymentRefFromSummary(summary: EvidencePackSummaryRow): string {
  const clean = (v: unknown): string => {
    const out = apiTrimmedString(v)
    if (!out) return ''
    const normalized = out.toLowerCase()
    return normalized === 'null' || normalized === 'undefined' ? '' : out
  }
  return clean(summary.client_payout_ref) || clean(summary.client_reference) || '—'
}

export function IntentProofSidebar({
  intentPacks,
  activePackId,
  onSelect,
  searchQuery,
  onSearchChange,
  page,
  onPageChange,
}: IntentProofSidebarProps) {
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return intentPacks
    return intentPacks.filter((row) => {
      const packId = apiTrimmedString(row.evidence_pack_id).toLowerCase()
      const intentId = apiTrimmedString(row.intent_id).toLowerCase()
      const ref = paymentRefFromSummary(row).toLowerCase()
      return packId.includes(q) || intentId.includes(q) || ref.includes(q)
    })
  }, [intentPacks, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / INTENTS_PER_PAGE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = (safePage - 1) * INTENTS_PER_PAGE
  const pageRows = filtered.slice(pageStart, pageStart + INTENTS_PER_PAGE)

  return (
    <aside className="flex w-full flex-col bg-[#f8f8f6] lg:w-[300px] lg:shrink-0 lg:self-stretch lg:border-r lg:border-[#E5E5E5]">
      <div className="border-b border-[#E5E5E5] px-4 py-3">
        <p className="text-[13px] font-semibold text-slate-900">{evidenceCopy.hub.intentSidebarTitle}</p>
        <p className="mt-0.5 text-[11.5px] tabular-nums text-slate-500">
          {filtered.length} payment proof{filtered.length === 1 ? '' : 's'}
        </p>
        <div className="relative mt-3">
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={evidenceCopy.hub.intentSidebarSearch}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400/70 focus:ring-2 focus:ring-slate-300/45"
          />
          <Glyph name="search" className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {pageRows.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-slate-500">{evidenceCopy.hub.intentSidebarEmpty}</p>
        ) : (
          <ul className="space-y-1">
            {pageRows.map((summary) => {
              const packId = apiTrimmedString(summary.evidence_pack_id)
              const vm = mapPackTableRow(summary, summary.leaf_count ?? summary.artifact_count ?? undefined)
              const ref = paymentRefFromSummary(summary)
              const intentId = apiTrimmedString(summary.intent_id)
              const isActive = packId === activePackId
              return (
                <li key={packId}>
                  <button
                    type="button"
                    onClick={() => onSelect(packId)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                      isActive
                        ? 'border-slate-900 bg-white shadow-sm'
                        : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[13px] font-semibold text-slate-900">
                        {ref !== '—' ? ref : truncateId(intentId)}
                      </p>
                      {vm.proofScore != null ? (
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-slate-700">
                          {vm.proofScore}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500" title={intentId}>
                      {truncateId(intentId, 10)}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {filtered.length > INTENTS_PER_PAGE ? (
        <div className="flex items-center justify-between border-t border-[#E5E5E5] px-3 py-2.5 text-[12px] text-slate-600">
          <p>
            Page <span className="font-semibold text-slate-900">{safePage}</span> of {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  )
}
