'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'
import type { PaymentStatusSlice } from '../mappers/mapBatchReviewKpis'
import { PORTAL_CARD } from './portal/batchPortalTokens'

const PIE_COLORS = ['#000000', '#3b82f6', '#ef4444', '#f59e0b', '#94a3b8', '#a855f7']

export function PaymentStatusBreakdown({
  slices,
  hasBatch,
}: {
  slices: PaymentStatusSlice[]
  hasBatch: boolean
}) {
  return (
    <section className={`${PORTAL_CARD} p-5 sm:p-6`}>
      <h2 className="text-[15px] font-bold text-[#0f172a]">{BATCH_REVIEW_COPY.chart.title}</h2>
      {!hasBatch || slices.length === 0 ? (
        <p className="mt-4 text-[13px] text-[#64748b]">{BATCH_REVIEW_COPY.chart.empty}</p>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-[1fr_0.9fr]">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius={50} outerRadius={86} paddingAngle={2} strokeWidth={0}>
                  {slices.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2">
            {slices.map((entry, i) => (
              <li
                key={entry.name}
                className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2"
              >
                <span className="flex items-center gap-2 text-[13px] text-[#334155]">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {entry.name}
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-[#0f172a]">{entry.value.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
