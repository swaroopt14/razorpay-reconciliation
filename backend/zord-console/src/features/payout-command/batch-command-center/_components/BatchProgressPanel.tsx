'use client'

import type { BatchStepState, BatchTimelineStep } from '@/services/payout-command/batch-model'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'
import { PORTAL_CARD } from './portal/batchPortalTokens'

function PipelineNode({ state, stepNumber }: { state: BatchStepState; stepNumber: number }) {
  if (state === 'done') {
    return (
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#000000] text-white shadow-[0_0_0_4px_#fff]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M3 7.2L5.8 10L11 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-white shadow-[0_0_0_4px_#fff]">
        <span className="absolute inset-0 rounded-full bg-[#2563eb]/35 motion-safe:animate-ping" />
        <span className="relative h-2 w-2 rounded-full bg-white" />
      </span>
    )
  }
  if (state === 'warning') {
    return (
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-white shadow-[0_0_0_4px_#fff]">
        <span className="text-[13px] font-bold">!</span>
      </span>
    )
  }
  return (
    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#d4d4d0] bg-white text-[11px] font-semibold text-[#94a3b8] shadow-[0_0_0_4px_#fff]">
      {stepNumber}
    </span>
  )
}

export function BatchProgressPanel({
  steps,
  progressPct,
  busy,
}: {
  steps: BatchTimelineStep[]
  progressPct: number
  busy?: boolean
}) {
  return (
    <section className={`${PORTAL_CARD} p-5 sm:p-6`} aria-label={BATCH_REVIEW_COPY.pipeline.title}>
      <h2 className="text-[15px] font-bold text-[#0f172a]">{BATCH_REVIEW_COPY.pipeline.title}</h2>
      <p className="mt-1 text-[13px] text-[#64748b]">{BATCH_REVIEW_COPY.pipeline.subtitle}</p>
      {busy ? (
        <p className="mt-2 text-[12px] font-medium text-[#2563eb]">Processing in progress…</p>
      ) : null}
      <div className="relative mt-6 hidden md:block">
        <div className="absolute left-4 right-4 top-4 h-0.5 rounded-full bg-[#e8edf3]" aria-hidden />
        <div
          className="absolute left-4 top-4 h-0.5 rounded-full bg-gradient-to-r from-[#2563eb] to-[#000000] transition-[width] duration-700"
          style={{ width: `calc((100% - 2rem) * ${Math.min(100, progressPct) / 100})` }}
        />
        <ol className="relative flex justify-between gap-1">
          {steps.map((step, i) => (
            <li key={step.label} className="flex min-w-0 flex-1 flex-col items-center px-0.5 text-center">
              <PipelineNode state={step.state} stepNumber={i + 1} />
              <p className="mt-3 max-w-[6.5rem] text-[11px] font-semibold leading-snug text-[#0f172a]">{step.label}</p>
            </li>
          ))}
        </ol>
      </div>
      <ol className="mt-4 space-y-3 md:hidden">
        {steps.map((step, i) => (
          <li key={step.label} className="flex gap-3">
            <PipelineNode state={step.state} stepNumber={i + 1} />
            <div>
              <p className="text-[14px] font-semibold text-[#0f172a]">{step.label}</p>
              <p className="mt-0.5 text-[12px] text-[#64748b]">
                {BATCH_REVIEW_COPY.pipeline.steps[i]?.description ?? ''}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
