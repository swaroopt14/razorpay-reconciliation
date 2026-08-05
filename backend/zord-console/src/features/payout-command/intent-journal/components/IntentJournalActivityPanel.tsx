'use client'

import Link from 'next/link'
import { Fragment, useState, type Dispatch, type SetStateAction } from 'react'
import { BankingInformationTokensBlock } from '../IntentDrawerSections'
import { formatJournalMoney } from '../formatJournalMoney'
import { downloadFailuresCsv } from '../journalExport'
import { IntentEngineDetailPanel } from '../IntentEngineDetailPanel'
import type { IntentDetail } from '@/services/payout-command/intent-journal-types'
import { buildLiveIntentDetailFromRowAndApi } from '@/services/payout-command/liveJournalIntentDetail'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
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
  '₹10,000 - ₹1,00,000',
  'Over ₹1,00,000',
] as const
type AmountRangeFilter = (typeof AMOUNT_RANGE_OPTIONS)[number]

type FailureRow = JournalFailureRow
type StateSetter<T> = Dispatch<SetStateAction<T>>

const filterSelectClass =
  'h-9 w-full min-w-[7.5rem] rounded-xl border border-slate-200/90 bg-slate-50 px-2.5 text-[14px] text-slate-900 outline-none transition focus:border-[#0B1324]/20/55 focus:bg-white focus:ring-2 focus:ring-[#0B1324]/20'

const filterInputClass =
  'h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50 px-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0B1324]/20/55 focus:bg-white focus:ring-2 focus:ring-[#0B1324]/20'

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'transactions', label: intentJournalCopy.tabs.instructions },
  { key: 'failures', label: intentJournalCopy.tabs.reviewItems },
]

const ROW_SIZE_OPTIONS = [20, 50, 100, 200] as const

const INTENT_TABLE_COL_COUNT = 8

/** Original journal columns + currency / dispatch score. Payment Mode = API rail_hint. */
const INTENT_TABLE_HEADERS: { key: string; label: string }[] = [
  { key: 'zordId', label: intentJournalCopy.table.headers.zordId },
  { key: 'paymentRef', label: intentJournalCopy.table.headers.paymentRef },
  { key: 'amount', label: intentJournalCopy.table.headers.amount },
  { key: 'currentStatus', label: intentJournalCopy.table.headers.currentStatus },
  { key: 'plannedPaymentDate', label: intentJournalCopy.table.headers.plannedPaymentDate },
  { key: 'paymentMode', label: intentJournalCopy.table.headers.paymentMode },
  { key: 'currency', label: intentJournalCopy.table.headers.currency },
  { key: 'dispatchScore', label: intentJournalCopy.table.headers.dispatchScore },
]

const TABLE_HEAD_CELL =
  'px-6 py-4 text-left text-[13px] font-semibold text-[#64748B] whitespace-nowrap'
const TABLE_CELL = 'px-6 py-5 align-middle text-[14px] text-[#334155]'
const TABLE_ROW = 'cursor-pointer border-t border-[#EEF1F5] transition hover:bg-[#F8FAFC]'

/** Reference-style amount: full value with muted decimals. */
function MoneyCell({ amount, currency }: { amount: number; currency: string }) {
  const formatted = formatJournalMoney(amount, currency)
  if (formatted === '-') return <span className="text-[#94A3B8]">-</span>
  const match = formatted.match(/^(.*)(\.\d{2})$/)
  if (!match) return <span>{formatted}</span>
  return (
    <span>
      {match[1]}
      <span className="text-[13px] text-[#94A3B8]">{match[2]}</span>
    </span>
  )
}

function intentStatusLabel(row: JournalIntentRow): string {
  return row.lifecycleStage || intentRowCustomerStatus(row.status) || row.status || '-'
}

/** Solid status chips, matching the payments-dashboard reference. */
function statusPillClass(label: string): string {
  const s = label.toLowerCase()
  if (s.includes('block') || s.includes('fail')) return 'bg-[#EF4444] text-white'
  if (s.includes('review') || s.includes('pend')) return 'bg-[#F59E0B] text-white'
  if (s.includes('dispatch') || s.includes('sealed') || s.includes('captur')) return 'bg-[#16A34A] text-white'
  return 'bg-[#E8EEF9] text-[#1E3A8A]'
}

