'use client'

import type { ReactNode } from 'react'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { DEMO_BATCH_LABEL } from '@/services/payout-command/demo/ycDemoConstants'
import type { BatchRecord } from '../intentJournalSidebarUtils'
import { confidencePctFromBatch, resolveBatchHealthStatus } from '../intentJournalSidebarUtils'
import { intentJournalCopy } from '../copy/intentJournalCopy'
import type { JournalOverviewSummary } from './IntentJournalOverview'

function formatInr(major: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(major)
}

type IntentJournalBatchDetailProps = {
  batch: BatchRecord
  summary: JournalOverviewSummary
  onBack: () => void
  actions?: {
    onSealEligible?: () => void
    onValidate?: () => void
    onOpenReview?: () => void
    sealEligibleCount?: number
  }
  children: ReactNode
}

/** Dedicated batch page - intents for one batch only (not stacked under the list). */
export function IntentJournalBatchDetail({
  batch,
  summary,
  onBack,
  actions,
  children,
}: IntentJournalBatchDetailProps) {
  const { mode } = useEnvironment()
  const conf = confidencePctFromBatch(batch)
  const health = resolveBatchHealthStatus(batch)
  const title = mode === 'sandbox' ? DEMO_BATCH_LABEL : batch.batchId

  return (
    <div className="space-y-5">
      {mode === 'sandbox' ? null : (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#2563EB] hover:underline"
        >
          ← Back to batches
        </button>
      )}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#64748B]">Batch</p>
          <h1 className="mt-0.5 truncate text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {title}
          </h1>
          {mode === 'sandbox' ? (
            <p className="mt-0.5 font-mono text-[12px] text-[#94A3B8]">{batch.batchId}</p>
          ) : null}
          <p className="mt-1 text-[13px] text-[#64748B]">
            {health}
            {conf != null ? (
              <>
                <span className="mx-1.5 text-[#E2E8F0]">·</span>
                {conf}% readiness
              </>
            ) : null}
            <span className="mx-1.5 text-[#E2E8F0]">·</span>
            {formatInr(batch.totalValue)}
          </p>
        </div>
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
      </header>

      <section className="border border-[#E5E5E5] bg-white" aria-label="Batch summary">
        <div className="border-b border-[#E5E5E5] px-5 py-5 sm:px-6">
          <p className="text-[13px] font-medium text-[#64748B]">{intentJournalCopy.kpi.intendedValue}</p>
          <p className="mt-1 text-[2rem] font-semibold tracking-[-0.03em] text-[#0B1324] sm:text-[2.25rem]">
            {formatInr(summary.intendedValue)}
          </p>
          <p className="mt-1 text-[13px] text-[#94A3B8]">
            {summary.instructionCount.toLocaleString('en-IN')} instruction
            {summary.instructionCount === 1 ? '' : 's'} in this batch
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[#E5E5E5] sm:grid-cols-4 sm:divide-y-0">
          <SummaryCell
            label={intentJournalCopy.kpi.instructions}
            value={summary.instructionCount.toLocaleString('en-IN')}
          />
          <SummaryCell label={intentJournalCopy.kpi.readiness} value={summary.readinessPctLabel} />
          <SummaryCell
            label={intentJournalCopy.kpi.blockedValue}
            value={formatInr(summary.blockedValue)}
          />
          <SummaryCell
            label={intentJournalCopy.kpi.needsReview}
            value={summary.needsReviewCount.toLocaleString('en-IN')}
          />
        </div>
      </section>

      <section className="space-y-3" aria-label="Intents in this batch">
        <div>
          <p className="text-[14px] font-semibold text-[#0B1324]">Intents</p>
          <p className="text-[12px] text-[#64748B]">
            All payment instructions in this batch · click a row for details
          </p>
        </div>
        {children}
      </section>
    </div>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="text-[12px] font-medium text-[#64748B]">{label}</p>
      <p className="mt-1 text-[1.25rem] font-semibold tabular-nums tracking-tight text-[#0B1324]">
        {value}
      </p>
    </div>
  )
}
