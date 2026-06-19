'use client'

import Link from 'next/link'
import { Fragment, useState, type Dispatch, type SetStateAction } from 'react'
import { EntityLogo } from '../../entity-logo'
import { BankingInformationTokensBlock } from '../IntentDrawerSections'
import { formatJournalMoney } from '../formatJournalMoney'
import { downloadFailuresCsv } from '../journalExport'
import { IntentEngineDetailPanel } from '../IntentEngineDetailPanel'
import type { IntentDetail } from '@/services/payout-command/intent-journal-types'
import { buildLiveIntentDetailFromRowAndApi } from '@/services/payout-command/liveJournalIntentDetail'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { intentJournalCopy } from '../copy/intentJournalCopy'
import { intentRowCustomerStatus } from '../mappers/mapIntentTableRow'
import { ManualReviewEscalationModal } from './ManualReviewEscalationModal'
import type {
  JournalFailureRow,
  JournalIntentRow,
} from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import type { ApiProdIntentDetailPayload } from '@/services/payout-command/prod-api/prodApiTypes'
const JOURNAL_FILTER_LABEL =
  'mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]'

type TabKey = 'transactions' | 'failures'
type IntentStatus = 'Ready to Process' | 'Confirmed' | 'Pending' | 'Needs Review' | 'In Progress'
type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'ytd'

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
]

const CONNECTOR_OPTIONS: Array<'All' | string> = ['All', 'Razorpay', 'Cashfree', 'PayU']
const DISPATCH_OPTIONS = ['All', 'Bank Transfer', 'LSM', 'NACH'] as const

const AMOUNT_RANGE_OPTIONS = [
  'All',
  'Under ₹10,000',
  '₹10,000 – ₹1,00,000',
  'Over ₹1,00,000',
] as const
type AmountRangeFilter = (typeof AMOUNT_RANGE_OPTIONS)[number]

type FailureRow = JournalFailureRow
type StateSetter<T> = Dispatch<SetStateAction<T>>

const filterSelectClass =
  'h-9 w-full min-w-[7.5rem] rounded-xl border border-slate-200/90 bg-slate-50 px-2.5 text-[14px] text-slate-900 outline-none transition focus:border-sky-400/55 focus:bg-white focus:ring-2 focus:ring-sky-400/15'

const filterInputClass =
  'h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50 px-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400/55 focus:bg-white focus:ring-2 focus:ring-sky-400/15'

function intentStatusClass(status: IntentStatus) {
  if (status === 'Ready to Process') return 'text-sky-700'
  if (status === 'Confirmed') return 'text-black'
  if (status === 'Pending') return 'text-amber-600'
  if (status === 'Needs Review') return 'text-orange-600'
  if (status === 'In Progress') return 'text-sky-700'
  return 'text-slate-700'
}

function intentStatusLabel(status: IntentStatus) {
  if (status === 'Pending') return intentJournalCopy.status.awaitingBankConfirmation
  if (status === 'Ready to Process') return intentJournalCopy.status.readyForDispatch
  return intentRowCustomerStatus(status)
}

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'transactions', label: intentJournalCopy.tabs.instructions },
  { key: 'failures', label: intentJournalCopy.tabs.reviewItems },
]

const ROW_SIZE_OPTIONS = [25, 50, 100, 200] as const

const INTENT_TABLE_COL_COUNT = 7

const INTENT_TABLE_HEADERS: { key: string; label: string }[] = [
  { key: 'intentId', label: intentJournalCopy.table.headers.zordId },
  { key: 'reference', label: intentJournalCopy.table.headers.paymentRef },
  { key: 'amount', label: intentJournalCopy.table.headers.amount },
  { key: 'status', label: intentJournalCopy.table.headers.status },
  { key: 'execution', label: intentJournalCopy.table.headers.plannedDate },
  { key: 'rail', label: intentJournalCopy.table.headers.paymentMode },
  { key: 'score', label: intentJournalCopy.table.headers.readiness },
]



