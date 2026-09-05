'use client'

import { DM_Mono } from 'next/font/google'
import type { MatchingExecutionHeatmap } from '@/services/payout-command/prod-api/intelligenceTypes'
import { displayApiField } from '../../shared/formatApiKpiFields'
import { HOME_TITLE_BLACK } from '../../command-center/homeCommandCenterTokens'
import { ZORD_SURFACE_MUTED } from '../../command-center/homeSurfaceFonts'
import {
  buildHeatmapColumnStats,
  countBatchesWithActiveReview,
  topReviewColumn,
  type HeatmapColumnStat,
} from '../utils/matchingHeatmapLayout'

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

function ColumnIntensityBar({ stat }: { stat: HeatmapColumnStat }) {
  const total = stat.reviewing + stat.syncing + stat.idle
  if (total <= 0) return <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" />

  const reviewingPct = (stat.reviewing / total) * 100
  const syncingPct = (stat.syncing / total) * 100
  const idlePct = (stat.idle / total) * 100

  return (
    <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-100">
      {stat.reviewing > 0 ? (
        <div className="bg-violet-700" style={{ width: `${reviewingPct}%` }} />
      ) : null}
      {stat.syncing > 0 ? (
        <div className="bg-violet-300" style={{ width: `${syncingPct}%` }} />
      ) : null}
      {stat.idle > 0 ? (
        <div className="bg-slate-200" style={{ width: `${idlePct}%` }} />
      ) : null}
    </div>
  )
}

type Props = {
  heatmap: MatchingExecutionHeatmap
}

export function MatchingHeatmapFocusPanel({ heatmap }: Props) {
  const columnStats = buildHeatmapColumnStats(heatmap)
  const activeReviewBatches = countBatchesWithActiveReview(heatmap.cells)
  const leadColumn = topReviewColumn(columnStats)
  const intentsUnderReview = displayApiField(heatmap.intents_under_evaluation_count)
  const highReviewCount = heatmap.cells.flat().filter((v) => v === 2).length

  return (
    <div
      className="flex h-full min-h-[340px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="matching-heatmap-focus-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>
            Match state focus
          </h3>
          <p className={`mt-0.5 text-[13px] ${ZORD_SURFACE_MUTED}`}>Where ambiguous &amp; unresolved signals cluster</p>
        </div>
        {highReviewCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-800">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-600" />
            {displayApiField(highReviewCount)} hot
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-center">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">In review</dt>
          <dd className={`mt-0.5 text-[20px] font-bold tabular-nums text-violet-800 ${dmMono.className}`}>
            {displayApiField(activeReviewBatches)}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-center">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Evaluating</dt>
          <dd className={`mt-0.5 text-[20px] font-bold tabular-nums text-violet-800 ${dmMono.className}`}>
            {intentsUnderReview}
          </dd>
        </div>
      </dl>

      {leadColumn && leadColumn.reviewing > 0 ? (
        <p className="mt-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-[13px] font-medium text-violet-950">
          Peak cluster: <span className="font-semibold">{leadColumn.fullLabel}</span> (
          {displayApiField(leadColumn.reviewing)} batches)
        </p>
      ) : null}

      <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
        {columnStats.map((stat) => (
          <div key={stat.label} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#00239C]">{stat.fullLabel}</p>
              <ColumnIntensityBar stat={stat} />
            </div>
            <span className={`shrink-0 text-[12px] font-semibold tabular-nums text-slate-700 ${dmMono.className}`}>
              {displayApiField(stat.count)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        <span className="h-2.5 w-2.5 rounded-sm bg-violet-700" />
        <span className="text-[11px] font-medium text-slate-600">Review</span>
        <span className="h-2.5 w-2.5 rounded-sm bg-violet-300" />
        <span className="text-[11px] font-medium text-slate-600">Sync</span>
        <span className="h-2.5 w-2.5 rounded-sm bg-slate-200 ring-1 ring-slate-300" />
        <span className="text-[11px] font-medium text-slate-600">Healthy</span>
      </div>
    </div>
  )
}
