'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmtInrFromMinorExact } from '../../command-center/commandCenterFormat'
import { ClientChart } from '../../shared'
import type { LeakageComparisonChartPoint } from '../../leakage-portfolio/utils/mapLeakageComparisonSeries'

const CURRENT_COLOR = '#4a6fe6'
const PREDICTED_COLOR = '#334155'

type ConnectorLeakageExposureChartProps = {
  points: LeakageComparisonChartPoint[]
  currentLabel: string
  predictedLabel: string
  emptyMessage: string
}

export function ConnectorLeakageExposureChart({
  points,
  currentLabel,
  predictedLabel,
  emptyMessage,
}: ConnectorLeakageExposureChartProps) {
  if (points.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-center text-[14px] text-slate-600">
        {emptyMessage}
      </p>
    )
  }

  return (
    <ClientChart className="h-full w-full">
      <ResponsiveContainer width="100%" height={260} minWidth={0}>
        <AreaChart data={points} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="connectorLeakageCurrentFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CURRENT_COLOR} stopOpacity={0.2} />
              <stop offset="95%" stopColor={CURRENT_COLOR} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="connectorLeakagePredictedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PREDICTED_COLOR} stopOpacity={0.18} />
              <stop offset="95%" stopColor={PREDICTED_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
          <XAxis dataKey="period" tick={{ fill: '#64748b', fontSize: 12 }} />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={(v) =>
              v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`
            }
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              fmtInrFromMinorExact(value),
              name === 'currentLeakageMinor' ? currentLabel : predictedLabel,
            ]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
          />
          <Legend
            formatter={(value) =>
              value === 'currentLeakageMinor' ? currentLabel : predictedLabel
            }
          />
          <Area
            type="monotone"
            dataKey="currentLeakageMinor"
            stroke={CURRENT_COLOR}
            strokeWidth={2.5}
            fill="url(#connectorLeakageCurrentFill)"
            dot={{ r: 3, fill: '#fff', stroke: CURRENT_COLOR, strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="predictedLeakageMinor"
            stroke={PREDICTED_COLOR}
            strokeWidth={2.2}
            fill="url(#connectorLeakagePredictedFill)"
            dot={{ r: 3, fill: '#fff', stroke: PREDICTED_COLOR, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ClientChart>
  )
}
