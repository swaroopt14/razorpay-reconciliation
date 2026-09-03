'use client'

/**
 * Intent Journal–style summary strip: one hero metric + up to four cells.
 * Page-specific labels/values; keep ≤4 cells (product visual rule).
 */
export type LifecycleSummaryCell = {
  label: string
  value: string
  hint: string
}

export type LifecycleSummaryStripProps = {
  heroLabel: string
  heroValue: string
  heroHint: string
  cells: LifecycleSummaryCell[]
  'aria-label'?: string
}

export function LifecycleSummaryStrip({
  heroLabel,
  heroValue,
  heroHint,
  cells,
  'aria-label': ariaLabel = 'Overview summary',
}: LifecycleSummaryStripProps) {
  const gridCols =
    cells.length <= 2
      ? 'sm:grid-cols-2'
      : cells.length === 3
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-4'

  return (
    <section className="border border-[#E5E5E5] bg-white" aria-label={ariaLabel}>
      <div className="border-b border-[#E5E5E5] px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-[13px] font-medium text-[#64748B]">{heroLabel}</p>
        <p className="mt-1 text-[2rem] font-semibold tracking-[-0.03em] text-[#0B1324] sm:text-[2.25rem]">
          {heroValue}
        </p>
        <p className="mt-1 text-[13px] text-[#94A3B8]">{heroHint}</p>
      </div>
      {cells.length > 0 ? (
        <div
          className={`grid grid-cols-2 divide-x divide-y divide-[#E5E5E5] sm:divide-y-0 ${gridCols}`}
        >
          {cells.map((c) => (
            <div key={c.label} className="px-4 py-4 sm:px-5">
              <p className="text-[12px] font-medium text-[#64748B]">{c.label}</p>
              <p className="mt-1 text-[1.25rem] font-semibold tabular-nums tracking-tight text-[#0B1324]">
                {c.value}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#94A3B8]">{c.hint}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
