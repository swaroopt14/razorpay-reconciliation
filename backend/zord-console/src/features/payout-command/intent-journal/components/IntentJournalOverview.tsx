'use client'

import { useRouter } from 'next/navigation'
import {
  confidencePctFromBatch,
  resolveBatchHealthStatus,
  type BatchFilter,
  type BatchRecord,
  BATCH_FILTERS,
} from '../intentJournalSidebarUtils'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import {
  markBatchDispatched,
  useDemoBatchReady,
  useDispatchedBatchId,
} from '@/services/payout-command/demo/demoBatchReadiness'
import { DEMO_BATCH_LABEL, withDemoBatchScope } from '@/services/payout-command/demo/ycDemoConstants'
import { AwaitingUploadsEmptyState } from '../../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../../demo/PageExplainerBanner'
import { intentJournalCopy } from '../copy/intentJournalCopy'

function formatInr(major: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(major)
}

export type JournalOverviewSummary = {
  intendedValue: number
  instructionCount: number
  blockedValue: number
  blockedCount: number
  needsReviewCount: number
  sealEligibleCount: number
  readinessPctLabel: string
  /** Explains what the numbers are counted from */
  scopeLabel: string
}

type IntentJournalOverviewProps = {
  summary: JournalOverviewSummary
  batches: BatchRecord[]
  batchFilter: BatchFilter
  setBatchFilter: (f: BatchFilter) => void
  onOpenBatch: (batchId: string) => void
  page: number
  totalPages: number
  onPageChange: (updater: (p: number) => number) => void
  actions?: {
    onSealEligible?: () => void
    onValidate?: () => void
    onOpenReview?: () => void
    sealEligibleCount?: number
  }
}

/**
  * Spec 7.6 list page: summary + batches only.
  * Opening a batch navigates to a separate batch detail view (parent).
  */
