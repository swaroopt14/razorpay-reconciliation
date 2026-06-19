'use client'

import Link from 'next/link'
import {
  SANDBOX_SETUP_GUIDE,
  type SandboxSetupGuideStep,
} from '@/services/payout-command/sandbox-setup-guide'

type SandboxSetupGuideDialogProps = {
  open: boolean
  batchCenterHref: string
  onClose: () => void
  onDismissRemember?: () => void
}

function stepHref(step: SandboxSetupGuideStep, batchCenterHref: string): string | undefined {
  if (!step.href) return undefined
  if (step.id === 'intent-ingest' || step.id === 'settlement') return batchCenterHref
  return step.href
}

/**
 * Modal setup guide — copy and steps match `SANDBOX_SETUP_GUIDE` (real console flows).
 */
export function SandboxSetupGuideDialog({
  open,
  batchCenterHref,
  onClose,
  onDismissRemember,
}: SandboxSetupGuideDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sandbox-setup-guide-title"
    >
      <div className="max-h-[min(90vh,44rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl">
        <h2 id="sandbox-setup-guide-title" className="text-lg font-semibold tracking-[-0.01em] text-[#0f172a]">
          {SANDBOX_SETUP_GUIDE.title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#64748b]">{SANDBOX_SETUP_GUIDE.subtitle}</p>

        <ol className="mt-4 space-y-3">
          {SANDBOX_SETUP_GUIDE.steps.map((step, index) => {
            const href = stepHref(step, batchCenterHref)
            return (
              <li key={step.id} className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-3">
                <div className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A0A0A] text-[12px] font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-[#0f172a]">{step.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-[#64748b]">{step.detail}</p>
                    {step.api ? (
                      <p className="mt-1.5 font-mono text-[11px] text-[#475569]">{step.api}</p>
                    ) : null}
                    {href ? (
                      <Link
                        href={href}
                        className="mt-2 inline-flex text-[13px] font-medium text-[#2563eb] underline decoration-[#93c5fd] underline-offset-2 hover:text-[#1d4ed8]"
                        onClick={onClose}
                      >
                        {step.summary} →
                      </Link>
                    ) : (
                      <p className="mt-2 text-[12px] font-medium text-[#94a3b8]">{step.summary}</p>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        <ul className="mt-4 space-y-1 border-t border-slate-200/80 pt-3 text-[12px] leading-relaxed text-[#94a3b8]">
          {SANDBOX_SETUP_GUIDE.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden>·</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={batchCenterHref}
            className="inline-flex min-w-[10rem] flex-1 items-center justify-center rounded-xl bg-[#111111] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-black/90"
            onClick={onClose}
          >
            Open Batch Command Center
          </Link>
          <button
            type="button"
            className="rounded-xl border border-[#E5E5E5] px-4 py-2.5 text-[14px] font-medium text-[#64748b] transition hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {onDismissRemember ? (
          <button
            type="button"
            className="mt-3 text-[13px] text-[#94a3b8] underline underline-offset-2 transition hover:text-[#64748b]"
            onClick={() => {
              onDismissRemember()
              onClose()
            }}
          >
            Don&apos;t show again
          </button>
        ) : null}
      </div>
    </div>
  )
}
