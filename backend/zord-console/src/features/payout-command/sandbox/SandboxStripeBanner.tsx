'use client'

/** Imperial blue strip (6-digit). Requested `#00239` is treated as `#002395`. */
const IMPERIAL_BLUE = '#002395'

/**
 * Stripe-style sandbox strip: imperial blue bar, white “Sandbox” + info, centered
 * message, white boxed “Verify your business” CTA. Compact height.
 */
export function SandboxStripeBanner({ onVerify }: { onVerify: () => void }) {
  return (
    <div
      className="flex flex-col gap-2 border-b border-black/15 px-3 py-2 text-[13px] text-white sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-2.5 lg:px-8"
      style={{ backgroundColor: IMPERIAL_BLUE }}
    >
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-[13px] font-bold tracking-tight text-white sm:text-[14px]">Sandbox</span>
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white bg-white/10 text-[11px] font-bold leading-none text-white shadow-sm"
          aria-hidden
        >
          <span className="translate-y-[0.5px]">i</span>
        </span>
      </span>

      <p className="min-w-0 flex-1 text-left text-[13px] font-bold leading-snug text-white sm:text-center sm:text-[14px] sm:leading-normal">
        Sandbox mode — testing only. No real payments will be sent.
      </p>

      <button
        type="button"
        onClick={onVerify}
        className="shrink-0 self-start rounded-md border border-white/90 bg-white px-3.5 py-1.5 text-[13px] font-semibold tracking-tight text-slate-900 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:self-auto sm:px-4 sm:py-2 sm:text-[14px]"
      >
        Verify your business →
      </button>
    </div>
  )
}
