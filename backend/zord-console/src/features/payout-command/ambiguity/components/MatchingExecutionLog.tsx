'use client'

import { Fragment } from 'react'
import type {
  AmbiguityKpiResolved,
  MatchingExecutionHeatmap,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { getMatchingHeatmap, getMatchingSummary } from '../utils/ambiguityApiMappers'
import { HOME_TITLE_BLACK } from '../../command-center/homeCommandCenterTokens'
import { ZORD_SURFACE_MUTED } from '../../command-center/homeSurfaceFonts'
import { MatchingHeatmapFocusPanel } from './MatchingHeatmapFocusPanel'
import { columnFullLabel } from '../utils/matchingHeatmapLayout'

function cellClass(v: number) {
  if (v === 2) return 'bg-violet-700'
  if (v === 1) return 'bg-violet-300'
  return 'bg-slate-100 ring-1 ring-slate-200/80'
}

function cellTitle(v: number): string {
  if (v === 2) return 'Needs review'
  if (v === 1) return 'Syncing'
  return 'Healthy'
}

function formatBatchDateLabel(year: string, month: string, day: string): string {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.toLocaleString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function rowLabel(heatmap: MatchingExecutionHeatmap, rowIdx: number): string {
  const batchId = heatmap.batch_ids?.[rowIdx]
  if (batchId) {
    const isoInId = batchId.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (isoInId) {
      const [, year, month, day] = isoInId
      return formatBatchDateLabel(year, month, day)
    }
    return batchId.length <= 14 ? batchId : batchId.slice(-14)
  }
  return String(heatmap.y_labels[rowIdx] ?? rowIdx + 1)
}

type Props = {
  amb: AmbiguityKpiResolved | null
  heatmap?: MatchingExecutionHeatmap | null
  heatmapLoading?: boolean
}

export function MatchingExecutionLog({ amb, heatmap: heatmapProp, heatmapLoading }: Props) {
  const heatmap = getMatchingHeatmap(amb, heatmapProp)
  const summary = getMatchingSummary(amb, heatmapProp)
  const xLabels = heatmap?.x_labels ?? []
  const cells = heatmap?.cells ?? []
  const rowCount = cells.length
  const colCount = Math.max(xLabels.length, cells[0]?.length ?? 1)

  if (heatmapLoading && !heatmap) {
    return (
      <div
        className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-5"
        data-testid="matching-execution-log"
      >
        <p className="text-[14px] font-medium text-slate-500">Loading matching execution heatmap…</p>
      </div>
    )
  }

  if (!heatmap) {
    return (
      <div
        className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-5"
        data-testid="matching-execution-log"
      >
        <p className="text-[14px] font-medium text-[#00239C]">Heatmap not available for this tenant yet.</p>
      </div>
    )
  }

  return (
    <section
      className="grid gap-3 md:grid-cols-5 md:items-stretch"
      data-testid="matching-execution-log"
    >
      <article className="relative flex min-h-[340px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#000000] via-[#7c3aed] to-[#4c1d95]" />

        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <h3 className={`text-[1.2rem] font-semibold tracking-[-0.01em] ${HOME_TITLE_BLACK}`}>
              Matching execution log
            </h3>
            <p className={`mt-0.5 text-[13px] ${ZORD_SURFACE_MUTED}`}>
              Batch × match-signal grid — darker cells need attention
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-violet-700 px-2.5 py-1">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white">Live</span>
          </div>
        </div>

        {/* Fluid grid — fills card interior; card outer size unchanged */}
        <div
          className="mt-3 min-h-0 flex-1"
          style={{
            display: 'grid',
            gridTemplateColumns: `1.75rem repeat(${colCount}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr)) auto`,
            gap: '3px',
          }}
        >
          {cells.map((row, rIdx) => (
            <Fragment key={rIdx}>
              <span
                className="flex items-center justify-end pr-0.5 text-[11px] font-semibold tabular-nums leading-none text-slate-500"
                title={heatmap.batch_ids?.[rIdx]}
              >
                {rowLabel(heatmap, rIdx)}
              </span>
              {row.map((cell, cIdx) => (
                <div
                  key={cIdx}
                  className={`min-h-0 min-w-0 rounded-[3px] ${cellClass(cell)}`}
                  title={`Batch ${rowLabel(heatmap, rIdx)} · ${columnFullLabel(xLabels[cIdx] ?? '')}: ${cellTitle(cell)}`}
                />
              ))}
            </Fragment>
          ))}

          <span aria-hidden className="min-h-0" />
          {xLabels.map((l) => (
            <span
              key={`x-${l}`}
              className="truncate pt-0.5 text-center text-[10px] font-semibold leading-tight text-slate-500"
              title={columnFullLabel(l)}
            >
              {l}
            </span>
          ))}
        </div>

        {summary ? (
          <p className="mt-3 shrink-0 border-t border-slate-100 pt-3 text-[12px] font-medium leading-relaxed text-[#00239C]">
            {summary}
          </p>
        ) : null}
      </article>

      <article className="flex min-h-[340px] flex-col md:col-span-2">
        <MatchingHeatmapFocusPanel heatmap={heatmap} />
      </article>
    </section>
  )
}
