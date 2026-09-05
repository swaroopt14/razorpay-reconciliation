'use client'

type FlowCompletionPopupProps = {
  /** Whether the popup is visible. */
  open: boolean
  /** Close handler for "Stay here" button. */
  onClose: () => void
  /** Title shown at the top (e.g. "Dispatch complete"). */
  title: string
  /** Description of what was completed. */
  description: string
  /** Label for the next step (e.g. "Agent Registry"). If null, shows "Flow complete". */
  nextLabel?: string
  /** Href for the next step. Required when nextLabel is provided. */
  nextHref?: string
  /** Optional trace ID to display. */
  traceId?: string
}

/**
 * Reusable popup shown after completing a process step.
 * Pattern: ✓ title · description · [Stay here] [Next: page →]
 */
export function FlowCompletionPopup({
  open,
  onClose,
  title,
  description,
  nextLabel,
  nextHref,
  traceId,
}: FlowCompletionPopupProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0B1324]/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flow-completion-title"
    >
      <div className="w-full max-w-md border border-[#E2E8F0] bg-white p-5 shadow-lg">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#138A63]">
          ✓ Complete
        </p>
        <h2
          id="flow-completion-title"
          className="mt-1 text-[16px] font-semibold tracking-[-0.01em] text-[#0B1324]"
        >
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#64748B]">
          {description}
        </p>
        {traceId ? (
          <p className="mt-1 font-mono text-[11px] text-[#64748B]">{traceId}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
          >
            Stay here
          </button>
          {nextLabel && nextHref ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                window.location.href = nextHref
              }}
              className="inline-flex h-9 items-center bg-[#0B1324] px-3 text-[12px] font-semibold text-white hover:bg-[#1E293B]"
            >
              Next: {nextLabel} →
            </button>
          ) : (
            <span className="inline-flex h-9 items-center bg-[#138A63] px-3 text-[12px] font-semibold text-white">
              Flow complete ✅
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
