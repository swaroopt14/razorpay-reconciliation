'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  EvidenceMixAreaPoint,
  EvidenceMixAreaSeries,
  EvidenceTypeSegment,
} from '../selectors/deriveEvidenceAnalytics'
import { EVIDENCE_CARD } from '../evidencePageTokens'
import { EvidenceSectionHeader } from './EvidenceSectionHeader'

type Props = {
  segments: EvidenceTypeSegment[]
  mixArea: EvidenceMixAreaPoint[]
  mixSeries: EvidenceMixAreaSeries[]
  preview?: boolean
}

function renderMixTooltip(
  active: boolean | undefined,
  payload: { name?: string; value?: number; color?: string }[] | undefined,
  label: string | undefined,
) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-[11px] font-semibold text-slate-500">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-4 text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <span className="h-2 w-2 rounded-sm" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="tabular-nums font-semibold text-slate-900">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function EvidencePackBreakdownChart({ segments, mixArea, mixSeries, preview }: Props) {
  const hasChart = mixArea.length > 0 && mixSeries.length > 0

  return (
    <article className={`flex min-h-[280px] flex-col ${EVIDENCE_CARD}`}>
      <EvidenceSectionHeader
        title="Pack Status Mix"
        subtitle="Complete (covered by a payment intent) vs incomplete packs in scope"
        badge={preview ? 'Awaiting live data' : undefined}
        live={!preview && hasChart}
      />
      <div className="px-3 pb-4 pt-1">
        {hasChart ? (
          <>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={mixArea} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    {mixSeries.map((s) => (
                      <linearGradient key={s.key} id={`mix-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={s.color} stopOpacity={0.45} />
                        <stop offset="95%" stopColor={s.color} stopOpacity={0.08} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    vertical
                    horizontal
                    stroke="#e2e8f0"
                    strokeOpacity={0.4}
                    strokeWidth={1}
                  />
                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    width={28}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) =>
                      renderMixTooltip(
                        active,
                        payload as Array<{ name?: string; value?: number; color?: string }> | undefined,
                        typeof label === 'string' ? label : String(label ?? ''),
                      )
                    }
                  />
                  {mixSeries.map((s) => (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stackId="mix"
                      stroke={s.color}
                      strokeWidth={2}
                      fill={`url(#mix-fill-${s.key})`}
                      fillOpacity={1}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
              {segments.map((seg) => (
                <div key={seg.name} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: seg.color }} />
                  <span className="text-[11px] font-medium text-slate-600">
                    {seg.name} · {seg.pct}%
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="flex h-[220px] items-center justify-center px-4 text-center text-[13px] font-medium text-[#00239C]">
            No pack mix data yet.
          </p>
        )}
      </div>
    </article>
  )
}
