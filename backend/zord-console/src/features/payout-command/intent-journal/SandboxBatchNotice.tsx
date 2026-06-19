'use client'

/**
 * SandboxBatchNotice — thin orange strip rendered at the top of the journal
 * main pane when the currently-selected batch is sandbox-seeded. Reminds the
 * operator that what they're inspecting is test data, not live.
 */

export function SandboxBatchNotice({
  scenarioName,
  variant = 'scenario',
  onDismissBatch,
}: {
  scenarioName: string
  variant?: 'scenario' | 'bulk_upload'
  onDismissBatch: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-amber-400/50 bg-gradient-to-r from-amber-950/20 via-[#431407]/30 to-amber-950/20 px-3.5 py-2 text-[13px] shadow-[0_0_22px_rgba(251,191,36,0.28)] ring-1 ring-amber-400/25">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" aria-hidden />
      <span className="font-semibold uppercase tracking-[0.1em] text-amber-100 drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]">Sandbox seeded</span>
      </span>
      <span className="text-amber-200/80">·</span>
      <span className="text-amber-100/90">This batch is test data only · No real funds</span>
      <span className="text-amber-200/80">·</span>
      <span className="text-amber-100/90">
        {variant === 'bulk_upload' ? (
          <>
            From bulk ingest file <span className="font-medium text-white">{scenarioName}</span>
          </>
        ) : (
          <>
            Generated from <span className="font-medium text-white">{scenarioName}</span> scenario
          </>
        )}
      </span>
        <button
          type="button"
          onClick={onDismissBatch}
          className="ml-auto inline-flex items-center gap-1 rounded-[6px] border border-amber-400/60 bg-amber-950/30 px-2 py-0.5 text-[12px] font-semibold text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.35)] transition hover:bg-amber-900/40"
        >
        Dismiss this batch
      </button>
    </div>
  )
}
