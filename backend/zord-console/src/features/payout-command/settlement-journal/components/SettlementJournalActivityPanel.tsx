'use client'

import Link from 'next/link'
import { Fragment } from 'react'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'
import {
  AMOUNT_RANGE_OPTIONS,
  DATE_RANGE_OPTIONS,
  type AmountRangeFilter,
  type DateRangePreset,
} from '../settlementJournalSidebarUtils'
import { settlementJournalCopy } from '../copy/settlementJournalCopy'
import {
  formatClientRefDisplay,
  formatMappingConfidenceLabel,
} from '../mappers/mapMatchStatus'
import { SettlementParseErrorsTable } from './SettlementParseErrorsTable'
import type { SettlementParseErrorRow } from '@/services/payout-command/prod-api/settlementObservations'

type SettlementTabKey = 'observations' | 'parseErrors'

const TAB_ITEMS: { key: SettlementTabKey; label: string }[] = [
  { key: 'observations', label: settlementJournalCopy.tabs.observations },
  { key: 'parseErrors', label: settlementJournalCopy.tabs.parseErrors },
]

const JOURNAL_FILTER_LABEL =
  'mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]'

const filterInputClass =
  'h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50 px-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400/55 focus:bg-white focus:ring-2 focus:ring-sky-400/15'

const filterSelectClass =
  'h-9 w-full min-w-[7.5rem] rounded-xl border border-slate-200/90 bg-slate-50 px-2.5 text-[14px] text-slate-900 outline-none transition focus:border-sky-400/55 focus:bg-white focus:ring-2 focus:ring-sky-400/15'

const ROW_SIZE_OPTIONS = [25, 50, 100, 200] as const
const TABLE_TH =
  'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#888888] whitespace-nowrap'
const TABLE_COL_COUNT = 8

export type SettlementJournalActivityViewModel = {
  tableSearch: string
  setTableSearch: (v: string) => void
  selectedClientBatchId: string
  applySidebarBatchToFilters: () => void
  clearTableFilters: () => void
  dateRange: DateRangePreset
  setDateRange: (v: DateRangePreset) => void
  filterSettlementBatchId: string
  setFilterSettlementBatchId: (v: string) => void
  filterBankRef: string
  setFilterBankRef: (v: string) => void
  filterClientRef: string
  setFilterClientRef: (v: string) => void
  sourceSystemFilter: string
  setSourceSystemFilter: (v: string) => void
  sourceSystemOptions: string[]
  statusFilter: string
  setStatusFilter: (v: string) => void
  statusOptions: string[]
  amountRangeFilter: AmountRangeFilter
  setAmountRangeFilter: (v: AmountRangeFilter) => void
  filteredRows: SettlementObservationTableRow[]
  pageRows: SettlementObservationTableRow[]
  detailLoading: boolean
  expandedId: string | null
  setExpandedId: (updater: (id: string | null) => string | null) => void
  safePage: number
  rowsPerPage: (typeof ROW_SIZE_OPTIONS)[number]
  setRowsPerPage: (v: (typeof ROW_SIZE_OPTIONS)[number]) => void
  setPage: (updater: (p: number) => number) => void
  setJumpPage: (v: string) => void
  totalPages: number
  jumpPage: string
  activeTab: SettlementTabKey
  setActiveTab: (tab: SettlementTabKey) => void
  parseErrors: SettlementParseErrorRow[]
  parseErrorsLoading: boolean
  parseErrorTotal: number | null
  parseErrorTotalLoading: boolean
  filteredCount: number
  tableTotal: number
  observationTotal: number | null
  filtersActive: boolean
  serverPagination: boolean
  paginationStart: number
  paginationEnd: number
}

type SettlementJournalActivityPanelProps = {
  vm: SettlementJournalActivityViewModel
}