function StatusPill({ label }: { label: string }) {
  if (!label || label === '-') return <span className="text-[#94A3B8]">-</span>
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold ${statusPillClass(label)}`}
    >
      {label}
    </span>
  )
}

function RailChip({ label }: { label: string }) {
  if (!label || label === '-') return <span className="text-[#94A3B8]">-</span>
  return <span className="whitespace-nowrap font-medium text-[#475569]">{label}</span>
}

function formatDispatchScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return '-'
  const pct = score <= 1 ? score * 100 : score
  return `${pct.toFixed(0)}%`
}

function failureRailLabel(row: FailureRow): string {
  if (row.rail && row.rail !== '-') return row.rail
  if (row.method && row.method !== '-') return row.method
  if (row.paymentPartner && row.paymentPartner !== '-') return row.paymentPartner
  return '-'
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
                          : 'Search review items - reason, stage, envelope…'
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
                <div className="border-b border-[#EEF1F5] bg-white px-5 py-4">
                  <p className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
                    {intentTotal.toLocaleString('en-IN')} instruction{intentTotal === 1 ? '' : 's'}
                    {tableFiltersActive && apiIntentTotal != null
                      ? ` · filtered from ${apiIntentTotal.toLocaleString('en-IN')}`
                      : ''}
                  </p>
                  <p className="mt-1 text-[13px] text-[#94A3B8]">
                    Click a row for details · status · planned date · payment mode · currency · dispatch score
                  </p>
                </div>
                <div className="min-w-0 overflow-x-auto">
                    <table className={`w-full min-w-[72rem] border-collapse text-[14px] ${HOME_TITLE_BLACK}`}>
                      <thead className="border-b border-[#E5E9F0] bg-[#F5F7FA]">
                        <tr>
                          {INTENT_TABLE_HEADERS.map((h) => (
                            <th
                              key={h.key}
                              className={`${TABLE_HEAD_CELL} ${
                                h.key === 'amount' || h.key === 'dispatchScore' ? 'text-right' : ''
                              }`}
                            >
                              {h.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.length === 0 ? (
                          <tr>
                            <td colSpan={INTENT_TABLE_COL_COUNT} className="px-5 py-16 text-center text-[14px] text-[#94A3B8]">
                              No intents match your filters for this batch.
                            </td>
                          </tr>
                        ) : (
                          pageRows.map((row) => (
                          <Fragment key={row.requestId}>
                            <tr
                              onClick={() => {
                                setSelectedIntentId(row.requestId)
                                setExpandedId((current) => (current === row.requestId ? null : row.requestId))
                              }}
                              className={`${TABLE_ROW} ${selectedIntentId === row.requestId ? 'bg-[#F8FAFC]' : ''}`}
                            >
                              <td
                                className={`${TABLE_CELL} whitespace-nowrap font-mono text-[13px] font-medium text-[#2563EB]`}
                                title={row.zordId ?? row.requestId}
                              >
                                {row.zordId ?? row.requestId}
                              </td>
                              <td
                                className={`${TABLE_CELL} whitespace-nowrap font-mono text-[13px] text-[#2563EB]`}
                                title={row.reference}
                              >
                                {row.reference}
                              </td>
                              <td className={`${TABLE_CELL} whitespace-nowrap text-right font-medium tabular-nums text-[#0F172A]`}>
                                <MoneyCell
                                  amount={row.amount}
                                  currency={row.currency ?? (journalUsesBackendFeed ? 'INR' : 'USD')}
                                />
                              </td>
                              <td className={TABLE_CELL}>
                                <StatusPill label={intentStatusLabel(row)} />
                              </td>
                              <td className={`${TABLE_CELL} whitespace-nowrap text-[#64748B]`}>
                                {row.intendedExecutionAt || '-'}
                              </td>
                              <td className={TABLE_CELL}>
                                <RailChip label={row.rail && row.rail !== '-' ? row.rail : row.paymentMethodDetail || '-'} />
                              </td>
                              <td className={`${TABLE_CELL} uppercase tracking-wide text-[#64748B]`}>
                                {row.currency ?? 'INR'}
                              </td>
                              <td className={`${TABLE_CELL} text-right font-semibold tabular-nums text-[#0F172A]`}>
                                {formatDispatchScore(row.confidenceScore)}
                              </td>
                            </tr>
                            {expandedId === row.requestId ? (
                              <tr className="bg-slate-50">
                                <td colSpan={INTENT_TABLE_COL_COUNT} className="px-3 pb-4 pt-3">
                                  {row.rawIntent ? (
                                    <div className="space-y-3">
                                      <p className="text-[14px] font-semibold text-[#0f172a]">Intent details</p>
                                      <p className="text-[13px] text-[#475569]">
                                        {row.readinessReason || row.infoSummary}
                                      </p>
                                      <p className="text-[12px] text-[#64748B]">
                                        Change signal · {row.changeSignal || 'No material change'}
                                      </p>
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
                                            <p className="mt-2 text-[13px] text-[#475569]">
                                              {row.readinessReason || 'See policy and source integrity for seal readiness.'}
                                            </p>
                                            <p className="mt-1 text-[12px] text-[#64748B]">
                                              Change signal · {row.changeSignal || 'No material change'}
                                              {row.actionContract === 'Ready' || row.actionContract === 'Sealed' ? (
                                                <>
                                                  {' · '}
                                                  <span className="font-semibold text-[#0B1324]">
                                                    {intentJournalCopy.actions.openContract}
                                                  </span>
                                                </>
                                              ) : null}
                                            </p>
                                          </div>
                                          <BankingInformationTokensBlock detail={detail} />
                                          {(row.clientBatchRef || row.batchId) ? (
                                            <Link
                                              href={`/settlement/journal?demo=sandbox&client_batch_id=${encodeURIComponent(row.clientBatchRef || row.batchId)}`}
                                              className="inline-flex text-[13px] font-semibold text-[#0B1324] underline decoration-[#0B1324]/30 underline-offset-4"
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
                <div className="border-t border-[#E5E9F0] bg-[#FBFCFE] px-6 py-4 text-[14px] text-[#64748b]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                <div className="border-b border-[#EEF1F5] bg-white px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
                        {failureTotal.toLocaleString('en-IN')} review item{failureTotal === 1 ? '' : 's'}
                        {tableFiltersActive && apiFailureTotal != null
                          ? ` · filtered from ${apiFailureTotal.toLocaleString('en-IN')}`
                          : ''}
                      </p>
                      <p className="mt-1 text-[13px] text-[#94A3B8]">
                        Click a row for manual review · status · planned date · payment mode · currency · dispatch score
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={filteredFailures.length === 0}
                      onClick={() => downloadFailuresCsv(filteredFailures, selectedBatchId)}
                      className="h-8 rounded-lg border border-[#e2e8f0] bg-white px-2.5 text-[13px] font-medium text-[#475569] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Export
                    </button>
                  </div>
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <table className={`w-full min-w-[72rem] border-collapse text-[14px] ${HOME_TITLE_BLACK}`}>
                    <thead className="border-b border-[#E5E9F0] bg-[#F5F7FA]">
                      <tr>
                        {INTENT_TABLE_HEADERS.map((h) => (
                          <th
                            key={h.key}
                            className={`${TABLE_HEAD_CELL} ${
                              h.key === 'amount' || h.key === 'dispatchScore' ? 'text-right' : ''
                            }`}
                          >
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {failurePageRows.length === 0 ? (
                        <tr>
                          <td colSpan={INTENT_TABLE_COL_COUNT} className="px-5 py-16 text-center text-[14px] text-[#94A3B8]">
                            {intentJournalCopy.table.emptyReview}
                          </td>
                        </tr>
                      ) : (
                        failurePageRows.map((row) => (
                          <tr
                            key={row.requestId}
                            onClick={() => setManualReviewRow(row)}
                            className={TABLE_ROW}
                            title={row.failureReason}
                          >
                            <td
                              className={`${TABLE_CELL} whitespace-nowrap font-mono text-[13px] font-medium text-[#2563EB]`}
                              title={row.zordId ?? row.requestId}
                            >
                              {row.zordId ?? row.requestId}
                            </td>
                            <td
                              className={`${TABLE_CELL} whitespace-nowrap font-mono text-[13px] text-[#2563EB]`}
                              title={row.reference}
                            >
                              {row.reference}
                            </td>
                            <td className={`${TABLE_CELL} whitespace-nowrap text-right font-medium tabular-nums text-[#0F172A]`}>
                              <MoneyCell amount={row.amount} currency={row.currency ?? 'INR'} />
                            </td>
                            <td className={TABLE_CELL}>
                              <StatusPill label={row.dlqStatusLabel || row.failureStage || '-'} />
                            </td>
                            <td className={`${TABLE_CELL} whitespace-nowrap text-[#64748B]`}>
                              {row.lastUpdated || '-'}
                            </td>
                            <td className={TABLE_CELL}>
                              <RailChip label={failureRailLabel(row)} />
                            </td>
                            <td className={`${TABLE_CELL} uppercase tracking-wide text-[#64748B]`}>
                              {row.currency ?? 'INR'}
                            </td>
                            <td className={`${TABLE_CELL} text-right font-semibold tabular-nums text-[#CBD5E1]`}>-</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-[#E5E9F0] bg-[#FBFCFE] px-6 py-4 text-[14px] text-[#64748b]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
