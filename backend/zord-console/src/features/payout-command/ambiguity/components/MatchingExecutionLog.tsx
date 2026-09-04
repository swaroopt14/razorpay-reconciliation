'use client'

import { Fragment } from 'react'
import { Grid3X3, RadioTower } from 'lucide-react'
import type { MatchingExecutionHeatmap } from '@/services/payout-command/prod-api/intelligenceTypes'
import { displayApiField, formatApiCount } from '../../shared/formatApiKpiFields'
import { columnFullLabel } from '../utils/matchingHeatmapLayout'

function cellClass(value: number) {
  if (value === 2) return 'bg-[#0B1324] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]'
  if (value === 1) return 'bg-[#0B1324] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]'
  return 'bg-[#F1F5F9] ring-1 ring-[#0B1324]/20'
}

function cellTitle(value: number) {
  if (value === 2) return 'Needs review'
  if (value === 1) return 'In review'
  return 'Clear'
}

function rowLabel(heatmap: MatchingExecutionHeatmap, rowIdx: number) {
  return heatmap.y_labels?.[rowIdx] ?? heatmap.batch_ids?.[rowIdx] ?? String(rowIdx + 1)
}

type Props = {
  heatmap?: MatchingExecutionHeatmap | null
  summary?: string | null
  heatmapLoading?: boolean
}

function ExecutionLogEmpty({ loading }: { loading?: boolean }) {
  return (
    <section
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
      data-testid="matching-execution-log"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
            <Grid3X3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Execution log</p>
            <h3 className="mt-1 text-[1.2rem] font-semibold leading-tight text-slate-950">
              Match signal matrix
            </h3>
            <p className="mt-1 text-[13px] font-medium text-slate-500">
              Batch rows by API-provided match-signal states.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase text-slate-500">
          API heatmap
        </span>
      </div>

      <div className="grid min-h-[338px] place-items-center bg-slate-50 p-5">
        <div className="max-w-[24rem] rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center">
          <Grid3X3 className="mx-auto h-5 w-5 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-[13px] font-semibold text-slate-600">
            {loading
              ? 'Loading matching execution heatmap.'
              : 'Matching execution heatmap was not returned by the ambiguity API.'}
          </p>
          <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-400">
            This panel will render the matrix when `matching_execution_heatmap` is present.
          </p>
        </div>
      </div>
    </section>
  )
}

export function MatchingExecutionLog({ heatmap, summary, heatmapLoading }: Props) {
  const xLabels = heatmap?.x_labels ?? []
  const cells = heatmap?.cells ?? []
  const rowCount = cells.length
  const colCount = Math.max(xLabels.length, cells[0]?.length ?? 1)
  const columnTotals = heatmap?.column_totals ?? []

  if (heatmapLoading && !heatmap) {
    return <ExecutionLogEmpty loading />
  }

  if (!heatmap || cells.length === 0 || xLabels.length === 0) {
    return <ExecutionLogEmpty />
  }

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
      data-testid="matching-execution-log"
    >
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                <Grid3X3 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Execution log</p>
                <h3 className="mt-1 text-[1.2rem] font-semibold leading-tight text-slate-950">
                  Match signal matrix
                </h3>
                <p className="mt-1 text-[13px] font-medium text-slate-500">
                  Batch rows by API-provided match-signal states.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0B1324]/15 bg-[#F1F5F9] px-3 py-1 text-[10px] font-bold uppercase text-[#0B1324]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0B1324]" />
              Live
            </span>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div
              className="w-full"
              style={{
                display: 'grid',
                gridTemplateColumns: `3.25rem repeat(${colCount}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rowCount}, 2rem) 2.25rem`,
                gap: '5px',
              }}
            >
              {cells.map((row, rowIdx) => (
                <Fragment key={heatmap.batch_ids?.[rowIdx] ?? rowIdx}>
                  <span
                    className="flex items-center truncate pr-2 text-[11px] font-semibold text-slate-500"
                    title={heatmap.batch_ids?.[rowIdx]}
                  >
                    {rowLabel(heatmap, rowIdx)}
                  </span>
                  {row.map((cell, colIdx) => (
                    <span
                      key={`${rowIdx}-${colIdx}`}
                      className={`rounded-md ${cellClass(cell)}`}
                      title={`${rowLabel(heatmap, rowIdx)} · ${columnFullLabel(xLabels[colIdx] ?? '')}: ${cellTitle(cell)}`}
                    />
                  ))}
                </Fragment>
              ))}

              <span aria-hidden />
              {xLabels.map((label) => (
                <span
                  key={label}
                  className="truncate text-center text-[10px] font-bold uppercase text-slate-400"
                  title={columnFullLabel(label)}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {summary ? (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-[13px] font-medium leading-relaxed text-slate-600">
              {summary}
            </p>
          ) : null}
        </div>

        <aside className="border-t border-slate-100 bg-slate-950 p-4 text-white xl:border-l xl:border-t-0 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white">
              <RadioTower className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase text-white/45">API focus</p>
              <p className="text-[13px] font-semibold text-white">Execution summary</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] font-bold uppercase text-white/45">Intents under evaluation</p>
            <p className="mt-3 text-[2.2rem] font-semibold leading-none tabular-nums text-white">
              {formatApiCount(heatmap.intents_under_evaluation_count)}
            </p>
          </div>

          {columnTotals.length > 0 ? (
            <div className="mt-3 space-y-2">
              {columnTotals.map((value, index) => {
                const label = xLabels[index] ?? String(index + 1)
                return (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                    <span className="truncate text-[12px] font-semibold text-white/65" title={columnFullLabel(label)}>
                      {label}
                    </span>
                    <span className="text-[12px] font-bold tabular-nums text-white">{displayApiField(value)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-white/15 p-4 text-[12px] font-semibold text-white/45">
              Column totals were not returned for this scope.
            </p>
          )}
        </aside>
      </div>
    </section>
  )
}