export function IntentJournalOverview({
  summary,
  batches,
  batchFilter,
  setBatchFilter,
  onOpenBatch,
  page,
  totalPages,
  onPageChange,
  actions,
}: IntentJournalOverviewProps) {
  const router = useRouter()
  const { mode } = useEnvironment()
  const { ready, readiness } = useDemoBatchReady(undefined, { requireUploads: true })
  const dispatchedBatchId = useDispatchedBatchId()

  function dispatchBatch(batchId: string) {
    markBatchDispatched(batchId)
    router.push(withDemoBatchScope('/execution/dispatches', batchId))
  }

  return (
    <div className="space-y-5">
      <PageExplainerBanner page="intent" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {intentJournalCopy.pageTitle}
          </h1>
          <p className="mt-1 text-[13px] text-[#64748B]">{intentJournalCopy.pageSubtitle}</p>
        </div>
        {ready ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={actions?.onValidate}
              className="inline-flex h-9 items-center border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
            >
              {intentJournalCopy.actions.validate}
            </button>
            <button
              type="button"
              onClick={actions?.onOpenReview}
              className="inline-flex h-9 items-center border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
            >
              {intentJournalCopy.actions.openReview}
            </button>
            <button
              type="button"
              onClick={actions?.onSealEligible}
              disabled={!actions?.sealEligibleCount}
              className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
            >
              {intentJournalCopy.actions.sealEligible}
              {actions?.sealEligibleCount ? (
                <span className="ml-1.5 tabular-nums opacity-80">({actions.sealEligibleCount})</span>
              ) : null}
            </button>
          </div>
        ) : null}
      </header>

      {!ready ? (
        <AwaitingUploadsEmptyState title="No intent journal yet" readiness={readiness} />
      ) : (
        <>
          <section className="border border-[#E5E5E5] bg-white" aria-label="Overview summary">
            <div className="border-b border-[#E5E5E5] px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-[13px] font-medium text-[#64748B]">{intentJournalCopy.kpi.intendedValue}</p>
              <p className="mt-1 text-[2rem] font-semibold tracking-[-0.03em] text-[#0B1324] sm:text-[2.25rem]">
                {formatInr(summary.intendedValue)}
              </p>
              <p className="mt-1 text-[13px] text-[#94A3B8]">
                from {summary.instructionCount.toLocaleString('en-IN')} instruction
                {summary.instructionCount === 1 ? '' : 's'}
                <span className="mx-1.5 text-[#E2E8F0]">·</span>
                {summary.scopeLabel}
              </p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-[#E5E5E5] sm:grid-cols-4 sm:divide-y-0">
              <SummaryCell
                label={intentJournalCopy.kpi.instructions}
                value={summary.instructionCount.toLocaleString('en-IN')}
                hint="Across batches in this list"
              />
              <SummaryCell
                label={intentJournalCopy.kpi.readiness}
                value={summary.readinessPctLabel}
                hint="Open a batch for exact readiness"
              />
              <SummaryCell
                label={intentJournalCopy.kpi.blockedValue}
                value={formatInr(summary.blockedValue)}
                hint={
                  summary.blockedCount > 0
                    ? `${summary.blockedCount} blocked · pre-dispatch`
                    : intentJournalCopy.kpi.blockedValueHint
                }
              />
              <SummaryCell
                label={intentJournalCopy.kpi.needsReview}
                value={summary.needsReviewCount.toLocaleString('en-IN')}
                hint="Batches needing attention"
              />
            </div>
          </section>

          <section className="border border-[#E5E5E5] bg-white" aria-label="Batches">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] px-5 py-3.5">
              <div>
                <p className="text-[14px] font-semibold text-[#0B1324]">Batches</p>
                <p className="text-[12px] text-[#64748B]">
                  {batches.length} batch{batches.length === 1 ? '' : 'es'} · open to view intents
                </p>
              </div>
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value as BatchFilter)}
                className="h-9 border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0B1324]"
              >
                {BATCH_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            {batches.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[#94A3B8]">
                No batches yet. Upload from Batch Command Center to get started.
              </p>
            ) : (
              <ul className="divide-y divide-[#E5E5E5]">
                {batches.map((batch) => {
                  const conf = confidencePctFromBatch(batch)
                  const health = resolveBatchHealthStatus(batch)
                  const intentCount = batch.transactions > 0 ? batch.transactions : null
                  return (
                    <li key={batch.batchId} className="flex items-center gap-4 bg-white px-5 py-3.5 transition hover:bg-[#FAFAFA]">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${health ? 'bg-[#0B1324]' : 'bg-slate-300'}`}
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => onOpenBatch(batch.batchId)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="flex items-center gap-2 truncate text-[13px] font-semibold text-[#0B1324]">
                          {mode === 'sandbox' ? DEMO_BATCH_LABEL : batch.batchId}
                          {dispatchedBatchId === batch.batchId ? (
                            <span className="inline-flex h-5 items-center bg-[#0B1324] px-2 text-[10px] font-bold uppercase tracking-wide text-white">
                              Dispatched
                            </span>
                          ) : null}
                        </p>
                        {mode === 'sandbox' ? (
                          <p className="mt-0.5 font-mono text-[11px] text-[#94A3B8]">{batch.batchId}</p>
                        ) : null}
                        <p className="mt-0.5 text-[12px] text-[#64748B]">
                          {intentCount != null
                            ? `${intentCount.toLocaleString('en-IN')} intents`
                            : '- intents'}
                          <span className="mx-1.5 text-[#E2E8F0]">·</span>
                          {formatInr(batch.totalValue)}
                          {conf != null ? (
                            <>
                              <span className="mx-1.5 text-[#E2E8F0]">·</span>
                              {conf}% readiness
                            </>
                          ) : null}
                        </p>
                      </button>
                      {dispatchedBatchId === batch.batchId ? (
                        <button
                          type="button"
                          onClick={() => router.push(withDemoBatchScope('/execution/dispatches', batch.batchId))}
                          className="inline-flex h-8 shrink-0 items-center border border-[#CBD5E1] bg-white px-3 text-[12px] font-semibold text-[#0B1324] transition hover:bg-[#F1F5F9]"
                        >
                          View dispatch →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => dispatchBatch(batch.batchId)}
                          className="inline-flex h-8 shrink-0 items-center bg-[#2E5BFF] px-3 text-[12px] font-semibold text-white transition hover:bg-[#2448D4]"
                        >
                          Dispatch
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenBatch(batch.batchId)}
                        className="shrink-0 text-[12px] font-semibold text-[#2563EB] hover:underline"
                      >
                        Open →
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-[#E5E5E5] px-5 py-2.5 text-[12px] text-[#64748B]">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPageChange((p) => Math.max(1, p - 1))}
                    className="font-semibold text-[#0B1324] disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
                    className="font-semibold text-[#0B1324] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}

function SummaryCell({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="text-[12px] font-medium text-[#64748B]">{label}</p>
      <p className="mt-1 text-[1.25rem] font-semibold tabular-nums tracking-tight text-[#0B1324]">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-[#94A3B8]">{hint}</p>
    </div>
  )
}
