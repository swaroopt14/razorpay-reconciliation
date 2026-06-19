'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { getAmbiguityVelocityScatter } from '@/services/payout-command/prod-api/getAmbiguityVelocityScatter'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { formatAmbiguityInr } from '../utils/formatAmbiguityInr'
import { getValueAtRiskDelta } from '../utils/ambiguityApiMappers'
import {
  AMBIGUITY_BUBBLE_LEGEND,
  BUBBLE_MAP_MAX_Z,
  batchSizeAxisTicks,
  bubbleMapSummary,
  mapAmbiguityVelocityScatter,
  type AmbiguityBubblePoint,
} from '../utils/mapAmbiguityVelocityScatter'

/** Pixel diameter range for scatter symbols — keep modest so edge bubbles stay inside the plot. */
const Z_AXIS_RANGE: [number, number] = [32, 96]
const BUBBLE_CHART_MARGIN = { top: 44, right: 40, left: 52, bottom: 64 }
/** Inset bubble centers from axis edges (as % of X domain; Y uses domain span). */
const PLOT_EDGE_INSET_PCT = 10

function clampXPlot(value: number): number {
  return Math.min(100 - PLOT_EDGE_INSET_PCT, Math.max(PLOT_EDGE_INSET_PCT, value))
}

function clampYPlot(value: number, domain: [number, number]): number {
  const [min, max] = domain
  const span = Math.max(max - min, 1)
  const pad = span * (PLOT_EDGE_INSET_PCT / 100)
  return Math.min(max - pad, Math.max(min + pad, value))
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: AmbiguityBubblePoint & { x: number; y: number; z: number } }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null

  return (
    <div className="min-w-[260px] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Batch</p>
      <p className="mt-0.5 font-mono text-[13px] font-semibold text-slate-900">{p.batchId}</p>
      <p className="mt-1 text-[11px] font-medium" style={{ color: p.bubbleColor }}>
        {p.riskTierLabel}
      </p>
      <dl className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5 text-[12px]">
        <div className="flex justify-between gap-6">
          <dt className="text-slate-500">Batch value</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {formatAmbiguityInr(p.amountValueMinor)}
          </dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-slate-500">Value at risk</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {formatAmbiguityInr(p.amountAtRiskMinor)}
          </dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-slate-500">Risk ratio</dt>
          <dd className="font-semibold tabular-nums" style={{ color: p.bubbleColor }}>
            {p.riskRatioPct.toFixed(1)}%
          </dd>
        </div>
      </dl>
    </div>
  )
}

type Props = {
  amb: AmbiguityKpiResolved | null
  batchId?: string
}

