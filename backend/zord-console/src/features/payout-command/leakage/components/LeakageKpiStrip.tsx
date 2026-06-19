'use client'

import type { PortfolioLeakageViewModel } from '../../leakage-portfolio/normalizeLeakagePayload'
import { formatMinorInr } from '../../leakage-portfolio/utils/formatMinorInr'
import { leakageCopy, mapReviewPriorityLabel, mapReviewPriorityShort } from '../copy/leakageCopy'

const SECONDARY = [
  { key: 'unmatchedMinor' as const, label: leakageCopy.kpi.unmatched, tooltip: leakageCopy.kpi.unmatchedTooltip },
  {
    key: 'underSettlementMinor' as const,
    label: leakageCopy.kpi.shortSettled,
    tooltip: leakageCopy.kpi.shortSettledTooltip,
  },
  { key: 'orphanMinor' as const, label: leakageCopy.kpi.unlinked, tooltip: leakageCopy.kpi.unlinkedTooltip },
  { key: 'reversalMinor' as const, label: leakageCopy.kpi.reversal, tooltip: '' },
]

type LeakageKpiStripProps = {
  data: PortfolioLeakageViewModel
  loading?: boolean
}

export function LeakageKpiStrip({ data, loading }: LeakageKpiStripProps) {
  if (loading) {
    return (
      <div className="flex h-full flex-col gap-4">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  const gapRate = `${(data.paymentGapRate <= 1 ? data.paymentGapRate * 100 : data.paymentGapRate).toFixed(1)}%`
  const reviewValue = formatMinorInr(data.valueNeedingReviewMinor)

  return (
    <div className="flex h-full flex-col gap-4" data-testid="leakage-kpi-strip">
      {/* Top Hero Card - Value Needing Review */}
      <article 
        className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-5 shadow-sm min-h-[140px]"
        style={{ background: 'linear-gradient(145deg,#0f172a 0%,#111827 56%,#1f2937 100%)' }}
        data-testid="leakage-kpi-hero"
      >
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)' }}
          aria-hidden
        />
        <p className="relative text-[14px] font-medium text-white/80">{leakageCopy.kpi.valueNeedingReview}</p>
        <div className="relative mt-4 flex items-end gap-3">
          <p className="text-[2.25rem] font-bold leading-none tabular-nums text-white">
            {reviewValue}
          </p>
          <span className="mb-1 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-semibold text-white">
            ↗ {gapRate}
          </span>
        </div>
      </article>

      {/* 2x2 Grid for Secondary Metrics */}
      <div className="grid grid-cols-2 gap-3">
        {SECONDARY.map((item) => (
          <article
            key={item.key}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111827] p-4 shadow-sm"
            title={item.tooltip}
            data-testid={`leakage-kpi-secondary-${item.key}`}
          >
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl"
              style={{ background: 'radial-gradient(circle, rgba(148,163,184,0.24) 0%, transparent 72%)' }}
              aria-hidden
            />
            <div className="relative z-[1]">
              <div className="flex items-center gap-2">
                <div className="h-3 w-1 rounded-full bg-white/65" />
                <p className="text-[13px] font-medium leading-relaxed text-white/80">{item.label}</p>
              </div>
              <p className="mt-3 text-[1.1rem] font-semibold tabular-nums text-white">
                {formatMinorInr(data[item.key])}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
