'use client'

import { formatPaise } from './reasonCopy'
import type { RouteRecommendation } from './bulkRouteDemo'
import { RZ_CARD, RZ_LABEL, RZ_MUTED } from './razorpayChrome'

export function RouteReviewDrawer({
  rec,
  batchLabel,
  onClose,
}: {
  rec: RouteRecommendation
  batchLabel: string
  onClose: () => void
}) {
  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-[#E6E8EB] bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.08)]"
      aria-label="Route decision"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#E6E8EB] px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8F8F8F]">Route decision</p>
          <h2 className="mt-1 text-[17px] font-semibold text-[#1A1A1A]">
            {rec.bank} · {rec.rail}
          </h2>
          <p className={`mt-1 ${RZ_MUTED}`}>{batchLabel}</p>
        </div>
        <button type="button" onClick={onClose} className="h-8 px-2 text-[18px] text-[#6B6B6B]" aria-label="Close">
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <section className={`${RZ_CARD} px-4 py-3`}>
          <p className={RZ_LABEL}>Reason</p>
          <p className="mt-1 text-[13px] text-[#1A1A1A]">Sealed contract rail match · policy-approved envelope</p>
          <p className={`${RZ_LABEL} mt-3`}>SLA</p>
          <p className="mt-1 text-[13px] text-[#1A1A1A]">Credit expected {rec.expectedCompletion}</p>
          <p className={`${RZ_LABEL} mt-3`}>Fee / FX</p>
          <p className="mt-1 text-[13px] text-[#1A1A1A]">
            Domestic · no FX · projected fee {formatPaise(rec.projectedFeeMinor, 2)}
          </p>
          <p className={`${RZ_LABEL} mt-3`}>Fallback</p>
          <p className="mt-1 text-[13px] text-[#1A1A1A]">{rec.fallback}</p>
        </section>
        <section className={`${RZ_CARD} px-4 py-3`}>
          <p className={RZ_LABEL}>Contract</p>
          <p className="mt-2 font-mono text-[12px] text-[#1A1A1A]">{rec.contractVersion}</p>
          <p className="mt-1 break-all font-mono text-[12px] text-[#6B6B6B]">{rec.contractHash}</p>
          <p className="mt-2 text-[12px] text-[#147A3F]">Request hash matches the sealed contract version.</p>
        </section>
        <section className={`${RZ_CARD} px-4 py-3`}>
          <p className={RZ_LABEL}>Attempt ledger</p>
          <p className="mt-2 text-[13px] text-[#6B6B6B]">No attempt until Approve & Dispatch. Provider status stays pending.</p>
          <p className="mt-2 font-mono text-[12px] text-[#1A1A1A]">att-0006-a1 · not sent</p>
          <p className="mt-1 font-mono text-[12px] text-[#6B6B6B]">idem_pay_0006_neft_v1</p>
        </section>
      </div>
    </aside>
  )
}