export function AmbiguityVelocityChart({ amb, batchId }: Props) {
  const [livePoints, setLivePoints] = useState<AmbiguityBubblePoint[] | null>(null)
  const [liveMaxAmountMinor, setLiveMaxAmountMinor] = useState(0)
  const [seriesLive, setSeriesLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getAmbiguityVelocityScatter({ batchId }).then((body) => {
      if (cancelled) return
      const mapped = mapAmbiguityVelocityScatter(body, { batchId })
      if (mapped.live && mapped.points.length > 0) {
        setLivePoints(mapped.points)
        setLiveMaxAmountMinor(mapped.maxAmountMinor)
        setSeriesLive(true)
      } else {
        setLivePoints(null)
        setLiveMaxAmountMinor(0)
        setSeriesLive(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [batchId])

  const points = useMemo(
    () => (seriesLive && livePoints?.length ? livePoints : []),
    [seriesLive, livePoints],
  )
  const isPreview = !seriesLive
  const maxAmountMinor = seriesLive ? liveMaxAmountMinor : 1
  const sizeTicks = useMemo(() => batchSizeAxisTicks(maxAmountMinor), [maxAmountMinor])
  const summary = useMemo(() => bubbleMapSummary(points), [points])

  const yDomain = useMemo((): [number, number] => {
    const vals = points.map((p) => p.riskRatioPct)
    const max = Math.max(...vals, 10)
    return [0, Math.min(100, Math.ceil(max * 1.15))]
  }, [points])

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        x: clampXPlot(p.sizePct),
        y: clampYPlot(p.riskRatioPct, yDomain),
        z: p.bubbleSizePct,
      })),
    [points, yDomain],
  )

  const totalAtRisk = formatAmbiguityInr(amb?.value_at_risk_minor)
  const confidencePct =
    amb?.avg_attachment_confidence != null
      ? `${(amb.avg_attachment_confidence * 100).toFixed(1)}%`
      : '—'
  const varDelta = getValueAtRiskDelta(amb)

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full" style={{ background: '#000000' }} />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#000000]">
            Ambiguity Velocity
          </span>
          <span className="rounded-full bg-[#e8eef5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#103a9e]">
            Bubble map
          </span>
          {isPreview ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Awaiting live data
            </span>
          ) : null}
        </div>
        <p className="text-[11px] font-medium text-[#00239C]">
          X = batch size · Y = risk % · size = √batch value · color = risk tier
        </p>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-[12px] font-medium text-[#00239C]">Total Value at Risk</p>
          <p className="mt-1 text-[2rem] font-bold tabular-nums leading-none text-[#000000]">
            {totalAtRisk}
            {varDelta ? (
              <span
                className="ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#000000]"
                style={{ background: '#000000' }}
              >
                {varDelta.startsWith('-') ? '▼' : '▲'} {varDelta.replace(/^[+-]/, '')}
              </span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-[12px] font-medium text-[#00239C]">Avg Match Confidence</p>
          <p className="mt-1 text-[2rem] font-bold tabular-nums leading-none text-[#000000]">
            {confidencePct}
          </p>
        </div>
      </div>

      <div className="relative mt-6 h-[380px] w-full min-h-[380px] overflow-visible">
        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={BUBBLE_CHART_MARGIN}>
                <CartesianGrid vertical horizontal stroke="#e2e8f0" strokeOpacity={0.55} strokeWidth={1} />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 100]}
                  ticks={sizeTicks.map((t) => t.value)}
                  tickFormatter={(pct) => sizeTicks.find((t) => t.value === pct)?.label ?? ''}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  label={{
                    value: 'Batch size (payment value)',
                    position: 'bottom',
                    offset: 0,
                    fill: '#94a3b8',
                    fontSize: 10,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={yDomain}
                  unit="%"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  width={48}
                  label={{
                    value: 'Risk ratio',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 12,
                    fill: '#94a3b8',
                    fontSize: 10,
                  }}
                />
                <ZAxis type="number" dataKey="z" range={Z_AXIS_RANGE} domain={[0, BUBBLE_MAP_MAX_Z]} />
                <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '4 4', stroke: '#94a3b8' }} />
                <Scatter
                  name="Batches"
                  data={chartData}
                  fill="#4a6fe6"
                  fillOpacity={0.55}
                  stroke="transparent"
                  strokeWidth={0}
                  isAnimationActive={false}
                >
                  {chartData.map((p) => (
                    <Cell
                      key={`${p.batchId}-${p.amountValueMinor}`}
                      fill={p.bubbleColor}
                      stroke={p.bubbleColor}
                      fillOpacity={0.55}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
            <p className="text-[13px] font-medium text-[#00239C]">No batches to display.</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 border-t border-slate-100 pt-3 sm:gap-6">
        {AMBIGUITY_BUBBLE_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="inline-block h-3.5 w-3.5 rounded-full border border-white shadow-sm"
              style={{ background: item.color }}
            />
            <span className="text-[11px] font-medium text-slate-600">
              {item.label}
              {item.hint ? <span className="text-slate-400"> · {item.hint}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-600">
          <span className="font-semibold text-slate-900">{summary.batchCount}</span> batches
          {batchId ? (
            <>
              {' '}
              · filtered to <span className="font-semibold text-slate-900">{batchId}</span>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {summary.byTier
            .filter((entry) => entry.count > 0)
            .map((entry) => (
              <span
                key={entry.tier}
                className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600"
              >
                {entry.tier} · {entry.count}
              </span>
            ))}
        </div>
      </div>
    </article>
  )
}
