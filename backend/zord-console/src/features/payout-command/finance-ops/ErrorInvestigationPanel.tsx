'use client'

import { useState } from 'react'
import { formatPaise } from './reasonCopy'
import { buildRazorpayXError, type RazorpayXErrorView } from './razorpayXErrors'

export function ErrorInvestigationPanel({
  errorView,
  financialImpactMinor,
  confidence,
  investigating,
  hasRun,
  onInvestigate,
}: {
  errorView: RazorpayXErrorView
  financialImpactMinor?: number
  confidence?: number
  investigating?: boolean
  hasRun?: boolean
  onInvestigate?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const payload = { error: errorView.error }

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="mt-6 border-t border-[#E2E8F0] pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            AI investigation
          </h3>
          <p className="mt-0.5 text-[12px] text-[#64748B]">{errorView.errorType} · India</p>
        </div>
        {onInvestigate ? (
          <button
            type="button"
            onClick={onInvestigate}
            disabled={investigating}
            className="inline-flex h-8 items-center bg-[#0B1324] px-3 text-[12px] font-semibold text-white hover:bg-[#1E293B] disabled:opacity-60"
          >
            {investigating ? 'Investigating…' : hasRun ? 'Re-run' : 'Investigate'}
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[#334155]">
        RazorpayX returns the failure at the source of the response. Map the reason, source, and next
        steps — do not rename the payout status.
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        {errorView.httpCode ? (
          <div className="border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">HTTP</p>
            <p className="mt-1 font-mono text-[13px] font-semibold text-[#0F172A]">
              {errorView.httpCode} · {errorView.httpLabel}
            </p>
          </div>
        ) : (
          <div className="border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Source</p>
            <p className="mt-1 font-mono text-[13px] font-semibold text-[#0F172A]">{errorView.error.source}</p>
          </div>
        )}
        {financialImpactMinor != null ? (
          <div className="border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Exposure</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-[#0F172A]">
              {formatPaise(financialImpactMinor, 2)}
            </p>
          </div>
        ) : null}
        <div className="border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Reason</p>
          <p className="mt-1 break-all font-mono text-[12px] font-semibold text-[#0F172A]">
            {errorView.error.reason}
          </p>
        </div>
        {confidence != null ? (
          <div className="border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Confidence</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-[#0F172A]">
              {Math.round(confidence * 100)}%
            </p>
          </div>
        ) : null}
      </dl>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Next steps</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#334155]">{errorView.nextSteps}</p>
        {errorView.retrySchedule ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-[#64748B]">
            {errorView.retrySchedule.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            Sample error response
          </p>
          <button
            type="button"
            onClick={() => void copy()}
            className="text-[12px] font-medium text-[#2B7DE9] hover:underline"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-[8px] border border-[#EEF0F3] bg-[#FAFBFC] p-3 font-mono text-[11px] text-[#334155]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </section>
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
