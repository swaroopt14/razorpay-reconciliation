'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Glyph } from '../../shared'
import { JOURNAL_DM_SANS } from '../../journal/journalFonts'
import { evidenceCopy } from '../copy/evidenceCopy'
import { EVIDENCE_CARD } from '../evidencePageTokens'
import { EvidenceSectionHeader } from './EvidenceSectionHeader'
import type { PackTableRowVm } from '../types/evidenceViewModels'
import { formatIsoDate, shortHash } from '../utils/evidenceFormat'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { listEvidencePacksForBatch } from '@/services/payout-command/prod-api/listEvidencePacksForBatch'
import { isBatchEvidencePack } from '@/services/payout-command/prod-api/resolveBatchEvidencePack'
import { mapPackTableRow } from '../mappers/mapPackTableRow'

const PAGE_SIZE = 10

type EvidencePackBrowserProps = {
  batchRow: PackTableRowVm | null
  intentPackCount: number
  batchId: string
  onBatchChange: (id: string) => void
  batchOptions: { batch_id: string; finality_status?: string }[]
  intelBatches: IntelligenceBatchRow[]
  tenantReady: boolean
  packsLoading: boolean
  packListError: string | null
}

type CatalogEntry =
  | { status: 'ready'; row: PackTableRowVm }
  | { status: 'unavailable'; batchId: string }

function CopyProofRootButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      title="Copy proof root"
      onClick={() => void navigator.clipboard?.writeText(text)}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 transition hover:border-black/30 hover:text-slate-900"
    >
      <Glyph name="copy" className="h-3.5 w-3.5" />
    </button>
  )
}

function sortCatalogEntries(entries: CatalogEntry[]): CatalogEntry[] {
  const ready = entries.filter((e): e is Extract<CatalogEntry, { status: 'ready' }> => e.status === 'ready')
  const unavailable = entries.filter(
    (e): e is Extract<CatalogEntry, { status: 'unavailable' }> => e.status === 'unavailable',
  )

  ready.sort((a, b) => (b.row.generatedAt ?? '').localeCompare(a.row.generatedAt ?? ''))
  unavailable.sort((a, b) => a.batchId.localeCompare(b.batchId, undefined, { numeric: true, sensitivity: 'base' }))

  return [...ready, ...unavailable]
}

function matchesFilter(entry: CatalogEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (entry.status === 'unavailable') return entry.batchId.toLowerCase().includes(q)
  const { row } = entry
  return (
    row.packId.toLowerCase().includes(q) ||
    row.batchId.toLowerCase().includes(q) ||
    row.proofRoot.toLowerCase().includes(q)
  )
}

function BatchProofRow({ row }: { row: PackTableRowVm }) {
  const merkleShort = shortHash(row.proofRoot)
  const href = `/payout-command-view/evidence-pack/${encodeURIComponent(row.packId)}?tab=graph${
    row.batchId && row.batchId !== '—' ? `&batch_id=${encodeURIComponent(row.batchId)}` : ''
  }`

  return (
    <tr className="group align-top bg-sky-50/40 transition-colors hover:bg-sky-50/70">
      <td className="px-5 py-4">
        <p className="font-mono text-[13px] font-semibold text-slate-900">{row.packId}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
            Batch proof
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {row.modeLabel}
          </span>
        </div>
      </td>
      <td className="px-4 py-4 text-[13px] font-semibold text-slate-700">Batch-wide</td>
      <td className="min-w-[12rem] px-4 py-4">
        <div className="rounded-[0.75rem] border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={row.proofRoot}>
              {merkleShort}
            </code>
            <CopyProofRootButton text={row.proofRoot} />
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-right tabular-nums">
        <span className="text-[14px] font-semibold text-slate-900">{row.proofScore ?? '—'}</span>
        {row.proofScore != null ? <span className="text-[11px] text-slate-500">/100</span> : null}
      </td>
      <td className="px-4 py-4 text-right tabular-nums text-[13px] text-slate-700">
        {row.itemCount ?? '—'}/{row.totalItems}
      </td>
      <td className="px-4 py-4 text-right text-[13px] tabular-nums text-slate-600">
        {formatIsoDate(row.generatedAt)}
      </td>
      <td className="px-5 py-4 text-right">
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-[0.65rem] border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-900 transition group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white"
        >
          {evidenceCopy.browser.viewBatchProof}
          <Glyph name="arrow-up-right" className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  )
}

function UnavailableBatchProofRow({ batchId }: { batchId: string }) {
  return (
    <tr className="align-top bg-slate-50/50">
      <td className="px-5 py-4">
        <p className="font-mono text-[13px] font-semibold text-slate-700">{batchId}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            Evidence pack not available
          </span>
        </div>
      </td>
      <td className="px-4 py-4 text-[13px] font-medium text-slate-500">Batch-wide</td>
      <td className="px-4 py-4 text-[13px] text-slate-400">—</td>
      <td className="px-4 py-4 text-right text-[13px] text-slate-400">—</td>
      <td className="px-4 py-4 text-right text-[13px] text-slate-400">—</td>
      <td className="px-4 py-4 text-right text-[13px] text-slate-400">—</td>
      <td className="px-5 py-4 text-right text-[13px] font-medium text-slate-400">—</td>
    </tr>
  )
}

