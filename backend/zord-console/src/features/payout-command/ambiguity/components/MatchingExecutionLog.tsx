'use client'

import type {
  AmbiguityKpiResolved,
  MatchingExecutionHeatmap,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { getMatchingHeatmap, getMatchingSummary } from '../utils/ambiguityApiMappers'

function cellClass(v: number) {
  if (v === 2) return 'bg-black'
  if (v === 1) return 'bg-neutral-400'
  return 'bg-slate-100'
}

type Props = {
  amb: AmbiguityKpiResolved | null
  heatmap?: MatchingExecutionHeatmap | null
  heatmapLoading?: boolean
}

export function MatchingExecutionLog({ amb, heatmap: heatmapProp, heatmapLoading }: Props) {
  const heatmap = getMatchingHeatmap(amb, heatmapProp)
  const summary = getMatchingSummary(amb, heatmapProp)
  const yLabels = heatmap?.y_labels ?? []
  const xLabels = heatmap?.x_labels ?? []
  const cells = heatmap?.cells ?? []

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-black" />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#000000]">
            Matching Execution Log
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-black px-3 py-1">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-white">Live Feed</span>
        </div>
      </div>

      <div className="mt-5 flex flex-1 gap-2">
        {heatmap ? (
          <>
            <div className="flex flex-col justify-between pr-1 text-[10px] font-semibold tabular-nums text-slate-400">
              {yLabels.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              {cells.map((row, rIdx) => (
                <div
                  key={rIdx}
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                >
                  {row.map((cell, cIdx) => (
                    <div
                      key={cIdx}
                      className={`aspect-square w-full rounded-sm ${cellClass(cell)}`}
                      style={{ minHeight: 20 }}
                    />
                  ))}
                </div>
              ))}
              {xLabels.length > 0 ? (
                <div
                  className="mt-1 grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${xLabels.length}, minmax(0, 1fr))` }}
                >
                  {xLabels.map((l) => (
                    <span key={l} className="text-center text-[9px] font-medium text-slate-400">
                      {l}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : heatmapLoading ? (
          <div className="flex min-h-[160px] flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
            <p className="text-[12px] font-medium text-slate-500">Loading matching execution heatmap…</p>
          </div>
        ) : (
          <div className="flex min-h-[160px] flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
            <p className="text-[12px] font-medium text-[#00239C]">
              Heatmap not available for this tenant yet.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Intensity
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-black" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reviewing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-neutral-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Syncing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-slate-100" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Idle</span>
            </div>
          </div>
        </div>
        {summary ? (
          <p className="mt-3 text-[11px] font-medium leading-relaxed text-[#00239C]">{summary}</p>
        ) : (
          <p className="mt-3 text-[11px] font-medium text-slate-400">—</p>
        )}
      </div>
    </article>
  )
}
