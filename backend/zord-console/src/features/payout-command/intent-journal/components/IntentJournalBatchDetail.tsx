'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import {
  markBatchDispatched,
  useDispatchedBatchId,
} from '@/services/payout-command/demo/demoBatchReadiness'
import { indiaBatchDispatchSummary } from '@/services/payout-command/demo/dispatchRelayDemo'
import { DEMO_BATCH_LABEL, withDemoBatchScope } from '@/services/payout-command/demo/ycDemoConstants'
import {
  SCENARIO_CROSS_BORDER,
  getStoredScenario,
  type ConsoleScenario,
} from '@/services/payout-command/demo/scenarioMode'
import type { BatchRecord } from '../intentJournalSidebarUtils'
import { confidencePctFromBatch, resolveBatchHealthStatus } from '../intentJournalSidebarUtils'
import { intentJournalCopy } from '../copy/intentJournalCopy'
import type { JournalOverviewSummary } from './IntentJournalOverview'

function formatInr(major: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
    onCreatePolicy?: () => void
    createPolicyHref?: string
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
  const dispatchedBatchId = useDispatchedBatchId()
  const [scenario, setScenario] = useState<ConsoleScenario>('inr')
  const [dispatchOpen, setDispatchOpen] = useState(false)
  useEffect(() => {
    setScenario(getStoredScenario())
  }, [])
  const conf = confidencePctFromBatch(batch)
  const health = resolveBatchHealthStatus(batch)
  const title = mode === 'sandbox' ? DEMO_BATCH_LABEL : batch.batchId
  const isIndia = scenario !== SCENARIO_CROSS_BORDER
  const alreadyDispatched = dispatchedBatchId === batch.batchId
  const dispatchHref = withDemoBatchScope('/execution/dispatches', batch.batchId)

  function openIndiaDispatch() {
    markBatchDispatched(batch.batchId)
    setDispatchOpen(true)
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#2563EB] hover:underline"
      >
        ← Back to batches
      </button>

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
          {isIndia ? (
            alreadyDispatched ? (
              <Link
                href={dispatchHref}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                  e.preventDefault()
                  window.location.assign(dispatchHref)
                }}
                className="inline-flex h-9 items-center border border-[#E5E5E5] bg-white px-3.5 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
              >
                {intentJournalCopy.actions.viewDispatch} →
              </Link>
            ) : (
              <button
                type="button"
                onClick={openIndiaDispatch}
                className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
              >
                {intentJournalCopy.actions.dispatchBatch}
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                onClick={actions?.onValidate}
                className="inline-flex h-9 items-center border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
              >
                {intentJournalCopy.actions.validate}
              </button>
              <Link
                href={
                  actions?.createPolicyHref ??
                  withDemoBatchScope('/controls/policies?create=1&demo=sandbox')
                }
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                  e.preventDefault()
                  if (actions?.onCreatePolicy) {
                    actions.onCreatePolicy()
                    return
                  }
                  const href =
                    actions?.createPolicyHref ??
                    withDemoBatchScope('/controls/policies?create=1&demo=sandbox')
                  window.location.assign(href)
                }}
                className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
              >
                {intentJournalCopy.actions.createPolicy}
              </Link>
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
            </>
          )}
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

      {dispatchOpen ? (
        <IndiaBatchDispatchedDialog
          batchLabel={title}
          batchId={batch.batchId}
          dispatchHref={dispatchHref}
          onClose={() => setDispatchOpen(false)}
        />
      ) : null}
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

function IndiaBatchDispatchedDialog({
  batchLabel,
  batchId,
  dispatchHref,
  onClose,
}: {
  batchLabel: string
  batchId: string
  dispatchHref: string
  onClose: () => void
}) {
  const summary = indiaBatchDispatchSummary()
  const heldNote =
    summary.heldCount > 0
      ? `${summary.heldRefs.join(', ')} stayed unsealed and was not sent.`
      : null

  function goToDispatch() {
    window.location.assign(dispatchHref)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0B1324]/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="india-dispatch-title"
        className="relative z-[81] w-full max-w-[440px] border border-[#D8DEE9] bg-white shadow-[0_24px_64px_rgba(11,19,36,0.18)]"
      >
        <div className="border-b border-[#E5E5E5] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 items-center bg-[#0B1324] px-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
              Sandbox
            </span>
            <p className="text-[12px] text-[#64748B]">{batchLabel}</p>
          </div>
          <h2 id="india-dispatch-title" className="mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            Batch dispatched
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
            {summary.sealedCount.toLocaleString('en-IN')} sealed instructions were sent on approved rails.
            Zord did not hold or settle funds.
          </p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
              Primary route
            </p>
            <p className="mt-1 text-[14px] font-semibold text-[#0B1324]">
              {summary.primary.provider}
            </p>
            <p className="mt-0.5 text-[13px] text-[#334155]">
              Rail · {summary.primary.rail}
              <span className="mx-1.5 text-[#E2E8F0]">·</span>
              {summary.primary.count.toLocaleString('en-IN')} payouts
            </p>
          </div>
          {summary.rails.length > 1 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Also used
              </p>
              <ul className="mt-1 space-y-1 text-[13px] text-[#334155]">
                {summary.rails.slice(1).map((r) => (
                  <li key={`${r.provider}-${r.rail}`}>
                    {r.provider} · {r.rail}
                    <span className="text-[#94A3B8]"> · {r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {heldNote ? <p className="text-[12px] leading-relaxed text-[#64748B]">{heldNote}</p> : null}
          <p className="font-mono text-[11px] text-[#94A3B8]">{batchId}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#E5E5E5] bg-[#F8FAFC] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center border border-[#E5E5E5] bg-white px-3 text-[13px] font-semibold text-[#0B1324] hover:bg-white"
          >
            Stay here
          </button>
          <button
            type="button"
            onClick={goToDispatch}
            className="inline-flex h-9 items-center bg-[#2E5BFF] px-3.5 text-[13px] font-semibold text-white hover:bg-[#2448D4]"
          >
            Next · Dispatch →
          </button>
        </div>
      </div>
    </div>
  )
}