export function EvidencePackBrowser({
  batchOptions,
  tenantReady,
  packListError,
}: EvidencePackBrowserProps) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [fetchErrors, setFetchErrors] = useState<string[]>([])
  const [filterQuery, setFilterQuery] = useState('')
  const [page, setPage] = useState(1)

  const batchIdsKey = useMemo(
    () =>
      batchOptions
        .map((b) => b.batch_id)
        .filter(Boolean)
        .join('\u0001'),
    [batchOptions],
  )

  useEffect(() => {
    setPage(1)
  }, [batchIdsKey, filterQuery])

  useEffect(() => {
    if (!tenantReady || !batchOptions.length) {
      setCatalog([])
      setFetchErrors([])
      setCatalogLoading(false)
      return
    }

    let cancelled = false
    setCatalogLoading(true)
    setFetchErrors([])

    void Promise.all(
      batchOptions.map(async (option) => {
        const bid = option.batch_id.trim()
        if (!bid) return null
        const { packs, errors } = await listEvidencePacksForBatch(bid)
        const batchPack = packs.find(isBatchEvidencePack)
        if (batchPack) {
          const itemCount = batchPack.leaf_count ?? batchPack.artifact_count ?? undefined
          return {
            entry: { status: 'ready' as const, row: mapPackTableRow(batchPack, itemCount, null) },
            errors,
          }
        }
        return {
          entry: { status: 'unavailable' as const, batchId: bid },
          errors,
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const entries: CatalogEntry[] = []
      const errors: string[] = []
      for (const result of results) {
        if (!result) continue
        entries.push(result.entry)
        if (result.errors.length) errors.push(...result.errors)
      }
      setCatalog(sortCatalogEntries(entries))
      setFetchErrors(errors)
      setCatalogLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [tenantReady, batchIdsKey, batchOptions])

  const filtered = useMemo(
    () => catalog.filter((entry) => matchesFilter(entry, filterQuery)),
    [catalog, filterQuery],
  )

  const readyCount = useMemo(() => catalog.filter((e) => e.status === 'ready').length, [catalog])
  const unavailableCount = catalog.length - readyCount

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(safePage * PAGE_SIZE, filtered.length)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const countLine = catalogLoading ? (
    <span className="font-medium text-slate-900">Loading batch proofs…</span>
  ) : catalog.length === 0 ? (
    <>No batch proofs yet</>
  ) : (
    <>
      <span className="font-semibold text-slate-900">{readyCount}</span> {evidenceCopy.browser.batchProofCount}
      {unavailableCount > 0 ? (
        <>
          {' '}
          · <span className="font-semibold text-slate-900">{unavailableCount}</span> not available
        </>
      ) : null}
      {filterQuery.trim() ? (
        <>
          {' '}
          · <span className="font-semibold text-slate-900">{filtered.length}</span> match filter
        </>
      ) : null}
    </>
  )

  const errorLine = packListError ?? (fetchErrors.length ? fetchErrors.slice(0, 2).join(' · ') : null)

  return (
    <section className={`${EVIDENCE_CARD} ${JOURNAL_DM_SANS}`}>
      <EvidenceSectionHeader
        title={evidenceCopy.browser.title}
        subtitle={evidenceCopy.browser.subtitle}
        live={!catalogLoading && readyCount > 0}
      />
      <div className="border-b border-slate-100/90 px-5 pb-4">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <p className="text-[12.5px] tabular-nums text-slate-500">{countLine}</p>
            {errorLine ? <p className="mt-2 text-[13px] font-medium text-amber-800">{errorLine}</p> : null}
          </div>
          <label className="block max-w-md">
            <span className="sr-only">{evidenceCopy.browser.searchPlaceholder}</span>
            <input
              type="search"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={evidenceCopy.browser.searchPlaceholder}
              disabled={!tenantReady || catalogLoading}
              className="w-full rounded-[0.65rem] border border-slate-200 bg-white px-3 py-2 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200/80 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-[14px]">
          <thead>
            <tr className="bg-slate-50/70 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <th className="border-b border-slate-200/80 px-5 py-3">Evidence Pack</th>
              <th className="border-b border-slate-200/80 px-4 py-3">Scope</th>
              <th className="border-b border-slate-200/80 px-4 py-3">Proof Root</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Score</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Leaves</th>
              <th className="border-b border-slate-200/80 px-4 py-3 text-right">Generated</th>
              <th className="border-b border-slate-200/80 px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {catalogLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`loading-${i}`} className="align-top">
                    <td colSpan={7} className="px-5 py-3">
                      <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              : null}
            {!catalogLoading
              ? pageRows.map((entry) =>
                  entry.status === 'ready' ? (
                    <BatchProofRow key={`ready-${entry.row.packId}`} row={entry.row} />
                  ) : (
                    <UnavailableBatchProofRow key={`missing-${entry.batchId}`} batchId={entry.batchId} />
                  ),
                )
              : null}
            {!catalogLoading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center">
                  <p className="text-[15px] font-semibold text-slate-900">
                    {filterQuery.trim() ? 'No batch proofs match this filter.' : evidenceCopy.empty.noPack}
                  </p>
                  <p className="mt-2 text-[13.5px] text-slate-500">
                    {filterQuery.trim()
                      ? 'Try another pack id, batch id, or proof root.'
                      : evidenceCopy.empty.noPackHint}
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!catalogLoading && filtered.length > 0 ? (
        <div className="border-t border-slate-200/80 bg-slate-50/40 px-5 py-3 text-[13px] text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="tabular-nums">
              Showing {pageStart}–{pageEnd} of {filtered.length} batch proofs
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-[0.55rem] border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition enabled:hover:border-slate-900 enabled:hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="tabular-nums text-[13px] font-medium text-slate-700">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-[0.55rem] border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition enabled:hover:border-slate-900 enabled:hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