export function SettlementJournalActivityPanel({ vm }: SettlementJournalActivityPanelProps) {
  const {
    tableSearch,
    setTableSearch,
    selectedClientBatchId,
    applySidebarBatchToFilters,
    clearTableFilters,
    dateRange,
    setDateRange,
    filterSettlementBatchId,
    setFilterSettlementBatchId,
    filterBankRef,
    setFilterBankRef,
    filterClientRef,
    setFilterClientRef,
    sourceSystemFilter,
    setSourceSystemFilter,
    sourceSystemOptions,
    statusFilter,
    setStatusFilter,
    statusOptions,
    amountRangeFilter,
    setAmountRangeFilter,
    filteredRows,
    pageRows,
    detailLoading,
    expandedId,
    setExpandedId,
    safePage,
    rowsPerPage,
    setRowsPerPage,
    setPage,
    setJumpPage,
    totalPages,
    jumpPage,
    activeTab,
    setActiveTab,
    parseErrors,
    parseErrorsLoading,
    parseErrorTotal,
    parseErrorTotalLoading,
    filteredCount,
    tableTotal,
    observationTotal,
    filtersActive,
    serverPagination,
    paginationStart,
    paginationEnd,
  } = vm

  return (
    <>
<div className={`relative mb-4 overflow-hidden ${COMMAND_CENTER_KPI_CARD} p-4`}>
  <CommandCenterCardGlow />
  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0 flex-1">
      <label htmlFor="settlement-journal-search" className={JOURNAL_FILTER_LABEL}>
        Search
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"
          aria-hidden
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </span>
        <input
          id="settlement-journal-search"
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
          placeholder={settlementJournalCopy.table.searchPlaceholder}
          className={`${filterInputClass} pl-9`}
        />
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!selectedClientBatchId}
        onClick={applySidebarBatchToFilters}
        className="h-9 shrink-0 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[15px] font-medium text-[#334155] shadow-sm transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Use sidebar batch
      </button>
      <button
        type="button"
        onClick={clearTableFilters}
        className="h-9 shrink-0 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[15px] font-medium text-[#475569] shadow-sm transition hover:bg-[#f8fafc]"
      >
        Clear filters
      </button>
    </div>
  </div>

  <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
    <div>
      <label className={JOURNAL_FILTER_LABEL}>Date range</label>
      <select
        value={dateRange}
        onChange={(e) => setDateRange(e.target.value as DateRangePreset)}
        className={filterSelectClass}
      >
        {DATE_RANGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
    <div>
      <label className={JOURNAL_FILTER_LABEL}>Settlement batch</label>
      <input
        value={filterSettlementBatchId}
        onChange={(e) => setFilterSettlementBatchId(e.target.value)}
        placeholder="UUID prefix…"
        className={filterInputClass}
      />
    </div>
    <div>
      <label className={JOURNAL_FILTER_LABEL}>Bank ref</label>
      <input
        value={filterBankRef}
        onChange={(e) => setFilterBankRef(e.target.value)}
        placeholder="UTR / bank ref"
        className={filterInputClass}
      />
    </div>
    <div>
      <label className={JOURNAL_FILTER_LABEL}>Client ref</label>
      <input
        value={filterClientRef}
        onChange={(e) => setFilterClientRef(e.target.value)}
        placeholder="Client reference"
        className={filterInputClass}
      />
    </div>
    <div>
      <label className={JOURNAL_FILTER_LABEL}>Source</label>
      <select
        value={sourceSystemFilter}
        onChange={(e) => setSourceSystemFilter(e.target.value)}
        className={filterSelectClass}
      >
        {sourceSystemOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'All' ? 'All sources' : opt}
          </option>
        ))}
      </select>
    </div>
    <div>
      <label className={JOURNAL_FILTER_LABEL}>Status</label>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className={filterSelectClass}
      >
        {statusOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'All' ? 'All statuses' : opt}
          </option>
        ))}
      </select>
    </div>
  </div>

  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
    <div className="sm:col-span-2 lg:col-span-3">
      <label className={JOURNAL_FILTER_LABEL}>Amount range</label>
      <select
        value={amountRangeFilter}
        onChange={(e) => setAmountRangeFilter(e.target.value as AmountRangeFilter)}
        className={filterSelectClass}
      >
        {AMOUNT_RANGE_OPTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  </div>
</div>

<nav className="mb-4 flex items-center gap-0.5 border-b border-[#E5E5E5]">
  {TAB_ITEMS.map((tab) => (
    <button
      key={tab.key}
      type="button"
      onClick={() => setActiveTab(tab.key)}
      className={`-mb-px border-b-2 px-4 py-2 text-[14px] font-medium tracking-[0] transition ${
        activeTab === tab.key
          ? 'border-black text-black'
          : 'border-transparent text-[#888888] hover:text-[#000000]'
      }`}
    >
      {tab.label}
    </button>
  ))}
</nav>

{activeTab === 'observations' ? (
<section className={`overflow-hidden ${COMMAND_CENTER_KPI_CARD} !p-0`}>
  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
    <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>Settlement observations</p>
    <p className={HOME_BODY_IMPERIAL_SM}>
      {filtersActive && tableTotal > 0 ? (
        <>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-700">
            {tableTotal.toLocaleString('en-US')} total
          </span>{' '}
          ·{' '}
        </>
      ) : null}
      <span className="rounded-full border border-black/30 bg-black px-2 py-0.5 text-[12px] font-semibold text-white">
        {(observationTotal ?? tableTotal).toLocaleString('en-US')} rows
      </span>{' '}
      match filters
    </p>
  </div>
  <div className="min-w-0 overflow-x-auto">
    <table className={`w-full min-w-[720px] border-collapse text-[14px] ${HOME_TITLE_BLACK}`}>
      <thead className="bg-[#f8fafc]">
        <tr>
{[
            settlementJournalCopy.table.sourceRow,
            settlementJournalCopy.table.clientRef,
            settlementJournalCopy.table.bankRef,
            settlementJournalCopy.table.observedAmount,
            settlementJournalCopy.table.netSettled,
            settlementJournalCopy.table.fee,
            settlementJournalCopy.table.matchConfidence,
            settlementJournalCopy.table.observedAt,
          ].map((h) => (
            <th key={h} className={TABLE_TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pageRows.length === 0 ? (
          <tr>
            <td colSpan={TABLE_COL_COUNT} className="px-4 py-14 text-center text-[15px] text-[#64748b]">
              {selectedClientBatchId
                ? detailLoading
                  ? 'Loading observations…'
                  : 'No observations match your search or status filter.'
                : 'Select a client batch to load observations.'}
            </td>
          </tr>
        ) : (
          pageRows.map((row, rowIndex) => {
            const expanded = expandedId === row.observationId
            return (
              <Fragment key={row.observationId}>
                <tr
                  className={`cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50/80 ${
                    expanded ? 'bg-slate-50/60' : rowIndex % 2 === 1 ? 'bg-slate-50/30' : ''
                  }`}
                  onClick={() =>
                    setExpandedId((id) => (id === row.observationId ? null : row.observationId))
                  }
                >
                  <td className="truncate px-3 py-2.5 font-mono text-[12px] text-[#334155]" title={row.sourceRowRef || row.settlementBatchId}>
                    {row.sourceRowRef || row.settlementBatchId}
                  </td>
                  <td className="truncate px-3 py-2.5 font-medium text-[#1e293b]" title={formatClientRefDisplay(row)}>
                    {formatClientRefDisplay(row)}
                  </td>
                  <td className="truncate px-3 py-2.5 font-mono text-[12px] text-[#334155]" title={row.bankRef}>
                    {row.bankRef}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium">
                    {formatJournalMoney(row.amount, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {formatJournalMoney(row.settledAmount, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[#64748b]">
                    {formatJournalMoney(row.feeAmount, row.currency)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[13px] text-[#64748b]">
                    {formatMappingConfidenceLabel(row)}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-[#64748b] whitespace-nowrap">
                    {row.observationTime}
                  </td>
                </tr>
                {expanded ? (
                  <tr className="bg-slate-50/80">
                    <td colSpan={TABLE_COL_COUNT} className="px-5 pb-5 pt-3">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                        Observation detail
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
                        <p>
                          <span className="text-[#888888]">Source row</span>
                          <br />
                          <span className="font-mono">{row.sourceRowRef}</span>
                        </p>
                        <p>
                          <span className="text-[#888888]">Observation ID</span>
                          <br />
                          <span className="font-mono break-all">{row.observationId}</span>
                        </p>
                        <p>
                          <span className="text-[#888888]">Ingest run</span>
                          <br />
                          <span className="font-mono">{row.ingestRunId}</span>
                        </p>
                        <p>
                          <span className="text-[#888888]">Client batch</span>
                          <br />
                          <span className="font-mono">{row.clientBatchId}</span>
                        </p>
                        <p>
                          <span className="text-[#888888]">{settlementJournalCopy.table.matchedPayment}</span>
                          <br />
                          {row.matchedIntentId && row.matchedIntentId !== '—' ? (
                            <Link
                              href={`/payout-command-view/today?dock=grid&batch_id=${encodeURIComponent(row.clientBatchId)}`}
                              className="font-mono text-[13px] text-sky-800 underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.matchedIntentId}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </p>
                        <p>
                          <span className="text-[#888888]">Deduction</span>
                          <br />
                          {formatJournalMoney(row.deductionAmount, row.currency)}
                        </p>
                        <p>
                          <span className="text-[#888888]">Provider ref</span>
                          <br />
                          {row.providerRef}
                        </p>
                        <p>
                          <span className="text-[#888888]">Bank ref</span>
                          <br />
                          {row.bankRef}
                        </p>
                        <p>
                          <span className="text-[#888888]">Source system ID</span>
                          <br />
                          {row.sourceSystemId}
                        </p>
                        <p>
                          <span className="text-[#888888]">Source type / strength</span>
                          <br />
                          {row.sourceType} · {row.sourceStrength}
                        </p>
                        <p>
                          <span className="text-[#888888]">Kind</span>
                          <br />
                          {row.observationKind}
                        </p>
                        <p>
                          <span className="text-[#888888]">Flags</span>
                          <br />
                          {row.retryFlag ? 'Retry ' : ''}
                          {row.reversalFlag ? 'Reversal ' : ''}
                          {row.returnFlag ? 'Return ' : ''}
                          {!row.retryFlag && !row.reversalFlag && !row.returnFlag ? '—' : ''}
                        </p>
                        <p>
                          <span className="text-[#888888]">Provider / failure code</span>
                          <br />
                          {row.providerStatusCode} · {row.failureReasonCode}
                        </p>
                        <p>
                          <span className="text-[#888888]">Parse / mapping confidence</span>
                          <br />
                          {row.parseConfidence != null ? `${(row.parseConfidence * 100).toFixed(0)}%` : '—'}{' '}
                          /{' '}
                          {row.mappingConfidence != null
                            ? `${(row.mappingConfidence * 100).toFixed(0)}%`
                            : '—'}
                        </p>
                        <p>
                          <span className="text-[#888888]">Value date</span>
                          <br />
                          {row.valueDate}
                        </p>
                        <p>
                          <span className="text-[#888888]">Created / updated</span>
                          <br />
                          {row.createdAt} · {row.updatedAt}
                        </p>
                        <p>
                          <span className="text-[#888888]">Envelope / trace</span>
                          <br />
                          <span className="font-mono text-[12px] break-all">{row.settlementEnvelopeId}</span>
                          <br />
                          <span className="font-mono text-[12px] break-all">{row.traceId}</span>
                        </p>
                        <p>
                          <span className="text-[#888888]">Connector</span>
                          <br />
                          {row.connectorId}
                        </p>
                        <p>
                          <span className="text-[#888888]">Source file</span>
                          <br />
                          <span className="font-mono break-all">{row.sourceFileRef}</span>
                        </p>
                        <p>
                          <span className="text-[#888888]">External / batch ref</span>
                          <br />
                          {row.externalReference} · {row.batchReference}
                        </p>
                        <p>
                          <span className="text-[#888888]">Strength class</span>
                          <br />
                          {row.sourceStrengthClass}
                        </p>
                        <p>
                          <span className="text-[#888888]">Provider ref status</span>
                          <br />
                          {row.providerRefStatus} · {row.providerRefConsistent}
                          <br />
                          <span className="text-[12px] text-[#64748b]">
                            {row.providerRefFirstSeenAt} → {row.providerRefLastSeenAt}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#888888]">Mapping profile</span>
                          <br />
                          {row.mappingProfileId} v{row.mappingProfileVersion}
                        </p>
                        <p>
                          <span className="text-[#888888]">Carrier / attachment scores</span>
                          <br />
                          {row.carrierRichnessScore != null
                            ? `${(row.carrierRichnessScore * 100).toFixed(0)}%`
                            : '—'}{' '}
                          /{' '}
                          {row.attachmentReadinessScore != null
                            ? `${(row.attachmentReadinessScore * 100).toFixed(0)}%`
                            : '—'}{' '}
                          · {row.scoreVersion}
                        </p>
                        <p>
                          <span className="text-[#888888]">Canonical</span>
                          <br />
                          <span className="font-mono text-[12px] break-all">{row.canonicalHash}</span>
                          <br />
                          {row.canonicalSnapshotRef}
                        </p>
                        <p>
                          <span className="text-[#888888]">Corridor / beneficiary</span>
                          <br />
                          {row.corridorId} · {row.beneficiaryFingerprint}
                        </p>
                        <p>
                          <span className="text-[#888888]">Zord signature carrier</span>
                          <br />
                          {row.zordSignatureCarrier}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })
        )}
      </tbody>
    </table>
  </div>

  <div className="border-t border-slate-200/80 bg-[#f8fbff] px-4 py-3 text-[14px] text-[#64748b]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span>
        Showing {paginationStart}-{paginationEnd} of {tableTotal.toLocaleString('en-US')} observations
        {filtersActive ? ` (${filteredCount.toLocaleString('en-US')} match filters)` : ''}
      </span>
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <select
          value={rowsPerPage}
          onChange={(e) => {
            setRowsPerPage(Number(e.target.value) as (typeof ROW_SIZE_OPTIONS)[number])
            setPage(() => 1)
            setJumpPage('1')
          }}
          className="rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-[14px]"
        >
          {ROW_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={safePage <= 1}
        className="rounded-lg border border-slate-200/90 bg-white px-3 py-1 text-[14px] font-medium text-slate-800 disabled:opacity-40"
      >
        Prev
      </button>
      <span className="tabular-nums">
        Page {safePage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        disabled={safePage >= totalPages}
        className="rounded-lg border border-slate-200/90 bg-white px-3 py-1 text-[14px] font-medium text-slate-800 disabled:opacity-40"
      >
        Next
      </button>
      <input
        value={jumpPage}
        onChange={(e) => setJumpPage(e.target.value.replace(/[^0-9]/g, ''))}
        aria-label="Jump to page"
        className="w-16 rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-center"
      />
      <button
        type="button"
        className="rounded-lg border border-slate-200/90 bg-white px-3 py-1 text-[14px] font-medium text-slate-800"
        onClick={() => {
          const target = Number(jumpPage)
          if (!Number.isFinite(target) || target < 1) return
          setPage(() => Math.min(totalPages, target))
        }}
      >
        Go
      </button>
    </div>
  </div>
</section>
) : (
<section className={`overflow-hidden ${COMMAND_CENTER_KPI_CARD} !p-0`}>
  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
    <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>
      {settlementJournalCopy.tabs.parseErrors}
    </p>
    <p className={HOME_BODY_IMPERIAL_SM}>
      <span className="rounded-full border border-rose-200/70 bg-rose-50 px-2 py-0.5 text-[12px] font-semibold text-rose-800">
        {parseErrorTotal != null
          ? parseErrorTotal.toLocaleString('en-US')
          : parseErrorTotalLoading
            ? '…'
            : parseErrors.length.toLocaleString('en-US')}{' '}
        rows
      </span>{' '}
      {parseErrorsLoading || parseErrorTotalLoading ? 'loading…' : 'for this batch'}
    </p>
  </div>
  <SettlementParseErrorsTable rows={parseErrors} loading={parseErrorsLoading} />
</section>
)}
    </>
  )
}
