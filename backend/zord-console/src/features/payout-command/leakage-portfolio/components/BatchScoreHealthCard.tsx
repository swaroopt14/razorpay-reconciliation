'use client'

import type { PatternsKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { displayApiField } from '../../shared/formatApiKpiFields'
import { HOME_TITLE_BLACK } from '../../command-center/homeCommandCenterTokens'

type BatchScoreHealthCardProps = {
  patterns: PatternsKpiResolved | null
  loading?: boolean
  batchId?: string
  emptyReason?: string
}

function BatchScoreHealthSkeleton() {
  return (
    <div className="space-y-4" data-testid="batch-score-health-loading">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-52 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="space-y-2 text-right">
          <div className="ml-auto h-8 w-16 animate-pulse rounded bg-slate-100" />
          <div className="ml-auto h-4 w-24 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            <div className="h-3 animate-pulse rounded-full bg-slate-100" />
            <div className="h-4 w-6 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 text-center">
            <div className="mx-auto h-6 w-10 animate-pulse rounded bg-slate-100" />
            <div className="mx-auto h-3 w-14 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function BatchScoreHealthCard({ patterns, loading, batchId, emptyReason }: BatchScoreHealthCardProps) {
  const scopedBatchId = batchId?.trim() || undefined
  const drivers = patterns?.risk_driver_breakdown ?? []
  const isEmpty = !loading && !patterns

  return (
    <article
      className="relative overflow-hidden rounded-[14px] border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="batch-score-health"
      data-scope={scopedBatchId ? 'batch' : 'tenant'}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#f97316] to-[#ef4444]" />
      {loading ? (
        <BatchScoreHealthSkeleton />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>Batch score health</h3>
              <p className="mt-0.5 text-[14px] font-medium text-[#00239C]">
                {scopedBatchId ? (
                  <>
                    <span className="font-mono">{displayApiField(scopedBatchId)}</span>
                    <span className="ml-1">batch</span>
                  </>
                ) : (
                  <>
                    {displayApiField(patterns?.total_count)}
                    <span className="ml-1">batches this cycle</span>
                  </>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[28px] font-semibold leading-none text-[#b91c1c] tabular-nums">
                {displayApiField(patterns?.batch_risk_score)}
              </p>
              <p className="text-[13px] font-semibold text-[#00239C]">batch risk score</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {drivers.length === 0 ? (
              <p className="text-[14px] font-medium text-[#00239C]">{displayApiField(null)}</p>
            ) : (
              drivers.map((row) => (
                <div key={row.label} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
                  <span className="text-[14px] font-semibold text-[#00239C]">{displayApiField(row.label)}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#ef4444]"
                      style={{
                        width: `${Math.min(100, Math.max(0, Number(row.share_pct) || 0))}%`,
                      }}
                    />
                  </div>
                  <span className={`w-8 text-right text-[15px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
                    {displayApiField(row.count)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-center">
            <div>
              <p className={`text-[20px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
                {displayApiField(patterns?.ambiguous_count)}
              </p>
              <p className="text-[12px] font-semibold text-slate-500">flagged</p>
            </div>
            <div>
              <p className={`text-[20px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
                {displayApiField(patterns?.batch_quality_score)}
              </p>
              <p className="text-[12px] font-semibold text-slate-500">match conf</p>
            </div>
            <div>
              <p className={`text-[20px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
                {displayApiField(patterns?.total_count)}
              </p>
              <p className="text-[12px] font-semibold text-slate-500">decisions</p>
            </div>
          </div>

          {isEmpty && emptyReason ? (
            <p className="mt-4 text-center text-[13px] font-medium text-slate-500">{emptyReason}</p>
          ) : null}
        </>
      )}
    </article>
  )
}
