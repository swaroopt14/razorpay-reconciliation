'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getLeakageExposureTimeseries } from '@/services/payout-command/prod-api/getLeakageExposureTimeseries'
import type { LeakageExposureGranularity } from '@/services/payout-command/prod-api/intelligenceTypes'
import { leakageCopy } from '../../leakage/copy/leakageCopy'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { formatKpiMoneyMinor } from '../../shared/formatApiKpiFields'
import {
  mapLeakageComparisonSeries,
  type LeakageComparisonChartPoint,
} from '../utils/mapLeakageComparisonSeries'

type RiskAdjustedLeakageCardProps = {
  data: PortfolioLeakageViewModel
  loading?: boolean
  batchId?: string
}

const GRANULARITY_PILLS: { id: LeakageExposureGranularity; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

const CURRENT_COLOR = '#4a6fe6'
const PREDICTED_COLOR = '#334155'

function formatRangeLabel(points: LeakageComparisonChartPoint[]): string {
  if (!points.length) return '—'
  return `${points[0].label} – ${points[points.length - 1].label}`
}

function ComparisonTooltip({
  active,
  payload,
  label,
  projectStartAt,
}: {
  active?: boolean
  payload?: Array<{
    name: string
    value: number
    color: string
    payload: LeakageComparisonChartPoint
  }>
  label?: string
  projectStartAt: string | null
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  let status = 'Current period'
  if (projectStartAt && point.dateKey >= projectStartAt.slice(0, 10)) {
    status = 'Forecast zone'
  } else if (projectStartAt) {
    const start = new Date(projectStartAt)
    const d = new Date(`${point.dateKey}T12:00:00`)
    const days = Math.round((start.getTime() - d.getTime()) / 86_400_000)
    if (days > 0 && days <= 14) status = `${days} day${days === 1 ? '' : 's'} before project start`
  }

  return (
    <div className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{status}</p>
      <p className="mt-0.5 text-[12px] font-medium text-slate-600">{label ?? point.label}</p>
      <ul className="mt-2 space-y-2">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-slate-900">
              {formatKpiMoneyMinor(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function projectStartPeriod(points: LeakageComparisonChartPoint[], projectStartAt: string | null): string | undefined {
  if (!projectStartAt) return undefined
  const key = projectStartAt.slice(0, 10)
  const match = points.find((p) => p.dateKey === key)
  return match?.period ?? points.find((p) => p.dateKey >= key)?.period
}

export function RiskAdjustedLeakageCard({ data, loading, batchId }: RiskAdjustedLeakageCardProps) {
  const [granularity, setGranularity] = useState<LeakageExposureGranularity>('day')
  const [livePoints, setLivePoints] = useState<LeakageComparisonChartPoint[] | null>(null)
  const [projectStartAt, setProjectStartAt] = useState<string | null>(null)
  const [seriesLive, setSeriesLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getLeakageExposureTimeseries({ granularity, batchId }).then((body) => {
      if (cancelled) return
      const mapped = mapLeakageComparisonSeries(body)
      if (mapped.live && mapped.points.length > 0) {
        setLivePoints(mapped.points)
        setProjectStartAt(mapped.projectStartAt)
        setSeriesLive(true)
      } else {
        setLivePoints(null)
        setProjectStartAt(null)
        setSeriesLive(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [granularity, batchId])

  const chartPoints = livePoints ?? []
  const projectStart = projectStartAt
  const startPeriod = projectStartPeriod(chartPoints, projectStart)
  const rangeLabel = formatRangeLabel(chartPoints)
  const hasChartData = seriesLive && chartPoints.length > 0

  if (loading) {
    return <div className="min-h-[420px] animate-pulse rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200" />
  }

  return (
    <article className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-medium text-slate-500">{leakageCopy.chart.riskAdjustedTitle}</p>
          <p className="mt-1 text-[12px] text-slate-400">{leakageCopy.chart.helper}</p>
        </div>

        <div
          className="inline-flex rounded-full border border-slate-200 bg-slate-100/80 p-1"
          role="tablist"
          aria-label="Chart granularity"
        >
          {GRANULARITY_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              role="tab"
              aria-selected={granularity === pill.id}
              onClick={() => setGranularity(pill.id)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                granularity === pill.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-6 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CURRENT_COLOR }} />
          <div>
            <p className="font-semibold text-slate-800">{leakageCopy.chart.currentLeakage}</p>
            <p className="text-[11px] text-slate-500">{rangeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: PREDICTED_COLOR }} />
          <div>
            <p className="font-semibold text-slate-800">{leakageCopy.chart.predictedLeakage}</p>
            <p className="text-[11px] text-slate-500">{rangeLabel}</p>
          </div>
        </div>
        {!seriesLive ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            Awaiting live data
          </span>
        ) : null}
      </div>

      <div className="relative mt-4 min-h-[260px] flex-1">
        {hasChartData ? (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartPoints} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="leakageCurrentFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CURRENT_COLOR} stopOpacity={0.2} />
                <stop offset="95%" stopColor={CURRENT_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="leakagePredictedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PREDICTED_COLOR} stopOpacity={0.18} />
                <stop offset="95%" stopColor={PREDICTED_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical
              horizontal
              stroke="#e2e8f0"
              strokeOpacity={0.45}
              strokeWidth={1}
            />
            <XAxis
              dataKey="period"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              dy={8}
              interval={granularity === 'day' ? 4 : 0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              width={48}
              tickFormatter={(v) =>
                v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${Math.round(v / 1000)}k`
              }
            />
            <Tooltip
              content={
                <ComparisonTooltip projectStartAt={projectStart} />
              }
              cursor={{ stroke: CURRENT_COLOR, strokeWidth: 1.5 }}
            />
            {startPeriod ? (
              <ReferenceLine
                x={startPeriod}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{
                  value: leakageCopy.chart.projectStart,
                  position: 'insideTopRight',
                  fill: '#64748b',
                  fontSize: 9,
                  angle: -90,
                }}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="currentLeakageMinor"
              name="Current leakage"
              stroke={CURRENT_COLOR}
              strokeWidth={2.5}
              fill="url(#leakageCurrentFill)"
              dot={{ r: 3, fill: '#fff', stroke: CURRENT_COLOR, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#fff', stroke: CURRENT_COLOR, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="predictedLeakageMinor"
              name="Predicted leakage"
              stroke={PREDICTED_COLOR}
              strokeWidth={2.5}
              fill="url(#leakagePredictedFill)"
              dot={{ r: 3, fill: '#fff', stroke: PREDICTED_COLOR, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#fff', stroke: PREDICTED_COLOR, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        ) : (
          <div className="flex h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
            <p className="text-[14px] font-semibold text-slate-700">No leakage trend data yet</p>
            <p className="mt-1 max-w-sm text-[12px] text-slate-500">
              Live exposure timeseries will appear here once intelligence has enough history for this scope.
            </p>
          </div>
        )}
      </div>
    </article>
  )
}