function HeaderIcon({ kind }: { kind: 'request' | 'reference' | 'amount' | 'payment' | 'status' | 'updated' }) {
  const cls = 'h-3.5 w-3.5 text-[#888888]'
  if (kind === 'request')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 7V4h8v3M6 7h12l1 13H5L6 7Z" />
      </svg>
    )
  if (kind === 'reference')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 7h10v10H7z" />
        <path d="M4 4h10v10" />
      </svg>
    )
  if (kind === 'amount')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18M16 7.5c0-1.9-1.8-3.5-4-3.5s-4 1.6-4 3.5 1.8 3.5 4 3.5 4 1.6 4 3.5-1.8 3.5-4 3.5-4-1.6-4-3.5" />
      </svg>
    )
  if (kind === 'payment')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    )
  if (kind === 'status')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  )
}


export type IntentJournalActivityViewModel = {
  activeTab: TabKey
  setActiveTab: StateSetter<TabKey>
  tableSearch: string
  setTableSearch: StateSetter<string>
  dateRange: DateRangePreset
  setDateRange: StateSetter<DateRangePreset>
  filterBatchId: string
  setFilterBatchId: StateSetter<string>
  connectorFilter: (typeof CONNECTOR_OPTIONS)[number]
  setConnectorFilter: StateSetter<(typeof CONNECTOR_OPTIONS)[number]>
  dispatchModeFilter: (typeof DISPATCH_OPTIONS)[number]
  setDispatchModeFilter: StateSetter<(typeof DISPATCH_OPTIONS)[number]>
  intentStatusFilter: 'All' | IntentStatus
  setIntentStatusFilter: StateSetter<'All' | IntentStatus>
  failureStageFilter: 'All' | FailureRow['failureStage']
  setFailureStageFilter: StateSetter<'All' | FailureRow['failureStage']>
  amountRangeFilter: AmountRangeFilter
  setAmountRangeFilter: StateSetter<AmountRangeFilter>
  page: number
  setPage: StateSetter<number>
  jumpPage: string
  setJumpPage: StateSetter<string>
  failurePage: number
  setFailurePage: StateSetter<number>
  failureJumpPage: string
  setFailureJumpPage: StateSetter<string>
  rowsPerPage: (typeof ROW_SIZE_OPTIONS)[number]
  setRowsPerPage: StateSetter<(typeof ROW_SIZE_OPTIONS)[number]>
  expandedId: string | null
  setExpandedId: StateSetter<string | null>
  selectedIntentId: string | null
  setSelectedIntentId: StateSetter<string | null>
  failureReviewId: string | null
  setFailureReviewId: StateSetter<string | null>
  liveIntentDrawerApi: ApiProdIntentDetailPayload | null
  filteredIntents: JournalIntentRow[]
  filteredFailures: JournalFailureRow[]
  pageRows: JournalIntentRow[]
  failurePageRows: JournalFailureRow[]
  intentTotal: number
  failureTotal: number
  apiIntentTotal: number | null
  apiFailureTotal: number | null
  tableFiltersActive: boolean
  safePage: number
  safeFailurePage: number
  totalPages: number
  failureTotalPages: number
  selectedBatch: { batchId: string } | null
  selectedBatchId: string
  journalUsesBackendFeed: boolean
  liveDetailLoading: boolean
  clearTableFilters: () => void
  failures: JournalFailureRow[]
  batches: Array<{ batchId: string }>
}

type IntentJournalActivityPanelProps = {
  vm: IntentJournalActivityViewModel
  isSandboxRoute?: boolean
}

