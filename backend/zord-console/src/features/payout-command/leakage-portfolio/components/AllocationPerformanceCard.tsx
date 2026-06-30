'use client'

import { useMemo } from 'react'
import { leakageCopy } from '../../leakage/copy/leakageCopy'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { formatMinorInr } from '../utils/formatMinorInr'

type BarDef = {
  id: string
  label: string
  minor: number
}

export function AllocationPerformanceCard({ data }: { data: PortfolioLeakageViewModel }) {
  const bars: BarDef[] = useMemo(
    () => [
      { id: 'unmatched', label: leakageCopy.kpi.unmatched, minor: data.unmatchedMinor ?? 0 },
      { id: 'short', label: leakageCopy.kpi.shortSettled, minor: data.underSettlementMinor ?? 0 },
      { id: 'orphan', label: leakageCopy.kpi.unlinked, minor: data.orphanMinor ?? 0 },
      { id: 'reversal', label: leakageCopy.kpi.reversal, minor: data.reversalMinor ?? 0 },
    ],
    [data],
  )

  const maxMinor = Math.max(...bars.map((b) => b.minor), 1)

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-[14px] font-semibold text-slate-700">Allocation Performance</h2>

      <div className="mt-6 flex flex-1 items-end justify-between gap-2 border-b border-slate-100 pb-2">
        {bars.map((bar) => {
          const heightPct = bar.minor > 0 ? Math.round((bar.minor / maxMinor) * 100) : 0

          return (
            <div key={bar.id} className="flex flex-1 flex-col items-center gap-2">
              <div className="relative flex h-40 w-full max-w-[64px] items-end justify-center">
                <div
                  className="w-full rounded-t-xl transition-all"
                  style={{
                    height: `${Math.max(heightPct, bar.minor > 0 ? 12 : 4)}%`,
                    minHeight: bar.minor > 0 ? '12px' : '4px',
                    backgroundColor:
                      bar.id === 'unmatched' ? '#1e3a8a' : bar.id === 'short' ? '#334155' : '#cbd5e1',
                    opacity: bar.minor > 0 ? 1 : 0.4,
                  }}
                  title={formatMinorInr(bar.minor)}
                >
                  {bar.minor > 0 ? (
                    <div className="absolute top-2 w-full text-center text-[11px] font-bold text-slate-900 mix-blend-overlay">
                      {heightPct}%
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="text-center text-[11px] font-medium leading-tight text-slate-500">{bar.label}</p>
            </div>
          )
        })}
      </div>
    </article>
  )
}
