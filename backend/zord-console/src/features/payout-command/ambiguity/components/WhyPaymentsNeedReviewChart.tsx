'use client'

import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ClientChart } from '../../shared'
import { ambiguityCopy } from '../copy/ambiguityCopy'

type WhyPaymentsNeedReviewChartProps = {
  amb: AmbiguityKpiResolved | null
}

export function WhyPaymentsNeedReviewChart({ amb }: WhyPaymentsNeedReviewChartProps) {
  const data = useMemo(() => {
    const lowConf = amb?.low_confidence_rate ?? (amb ? Math.max(0, 1 - amb.avg_attachment_confidence) : 0)
    const collision = amb?.candidate_collision_rate
    return [
      { label: 'Review Rate', pct: amb ? amb.ambiguity_rate * 100 : 0, color: '#000000', pending: false },
      { label: 'Low Confidence', pct: lowConf * 100, color: '#94a3b8', pending: false },
      { label: 'Missing Refs', pct: amb ? amb.provider_ref_missing_rate * 100 : 0, color: '#334155', pending: false },
      {
        label: 'Multi-Match',
        pct: collision != null ? collision * 100 : 0,
        color: '#64748b',
        pending: collision == null,
      },
    ]
  }, [amb])

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-black" />
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">Ambiguity Breakdown</h2>
      </div>
      <div className="mt-6 flex items-baseline gap-3">
        <p className="text-[2rem] font-bold tabular-nums text-slate-900">
          {amb ? `${(amb.ambiguity_rate * 100).toFixed(1)}%` : '—'}
        </p>
        <p className="text-[13px] text-slate-500">Total Ambiguity Rate</p>
      </div>
      <ClientChart className="mt-8 min-h-[14rem] flex-1">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(241,245,249,0.8)' }}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 12 }}
              itemStyle={{ color: '#0f172a' }}
              formatter={(v: number, _name: string, item: { payload?: { pending?: boolean } }) => [
                item?.payload?.pending ? ambiguityCopy.chart.collisionPending : `${Number(v).toFixed(1)}%`,
                '',
              ]}
            />
            <Bar dataKey="pct" radius={[10, 10, 10, 10]} barSize={40}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.color} opacity={d.pending ? 0.25 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ClientChart>
    </article>
  )
}