export function IntentJournalActivityPanel({ vm, isSandboxRoute = false }: IntentJournalActivityPanelProps) {
  const {
    activeTab, setActiveTab, tableSearch, setTableSearch, dateRange, setDateRange,
    filterBatchId, setFilterBatchId, connectorFilter, setConnectorFilter,
    dispatchModeFilter, setDispatchModeFilter, intentStatusFilter, setIntentStatusFilter,
    failureStageFilter, setFailureStageFilter, amountRangeFilter, setAmountRangeFilter,
    page, setPage, jumpPage, setJumpPage, failurePage, setFailurePage,
    failureJumpPage, setFailureJumpPage, rowsPerPage, setRowsPerPage,
    expandedId, setExpandedId, selectedIntentId, setSelectedIntentId,
    liveIntentDrawerApi,
    filteredIntents, filteredFailures, pageRows, failurePageRows,
    intentTotal, failureTotal, apiIntentTotal, apiFailureTotal, tableFiltersActive,
    safePage, safeFailurePage, totalPages, failureTotalPages,
    selectedBatch, selectedBatchId, journalUsesBackendFeed, liveDetailLoading,
    clearTableFilters, batches,
  } = vm
  const journalEnabled = Boolean(journalUsesBackendFeed)
  const [manualReviewRow, setManualReviewRow] = useState<FailureRow | null>(null)

  return (
    <>
            <div className={`relative mb-4 overflow-hidden ${COMMAND_CENTER_KPI_CARD} p-4`}>
              <CommandCenterCardGlow />
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label htmlFor="journal-table-search" className={JOURNAL_FILTER_LABEL}>
                    Search
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" aria-hidden>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      id="journal-table-search"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder={
                        activeTab === 'transactions'
                          ? intentJournalCopy.table.searchPlaceholder
                          : 'Search review items — reason, stage, envelope…'
                      }
                      className={`${filterInputClass} pl-9`}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!selectedBatch}
                    onClick={() => {
                      if (selectedBatch) setFilterBatchId(selectedBatch.batchId)
                    }}
                    className="h-9 shrink-0 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[15px] font-medium text-[#334155] shadow-sm transition hover:bg-[#f1f5f9]"
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
                  <select value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRangePreset)} className={filterSelectClass}>
                    {DATE_RANGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Batch ID</label>
                  <input
                    value={filterBatchId}
                    onChange={(e) => setFilterBatchId(e.target.value)}
                    placeholder="e.g. B-2026-022"
                    className={filterInputClass}
                  />
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Connector</label>
                  <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value as (typeof CONNECTOR_OPTIONS)[number])} className={filterSelectClass}>
                    {CONNECTOR_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Status</label>
                  {activeTab === 'transactions' ? (
                    <select value={intentStatusFilter} onChange={(e) => setIntentStatusFilter(e.target.value as 'All' | IntentStatus)} className={filterSelectClass}>
                      <option value="All">All statuses</option>
                      <option value="Ready to Process">Ready to process</option>
                    </select>
                  ) : (
                    <select
                      value={failureStageFilter}
                      onChange={(e) => setFailureStageFilter(e.target.value as 'All' | FailureRow['failureStage'])}
                      className={filterSelectClass}
                    >
                      <option value="All">All stages</option>
                      <option value="Validation">Validation</option>
                      <option value="Dispatch">Dispatch</option>
                      <option value="Processing">Processing</option>
                      <option value="Settlement">Settlement</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Dispatch mode</label>
                  <select value={dispatchModeFilter} onChange={(e) => setDispatchModeFilter(e.target.value as (typeof DISPATCH_OPTIONS)[number])} className={filterSelectClass}>
                    {DISPATCH_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m === 'All' ? 'All rails' : m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={JOURNAL_FILTER_LABEL}>Amount range</label>
                  <select
                    value={amountRangeFilter as AmountRangeFilter}
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

            {activeTab === 'transactions' ? (
              <section className={`overflow-hidden ${COMMAND_CENTER_KPI_CARD}`}>
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>Intent table — selected batch</p>
                  <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
                    {tableFiltersActive && apiIntentTotal != null ? (
                      <>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-700">
                          {apiIntentTotal.toLocaleString('en-US')} total
                        </span>{' '}
                        ·{' '}
                      </>
                    ) : null}
                    <span className="rounded-full border border-black/30 bg-black px-2 py-0.5 text-[12px] font-semibold text-white">
                      {intentTotal.toLocaleString('en-US')} rows
                    </span>{' '}
                    match filters
                  </p>
                </div>
                <div className="min-w-0 overflow-x-auto">
                    <table className={`w-full border-collapse text-[14px] ${HOME_TITLE_BLACK}`}>
                      <thead className="bg-[#f8fafc]">
                        <tr>
                          {INTENT_TABLE_HEADERS.map((h) => (
                            <th
                              key={h.key}
                              className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#888888] whitespace-nowrap"
                            >
                              {h.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.length === 0 ? (
                          <tr>
                            <td colSpan={INTENT_TABLE_COL_COUNT} className="px-4 py-12 text-center text-[14px] text-[#64748b]">
                              No intents match your filters for this batch.
                            </td>
                          </tr>
                        ) : (
                          pageRows.map((row, rowIndex) => (
                          <Fragment key={row.requestId}>
                            <tr
                              onClick={() => {
                                setSelectedIntentId(row.requestId)
                                setExpandedId((current) => (current === row.requestId ? null : row.requestId))
                              }}
                              className={`cursor-pointer border-t border-[#f3f4f6] ${selectedIntentId === row.requestId ? 'bg-[#f8fafc]' : rowIndex % 2 === 1 ? 'bg-slate-50/40 hover:bg-[#f9fafb]' : 'hover:bg-[#f9fafb]'}`}
                            >
                              <td className="truncate px-3 py-2.5 font-mono text-[12px] text-[#334155]" title={row.zordId ?? row.requestId}>
                                {row.zordId ?? row.requestId}
                              </td>
                              <td className="truncate px-3 py-2.5 text-[13px] text-[#334155]" title={row.reference}>
                                {row.reference}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                                {formatJournalMoney(
                                  row.amount,
                                  row.currency ?? (journalUsesBackendFeed ? 'INR' : 'USD'),
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[13px] font-medium ${intentStatusClass(row.status)}`}>
                                  {intentStatusLabel(row.status)}
                                </span>
                              </td>
                              <td className="truncate px-3 py-2.5 text-[13px] text-[#334155]" title={row.intendedExecutionAt}>
                                {row.intendedExecutionAt}
                              </td>
                              <td className="truncate px-3 py-2.5 text-[13px] font-medium text-[#334155]" title={row.rail && row.rail !== '—' ? row.rail : row.method}>
                                {row.rail && row.rail !== '—' ? row.rail : row.method}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-semibold text-[#0f172a]">{row.confidenceLabel}</td>
                            </tr>
                            {expandedId === row.requestId ? (
                              <tr className="bg-slate-50">
                                <td colSpan={INTENT_TABLE_COL_COUNT} className="px-3 pb-4 pt-3">
                                  {row.rawIntent ? (
                                    <div className="space-y-3">
                                      <p className="text-[14px] font-semibold text-[#0f172a]">Intent details</p>
                                      <IntentEngineDetailPanel intent={row.rawIntent} />
                                    </div>
                                  ) : (
                                    (() => {
                                      const detail: IntentDetail = buildLiveIntentDetailFromRowAndApi(
                                        {
                                          requestId: row.requestId,
                                          batchId: row.batchId,
                                          clientBatchRef: row.clientBatchRef,
                                          clientPayoutRef: row.reference,
                                          sourceRowNum: row.sourceRowNum ?? null,
                                          amount: row.amount,
                                          method: row.method,
                                          rail: row.rail,
                                          beneficiaryName: row.beneficiaryName ?? null,
                                          paymentPartner: row.paymentPartner,
                                          bank: row.bank,
                                          uiStatus: row.status,
                                        },
                                        journalUsesBackendFeed && expandedId === row.requestId ? liveIntentDrawerApi : null,
                                      )
                                      return (
                                        <div className="space-y-3">
                                          <div className="border-b border-[#E5E5E5] pb-2">
                                            <p className="text-[18px] font-semibold text-[#0f172a]">{detail.beneficiaryFull}</p>
                                            <p className="mt-0.5 font-mono text-[13px] text-[#64748b]">
                                              {detail.intentId} · {detail.beneficiaryToken}
                                            </p>
                                          </div>
                                          <BankingInformationTokensBlock detail={detail} />
                                          {(row.clientBatchRef || row.batchId) ? (
                                            <Link
                                              href={`/payout-command-view/today?dock=settlement&client_batch_id=${encodeURIComponent(row.clientBatchRef || row.batchId)}`}
                                              className="inline-flex text-[13px] font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4"
                                            >
                                              Open settlement journal for this batch →
                                            </Link>
                                          ) : null}
                                        </div>
                                      )
                                    })()
                                  )}
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                          ))
                        )}
                      </tbody>
                    </table>
                </div>
                <div className="border-t border-slate-200/80 bg-[#f8fbff] px-3 py-2 text-[15px] text-[#64748b]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Showing {(intentTotal === 0 ? 0 : (safePage - 1) * rowsPerPage + 1)}-
                        {intentTotal === 0 ? 0 : Math.min(safePage * rowsPerPage, intentTotal)} of{' '}
                        {intentTotal.toLocaleString('en-US')} intents
                      </span>
                      <div className="flex items-center gap-2">
                        <span>Rows per page:</span>
                        <select
                          value={rowsPerPage}
                          onChange={(e) => {
                            setRowsPerPage(Number(e.target.value) as (typeof ROW_SIZE_OPTIONS)[number])
                            setPage(1)
                            setJumpPage('1')
                            setFailurePage(1)
                            setFailureJumpPage('1')
                          }}
                          className="rounded border border-[#e5e7eb] bg-white px-2 py-1 text-[15px]"
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
                        className="rounded border border-[#e5e7eb] bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span>
                        Page {safePage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="rounded border border-[#e5e7eb] bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                      <span className="ml-2">Go to page</span>
                      <input value={jumpPage} onChange={(e) => setJumpPage(e.target.value.replace(/[^0-9]/g, ''))} className="w-16 rounded border border-[#e5e7eb] px-2 py-1" />
                      <button
                        type="button"
                        className="rounded border border-[#e5e7eb] bg-white px-2 py-1"
                        onClick={() => {
                          const target = Number(jumpPage)
                          if (!Number.isFinite(target) || target < 1) return
                          setPage(Math.min(totalPages, target))
                        }}
                      >
                        Go
                      </button>
                    </div>
                </div>
              </section>
            ) : null}

            {activeTab === 'failures' ? (
              <section className={`overflow-hidden ${COMMAND_CENTER_KPI_CARD}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <p className={`text-[14px] font-medium ${HOME_TITLE_BLACK}`}>Failed intents (DLQ)</p>
                    <p className={HOME_BODY_IMPERIAL_SM}>
                      {tableFiltersActive && apiFailureTotal != null ? (
                        <>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-slate-700">
                            {apiFailureTotal.toLocaleString('en-US')} total
                          </span>{' '}
                          ·{' '}
                        </>
                      ) : null}
                      <span className="rounded-full border border-red-200/80 bg-red-50 px-2 py-0.5 text-[12px] font-semibold text-red-800">
                        {failureTotal.toLocaleString('en-US')} rows
                      </span>{' '}
                      match filters
                    </p>
                    <p className={`mt-1 max-w-3xl ${HOME_BODY_IMPERIAL_SM}`}>
                      This table is only{' '}
                      <span className="font-medium text-[#475569]">intent-engine DLQ</span> (dead-lettered envelopes /
                      ingress failures). One bulk upload can create both payment intents and DLQ rows in the DB — accepted
                      rows appear under <span className="font-medium text-[#475569]">Intents</span>; dead-lettered rows
                      appear here.
                    </p>
                    {journalUsesBackendFeed && failureTotal === 0 ? (
                      <p className={`mt-1 max-w-3xl ${HOME_BODY_IMPERIAL_SM}`}>
                        No DLQ rows for this batch. DLQ from your upload may use a different batch id or workspace than the
                        session scope above.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={filteredFailures.length === 0}
                      onClick={() => downloadFailuresCsv(filteredFailures, selectedBatchId)}
                      className="h-8 rounded-lg border border-[#e2e8f0] bg-white px-2.5 text-[15px] font-medium text-[#475569] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Export
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className={`w-full border-collapse text-[14px] ${HOME_TITLE_BLACK}`}>
                    <thead className="bg-[#f8fafc]">
                      <tr>
                          {[
                          { key: 'zordId', label: intentJournalCopy.table.headers.zordId, icon: 'reference' as const },
                            { key: 'rownum', label: 'Row #', icon: 'reference' as const },
                          { key: 'amount', label: 'Amount', icon: 'amount' as const },
                          { key: 'connector', label: 'Connector', icon: 'payment' as const },
                          { key: 'reason', label: 'Failure Reason', icon: 'status' as const },
                          { key: 'status', label: 'Status', icon: 'status' as const },
                          { key: 'updated', label: 'Updated', icon: 'updated' as const },
                        ].map((h) => (
                          <th key={h.key} className={`px-3 py-2.5 text-left ${COMMAND_CENTER_LABEL_GREEN}`}>
                            <span className="inline-flex items-center gap-1.5">
                              <HeaderIcon kind={h.icon} />
                              {h.label}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {failurePageRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-[14px] text-[#64748b]">
                            No failures match your filters for this batch.
                          </td>
                        </tr>
                      ) : (
                        failurePageRows.map((row, rowIndex) => (
                        <tr
                          key={row.requestId}
                          className={`border-t border-[#f3f4f6] hover:bg-[#f9fafb] ${rowIndex % 2 === 1 ? 'bg-slate-50/40' : ''}`}
                        >
                          <td
                            className="truncate px-3 py-2.5 font-mono text-[12px] text-[#334155]"
                            title={row.zordId ?? row.requestId}
                          >
                            {row.zordId ?? row.requestId}
                          </td>
                          <td className="px-3 py-2.5 text-[15px] text-[#475569] tabular-nums">
                            {row.sourceRowNum ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {Number.isFinite(row.amount)
                              ? formatJournalMoney(row.amount, row.currency ?? 'INR')
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            {row.paymentPartner && row.paymentPartner !== '—' ? (
                              <EntityLogo name={row.paymentPartner} kind="psp" size={18} />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-rose-700">{row.failureReason}</td>
                          <td className="px-3 py-2.5 min-w-[9.5rem]">
                            <button
                              type="button"
                              onClick={() => setManualReviewRow(row)}
                              className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border border-[#0f172a] bg-[#0f172a] px-3 text-[12px] font-medium text-white transition hover:bg-[#1e293b]"
                            >
                              Manual review
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-[#64748b]">{row.lastUpdated}</td>
                        </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-200/80 bg-[#f8fbff] px-3 py-2 text-[15px] text-[#64748b]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Showing {(failureTotal === 0 ? 0 : (safeFailurePage - 1) * rowsPerPage + 1)}-
                      {failureTotal === 0 ? 0 : Math.min(safeFailurePage * rowsPerPage, failureTotal)} of{' '}
                      {failureTotal.toLocaleString('en-US')} failures
                    </span>
                    <div className="flex items-center gap-2">
                      <span>Rows per page:</span>
                      <select
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value) as (typeof ROW_SIZE_OPTIONS)[number])
                          setPage(1)
                          setJumpPage('1')
                          setFailurePage(1)
                          setFailureJumpPage('1')
                        }}
                        className="rounded border border-[#e5e7eb] bg-white px-2 py-1 text-[15px]"
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
                      onClick={() => setFailurePage((p) => Math.max(1, p - 1))}
                      disabled={safeFailurePage <= 1}
                      className="rounded border border-[#e5e7eb] bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span>
                      Page {safeFailurePage} / {failureTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFailurePage((p) => Math.min(failureTotalPages, p + 1))}
                      disabled={safeFailurePage >= failureTotalPages}
                      className="rounded border border-[#e5e7eb] bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                    <span className="ml-2">Go to page</span>
                    <input
                      value={failureJumpPage}
                      onChange={(e) => setFailureJumpPage(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-16 rounded border border-[#e5e7eb] px-2 py-1"
                    />
                    <button
                      type="button"
                      className="rounded border border-[#e5e7eb] bg-white px-2 py-1"
                      onClick={() => {
                        const target = Number(failureJumpPage)
                        if (!Number.isFinite(target) || target < 1) return
                        setFailurePage(Math.min(failureTotalPages, target))
                      }}
                    >
                      Go
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

      {manualReviewRow ? (
        <ManualReviewEscalationModal
          row={manualReviewRow}
          isSandboxRoute={isSandboxRoute}
          onClose={() => setManualReviewRow(null)}
        />
      ) : null}
    </>
  )
}
