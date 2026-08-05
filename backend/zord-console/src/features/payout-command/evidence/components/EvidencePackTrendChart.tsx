'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { EvidenceTrendPoint } from '../selectors/deriveEvidenceAnalytics'
import { EVIDENCE_VOLUME_DAYS } from '../selectors/deriveEvidenceAnalytics'
import { EVIDENCE_CARD } from '../evidencePageTokens'
import { EvidenceSectionHeader } from './EvidenceSectionHeader'

type Props = {
  trend: EvidenceTrendPoint[]
  preview?: boolean
}

const BAR_FILL = '#4a6fe6'
const BAR_FILL_ALT = '#103a9e'

/** Show ~6 ticks across 30 days so labels stay readable. */
function shouldShowTick(index: number, total: number): boolean {
  if (total <= 8) return true
  const step = Math.max(1, Math.floor(total / 6))
  return index === 0 || index === total - 1 || index % step === 0
}

export function EvidencePackTrendChart({ trend, preview }: Props) {
  const totalPacks = trend.reduce((s, p) => s + p.count, 0)
  const hasChart = trend.length > 0 && totalPacks > 0

  return (
    <article className={`flex min-h-[280px] flex-col ${EVIDENCE_CARD}`}>
      <EvidenceSectionHeader
        title="Pack Volume"
        subtitle={`Daily histogram — last ${EVIDENCE_VOLUME_DAYS} days`}
        badge={preview ? 'Awaiting live data' : undefined}
        action={
          hasChart ? (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600">
              {totalPacks} packs
            </span>
          ) : null
        }
      />
      <div className="px-2 pb-4 pt-1">
        {hasChart ? (
          <div className="h-[220px]">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={trend}
              barCategoryGap="12%"
              margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                vertical
                horizontal
                stroke="#e2e8f0"
                strokeOpacity={0.4}
                strokeWidth={1}
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                interval={0}
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
                tickFormatter={(value, index) =>
                  shouldShowTick(index, trend.length) ? String(value) : ''
                }
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(232,238,245,0.85)', radius: 4 }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                  boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
                }}
                labelFormatter={(_, items) => {
                  const row = items?.[0]?.payload as EvidenceTrendPoint | undefined
                  return row?.label ?? ''
                }}
                formatter={(value) => [`${value ?? 0}`, 'Packs']}
              />
              <Bar
                dataKey="count"
                name="Packs"
                maxBarSize={14}
                radius={[4, 4, 0, 0]}
                fill={BAR_FILL}
                activeBar={{ fill: BAR_FILL_ALT }}
              />
            </BarChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <p className="flex h-[220px] items-center justify-center px-4 text-center text-[13px] font-medium text-[#00239C]">
            No pack volume data yet.
          </p>
        )}
      </div>
    </article>
  )
}
