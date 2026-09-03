'use client'

import { formatPaise } from './reasonCopy'
import { PayoutLifecycleView } from './PayoutLifecycleView'
import { buildPayoutLifecycle } from './payoutLifecycleModel'
import type { PayoutReconDisplayRow } from './payoutReconCopy'

export function PayoutLifecycleDrawer({
  row,
  onClose,
}: {
  row: PayoutReconDisplayRow
  onClose: () => void
}) {
  const life = buildPayoutLifecycle(row)
  const traceHref = `/reconciliation/${encodeURIComponent(row.payoutId)}?demo=sandbox`

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[560px] flex-col border-l border-[#E2E8F0] bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.08)]"
      aria-label="Transaction lifecycle"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            Transaction lifecycle
          </p>
          <h2 className="mt-1 break-all font-mono text-[15px] font-semibold text-[#0F172A]">{row.payoutId}</h2>
          <p className="mt-2 text-[26px] font-semibold tabular-nums tracking-tight text-[#0F172A]">
            {formatPaise(row.amountMinor, 2)}
            <span className="ml-1.5 text-[13px] font-medium text-[#8F8F8F]">{row.currency || 'INR'}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 shrink-0 px-2 text-[18px] leading-none text-[#64748B] hover:text-[#0F172A]"
          aria-label="Close transaction lifecycle"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <PayoutLifecycleView life={life} variant="drawer" initialTab="events" traceHref={traceHref} />
      </div>
    </aside>
  )
}
