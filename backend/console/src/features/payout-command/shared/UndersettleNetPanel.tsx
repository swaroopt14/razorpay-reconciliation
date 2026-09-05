'use client'

import type { UndersettleBreakdown } from '@/services/payout-command/demo/undersettleScheduleDemo'

type UndersettleNetPanelProps = {
  breakdown: UndersettleBreakdown
  /** Settlement journal: show observed vs unexplained. PAC: seal-time net. */
  mode?: 'contract' | 'settlement'
}

/** Quiet commercial breakdown — tax + margin are policy-authorised, not leakage. */
export function UndersettleNetPanel({ breakdown, mode = 'contract' }: UndersettleNetPanelProps) {
  const showObserved = mode === 'settlement'
  return (
    <div className="border border-[#D8DEE9] bg-[#F7F8FB] px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
            Policy-adjusted net
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-[#0B1324]">
            Company {breakdown.companyCode} · {breakdown.legalName}
          </p>
        </div>
        <p className="font-mono text-[11px] text-[#64748B]">
          {breakdown.policyId} · {breakdown.orderRef}
        </p>
      </div>

      <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] text-[#64748B]">Invoice</dt>
          <dd className="font-medium tabular-nums text-[#0B1324]">{breakdown.invoiceLabel}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#64748B]">Tax line · {breakdown.taxRateLabel}</dt>
          <dd className="font-medium tabular-nums text-[#0B1324]">−{breakdown.taxLabel}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#64748B]">Margin cut · {breakdown.marginRateLabel}</dt>
          <dd className="font-medium tabular-nums text-[#0B1324]">−{breakdown.marginLabel}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#64748B]">Expected net (sealed)</dt>
          <dd className="font-semibold tabular-nums text-[#0B1324]">{breakdown.expectedNetLabel}</dd>
        </div>
        {showObserved ? (
          <>
            <div>
              <dt className="text-[11px] text-[#64748B]">Observed settlement</dt>
              <dd className="font-medium tabular-nums text-[#0B1324]">{breakdown.observedLabel}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-[#64748B]">Unexplained delta</dt>
              <dd className="font-medium tabular-nums text-[#0B1324]">
                {breakdown.unexplained > 0 ? `−${breakdown.unexplainedLabel}` : breakdown.unexplainedLabel}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-[#64748B]">Outcome vs sealed net</dt>
              <dd className="font-semibold text-[#0B1324]">{breakdown.outcome}</dd>
            </div>
          </>
        ) : null}
      </dl>

      <p className="mt-3 text-[12px] leading-relaxed text-[#475569]">
        <span className="font-semibold text-[#0B1324]">Why this net. </span>
        {breakdown.reason}
        {breakdown.unexplained > 0
          ? ' Authorised tax and margin are not the gap — only the unexplained remainder needs Outcome Review.'
          : ' Authorised tax and margin are not a settlement exception.'}
      </p>
    </div>
  )
}
