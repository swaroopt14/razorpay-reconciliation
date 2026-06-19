'use client'

import {
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import {
  BATCH_FILTERS,
  JOURNAL_BORDER,
  confidencePctFromBatch,
  BATCH_AGGREGATE_STATUS_GUIDE,
  mergeBatchAggregateScore,
  neutralHealthTone,
  resolveBatchHealthStatus,
  statusTone,
  type BatchFilter,
  type BatchRecord,
} from '../intentJournalSidebarUtils'

export type IntentJournalBatchSidebarProps = {
  batches: BatchRecord[]
  batchFilter: BatchFilter
  setBatchFilter: (filter: BatchFilter) => void
  setSidebarPage: (updater: (page: number) => number) => void
  journalUsesBackendFeed: boolean
  sidebarPageRows: BatchRecord[]
  selectedBatchId: string
  selectBatch: (batchId: string) => void
  selectedEngineIntentTotal: number | null
  safeSidebarPage: number
  sidebarTotalPages: number
  needsAttentionCount: number
  /** Selected batch enriched with payment-intent aggregate score. */
  selectedMetricsBatch?: BatchRecord | null
}

function formatIntentTotal(total: number | null): string {
  if (total == null) return '—'
  return `${total.toLocaleString('en-US')} intents`
}

export function IntentJournalBatchSidebar({
  batches,
  batchFilter,
  setBatchFilter,
  setSidebarPage,
  journalUsesBackendFeed,
  sidebarPageRows,
  selectedBatchId,
  selectBatch,
  selectedEngineIntentTotal,
  safeSidebarPage,
  sidebarTotalPages,
  needsAttentionCount,
  selectedMetricsBatch,
}: IntentJournalBatchSidebarProps) {
  return (
        <aside className={`flex h-full flex-col overflow-hidden border-r ${JOURNAL_BORDER} bg-white`}>
          <div className="border-b border-[#E5E5E5] px-4 pb-3 pt-4">
            <h2 className={`text-[14px] font-medium ${HOME_TITLE_BLACK}`}>Batches</h2>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
              {batches.length} batch{batches.length === 1 ? '' : 'es'}
            </p>
            <div className="mt-3">
              <select
                value={batchFilter}
                onChange={(e) => {
                  setBatchFilter(e.target.value as BatchFilter)
                  setSidebarPage(() => 1)
                }}
                className="w-full rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[15px] text-[#0f172a] shadow-sm"
              >
                {BATCH_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {journalUsesBackendFeed && sidebarPageRows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#E5E5E5] bg-slate-50 px-3 py-4 text-center text-[15px] leading-relaxed text-[#94a3b8]">
                No batches yet. Upload a payment file from Batch Command Center to get started.
              </p>
            ) : null}
            {sidebarPageRows.map((batch) => {
              const selected = batch.batchId === selectedBatchId
              const batchForHealth = mergeBatchAggregateScore(batch, {
                isSelected: selected,
                metricsBatch: selected ? selectedMetricsBatch : null,
              })
              const intentCount = selected ? selectedEngineIntentTotal : batch.transactions > 0 ? batch.transactions : null
              const engineConfPct = confidencePctFromBatch(batchForHealth)
              const status = resolveBatchHealthStatus(batchForHealth)
              const sidebarScoreDisplay = engineConfPct != null ? `${engineConfPct}%` : '—'
              const progressWidthPct = engineConfPct ?? 0
              const tone = status ? statusTone(status) : neutralHealthTone()
              const dotColor =
                status === 'Stable'
                  ? 'bg-black'
                  : status === 'At Risk'
                    ? 'bg-amber-500'
                    : status === 'Critical'
                      ? 'bg-rose-500'
                      : 'bg-slate-300'

              return (
                <button
                  key={batch.batchId}
                  type="button"
                  onClick={() => selectBatch(batch.batchId)}
                  className={`mb-1.5 w-full rounded-[10px] border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-[#111111] bg-slate-100'
                      : 'border-transparent hover:border-[#E5E5E5] hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden />
                      <span className={`truncate text-[14px] font-medium ${HOME_TITLE_BLACK}`}>{batch.batchId}</span>
                    </div>
                    <span
                      className={`shrink-0 text-[15px] font-semibold tabular-nums ${tone.text}`}
                      title={`Aggregate confidence · ${BATCH_AGGREGATE_STATUS_GUIDE}`}
                    >
                      {sidebarScoreDisplay}
                    </span>
                  </div>

                  <div className="mt-0.5 pl-4 text-[14px] text-[#64748b]">
                    <span className="tabular-nums">{formatIntentTotal(intentCount)}</span>
                  </div>
                  {status ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-4">
                      <div
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${tone.text} ${
                          status === 'At Risk'
                            ? 'bg-amber-100'
                            : status === 'Critical'
                              ? 'bg-rose-100'
                              : 'bg-neutral-100'
                        }`}
                        title={BATCH_AGGREGATE_STATUS_GUIDE}
                      >
                        {status}
                      </div>
                    </div>
                  ) : null}

                  {selected && engineConfPct != null ? (
                    <div className="mt-2 pl-4">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                        <div
                          className={`h-full rounded-full ${
                            status === 'Stable'
                              ? 'bg-black'
                              : status === 'At Risk'
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                          }`}
                          style={{ width: `${progressWidthPct}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="border-t border-[#E5E5E5] bg-slate-50 px-3 py-2 text-[15px] text-[#64748b]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSidebarPage((p) => Math.max(1, p - 1))}
                disabled={safeSidebarPage <= 1}
                className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="tabular-nums">
                {safeSidebarPage} / {sidebarTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setSidebarPage((p) => Math.min(sidebarTotalPages, p + 1))}
                disabled={safeSidebarPage >= sidebarTotalPages}
                className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
            <p className="mt-1 text-center text-[14px]">
              {batches.length} active · {needsAttentionCount} need attention
            </p>
          </div>
        </aside>
  )
}
