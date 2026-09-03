'use client'

import { useMemo } from 'react'
import { Glyph } from '../../shared'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
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
  if (!v || v === '-') return '-'
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
  return clean(summary.client_payout_ref) || clean(summary.client_reference) || '-'
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
    <aside className="flex w-full flex-col bg-[#f8f8f6] lg:w-[220px] lg:shrink-0 lg:self-stretch lg:border-r lg:border-[#E5E5E5]">
      <div className="border-b border-[#E5E5E5] px-3 py-2.5">
        <p className="text-[12px] font-semibold text-[#111111]">{evidenceCopy.hub.intentSidebarTitle}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-[#555555]">
          {filtered.length} payment proof{filtered.length === 1 ? '' : 's'}
        </p>
        <div className="relative mt-2">
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={evidenceCopy.hub.intentSidebarSearch}
            className="h-8 w-full rounded-md border border-[#E5E5E5] bg-white pl-7 pr-2 text-[12px] text-[#111111] outline-none transition placeholder:text-[#888888] focus:border-[#111111]/40"
          />
          <Glyph name="search" className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-[#888888]" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {pageRows.length === 0 ? (
          <p className="px-2 py-8 text-center text-[12px] text-[#555555]">{evidenceCopy.hub.intentSidebarEmpty}</p>
        ) : (
          <ul className="space-y-0.5">
            {pageRows.map((summary) => {
              const packId = apiTrimmedString(summary.evidence_pack_id)
              const ref = paymentRefFromSummary(summary)
              const intentId = apiTrimmedString(summary.intent_id)
              const isActive = packId === activePackId
              return (
                <li key={packId}>
                  <button
                    type="button"
                    onClick={() => onSelect(packId)}
                    className={`w-full rounded-md border px-2.5 py-2 text-left transition ${
                      isActive
                        ? 'border-[#111111] bg-white shadow-sm'
                        : 'border-transparent bg-transparent hover:border-[#E5E5E5] hover:bg-white'
                    }`}
                  >
                    <p className="truncate text-[12px] font-semibold text-[#111111]">
                      {ref !== '-' ? ref : truncateId(intentId)}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-[#666666]" title={intentId}>
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
        <div className="flex items-center justify-between border-t border-[#E5E5E5] px-2 py-2 text-[11px] text-[#555555]">
          <p>
            <span className="font-semibold text-[#111111]">{safePage}</span>/{totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="inline-flex h-6 items-center rounded border border-[#E5E5E5] bg-white px-2 text-[10px] font-semibold text-[#111111] transition hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              className="inline-flex h-6 items-center rounded border border-[#E5E5E5] bg-white px-2 text-[10px] font-semibold text-[#111111] transition hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  )
}
