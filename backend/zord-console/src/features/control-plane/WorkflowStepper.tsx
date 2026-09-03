'use client'

import Link from 'next/link'

type StepId = 'action' | 'authority' | 'contract' | 'dispatch'

const STEPS: { id: StepId; label: string; segment: string }[] = [
  { id: 'action', label: 'ACTION', segment: '' },
  { id: 'authority', label: 'AUTHORITY', segment: 'authority' },
  { id: 'contract', label: 'CONTRACT', segment: 'contract' },
  { id: 'dispatch', label: 'DISPATCH', segment: 'dispatch' },
]

function stepIndex(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id)
}

export function WorkflowStepper({
  activeStep,
  traceId,
  context,
}: {
  activeStep: StepId
  traceId: string
  /** Optional context breadcrumb: Batch / PAY-0001 / Beneficiary / Amount / Rail */
  context?: { batch?: string; action?: string; beneficiary?: string; amount?: string; rail?: string }
}) {
  const activeIdx = stepIndex(activeStep)
  const href = (segment: string) =>
    segment ? `/actions/${traceId}/${segment}` : `/actions/${traceId}`

  return (
    <div className="border-b border-[#D8DEE9] bg-white px-5 py-3">
      {/* Context breadcrumb */}
      {context ? (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-[#94A3B8]">
          {context.batch ? <span className="font-semibold text-[#64748B]">{context.batch}</span> : null}
          {context.action ? (
            <>
              <span>/</span>
              <span className="font-semibold text-[#64748B]">{context.action}</span>
            </>
          ) : null}
          {context.beneficiary ? (
            <>
              <span>/</span>
              <span className="text-[#64748B]">{context.beneficiary}</span>
            </>
          ) : null}
          {context.amount ? (
            <>
              <span>/</span>
              <span className="font-semibold text-[#64748B]">{context.amount}</span>
            </>
          ) : null}
          {context.rail ? (
            <>
              <span>/</span>
              <span className="text-[#64748B]">{context.rail}</span>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Step indicators */}
      <nav className="flex items-center gap-0" aria-label="Workflow progress">
        {STEPS.map((step, i) => {
          const isComplete = i < activeIdx
          const isCurrent = i === activeIdx
          return (
            <div key={step.id} className="flex items-center">
              {i > 0 ? (
                <span
                  className={`mx-1 h-px w-6 ${isComplete ? 'bg-[#138A63]' : 'bg-[#D8DEE9]'}`}
                />
              ) : null}
              <Link
                href={href(step.segment)}
                className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] font-semibold tracking-[0.04em] transition ${
                  isCurrent
                    ? 'bg-[#0B1324] text-white'
                    : isComplete
                      ? 'text-[#138A63] hover:bg-[#E7F6F0]'
                      : 'text-[#94A3B8] hover:bg-[#F1F5F9]'
                }`}
              >
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                    isCurrent
                      ? 'bg-white text-[#0B1324]'
                      : isComplete
                        ? 'bg-[#138A63] text-white'
                        : 'bg-[#E2E8F0] text-[#94A3B8]'
                  }`}
                >
                  {isComplete ? '✓' : i + 1}
                </span>
                {step.label}
              </Link>
            </div>
          )
        })}
      </nav>
    </div>
  )
}

export function WorkflowNavButtons({
  backLabel,
  backHref,
  nextLabel,
  nextHref,
  nextEnabled = true,
}: {
  backLabel?: string
  backHref?: string
  nextLabel?: string
  nextHref?: string
  nextEnabled?: boolean
}) {
  if (!backLabel && !nextLabel) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#D8DEE9] bg-white px-5 py-3">
      <div>
        {backLabel && backHref ? (
          <Link
            href={backHref}
            className="inline-flex h-9 items-center rounded-md border border-[#D8DEE9] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
          >
            ← {backLabel}
          </Link>
        ) : null}
      </div>
      <div>
        {nextLabel && nextHref ? (
          <Link
            href={nextHref}
            className={`inline-flex h-9 items-center rounded-md px-4 text-[12px] font-semibold ${
              nextEnabled
                ? 'bg-[#2E5BFF] text-white hover:bg-[#2448D6]'
                : 'cursor-not-allowed border border-[#D8DEE9] bg-[#F8FAFC] text-[#94A3B8]'
            }`}
            aria-disabled={!nextEnabled}
            onClick={(e) => {
              if (!nextEnabled) e.preventDefault()
            }}
          >
            {nextLabel} →
          </Link>
        ) : null}
      </div>
    </div>
  )
}
