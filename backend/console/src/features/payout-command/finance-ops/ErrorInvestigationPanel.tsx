'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { DrawerField } from './razorpayChrome'
import {
  buildRazorpayXError,
  type RazorpayXErrorView,
} from './razorpayXErrors'

function payoutTimeline(errorView: RazorpayXErrorView) {
  const status = String(errorView.forensics.providerStatusKept || 'failed').toLowerCase()
  const failed = status === 'failed' || status === 'reversed' || status === 'cancelled' || status === 'rejected'
  const processed = status === 'processed'
  return [
    { id: 'created', label: 'Created', state: 'done' as const, detail: 'Payout created on RazorpayX.' },
    { id: 'queued', label: 'Queued', state: 'done' as const, detail: 'Accepted with idempotency key intact.' },
    {
      id: 'processing',
      label: 'Processing',
      state: processed || failed ? ('done' as const) : ('current' as const),
      detail: errorView.forensics.pipelineStage,
    },
    {
      id: status === 'reversed' ? 'reversed' : status === 'cancelled' ? 'cancelled' : failed ? 'failed' : 'processed',
      label: processed ? 'Processed' : failed ? status.charAt(0).toUpperCase() + status.slice(1) : 'Processed',
      state: processed ? ('done' as const) : failed ? ('fail' as const) : ('wait' as const),
      detail: errorView.error.description,
    },
  ]
}

export function ErrorInvestigationPanel({
  errorView,
  investigating: parentInvestigating,
  hasRun: parentHasRun,
  onInvestigate,
  autoStart = false,
  compact = false,
  view = 'full',
}: {
  errorView: RazorpayXErrorView
  financialImpactMinor?: number
  confidence?: number
  investigating?: boolean
  hasRun?: boolean
  onInvestigate?: () => void
  autoStart?: boolean
  compact?: boolean
  view?: 'full' | 'status' | 'timeline'
}) {
  const [copied, setCopied] = useState(false)
  const [showPayload, setShowPayload] = useState(false)
  const started = useRef(false)
  const payload = useMemo(() => ({ error: errorView.error }), [errorView])
  const steps = useMemo(() => payoutTimeline(errorView), [errorView])

  useEffect(() => {
    if (!autoStart || parentHasRun || started.current) return
    started.current = true
    onInvestigate?.()
  }, [autoStart, parentHasRun, onInvestigate])

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const f = errorView.forensics
  const failed = ['failed', 'reversed', 'cancelled', 'rejected'].includes(f.providerStatusKept)
  const showStatus = view === 'full' || view === 'status'
  const showTimeline = view === 'full' || view === 'timeline'

  return (
    <div className={compact ? 'space-y-5' : 'mt-6 space-y-5'}>
      {showStatus && failed ? (
        <div className="rounded-[6px] border border-[#F4C7C3] bg-[#FDF6F6] px-4 py-3.5">
          <p className="text-[13px] font-semibold text-[#C0372A]">Payout failed</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#8A3B34]">{errorView.error.description}</p>
          <div className="mt-3 space-y-1.5 text-[12px]">
            <p>
              <span className="text-[#8A3B34]">Error code</span>
              <span className="ml-3 font-mono font-medium text-[#C0372A]">{errorView.error.code}</span>
            </p>
            {errorView.httpCode ? (
              <p>
                <span className="text-[#8A3B34]">HTTP</span>
                <span className="ml-3 font-medium text-[#C0372A]">{errorView.httpCode}</span>
              </p>
            ) : null}
            <p>
              <span className="text-[#8A3B34]">Source</span>
              <span className="ml-3 font-medium text-[#C0372A]">{errorView.error.source}</span>
            </p>
            <p>
              <span className="text-[#8A3B34]">Reason</span>
              <span className="ml-3 font-mono font-medium text-[#C0372A]">{errorView.error.reason}</span>
            </p>
          </div>
        </div>
      ) : null}

      {showStatus ? (
      <section>
        <p className="mb-1 text-[13px] font-semibold text-[#1A1A1A]">Status details</p>
        <dl>
          <DrawerField label="Reason" mono>
            {errorView.error.reason}
          </DrawerField>
          <DrawerField label="Source">{errorView.error.source}</DrawerField>
          <DrawerField label="Description">{errorView.error.description}</DrawerField>
          <DrawerField label="Next steps">{errorView.nextSteps}</DrawerField>
        </dl>
      </section>
      ) : null}

      {showTimeline ? (
      <section>
        <p className="mb-3 text-[13px] font-semibold text-[#1A1A1A]">Timeline</p>
        <ol className="relative ml-1.5 space-y-0 border-l border-[#E6E8EB] pl-5">
          {steps.map((step) => (
            <li key={step.id} className="relative pb-4 last:pb-0">
              <span
                className={`absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                  step.state === 'fail'
                    ? 'bg-[#C0372A]'
                    : step.state === 'done'
                      ? 'bg-[#147A3F]'
                      : step.state === 'current'
                        ? 'bg-[#528FF0]'
                        : 'bg-[#D0D4DA]'
                }`}
              />
              <p
                className={`text-[13px] font-semibold ${
                  step.state === 'fail' ? 'text-[#C0372A]' : 'text-[#1A1A1A]'
                }`}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[#8F8F8F]">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>
      ) : null}

      {showStatus ? (
        <div>
          <button
            type="button"
            onClick={() => setShowPayload((open) => !open)}
            className="text-[13px] font-medium text-[#528FF0] hover:underline"
          >
            {showPayload ? 'Hide API response' : 'View API response'}
          </button>
          {parentInvestigating ? (
            <span className="ml-3 text-[12px] text-[#8F8F8F]">Refreshing…</span>
          ) : null}
          {showPayload ? (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-[#8F8F8F]">error</p>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="text-[12px] font-medium text-[#528FF0] hover:underline"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-[6px] bg-[#F5F6F8] p-3 font-mono text-[11px] leading-relaxed text-[#334155]">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function errorViewFromPayout(opts: {
  reason?: string | null
  status?: string | null
  description?: string | null
  source?: string | null
  nextSteps?: string | null
  payoutId?: string | null
  fundAccountId?: string | null
}): RazorpayXErrorView {
  return buildRazorpayXError(opts)
}
