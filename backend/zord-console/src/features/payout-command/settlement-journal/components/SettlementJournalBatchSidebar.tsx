'use client'

import Link from 'next/link'
import {
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import {
  type SettlementSidebarOutcome,
} from '../settlementJournalSidebarUtils'

const JOURNAL_BORDER = 'border-slate-200/90'

export type SettlementJournalBatchSidebarProps = {
  tenantReady: boolean
  clientBatches: string[]
  feedLoaded: boolean
  sidebarRows: string[]
  selectedClientBatchId: string
  selectClientBatch: (batchId: string) => void
  liveMatchOutcome: SettlementSidebarOutcome | null
  batchMatchOutcomeCache: Record<string, SettlementSidebarOutcome>
  observationTotal: number | null
  observationTotalLoading: boolean
  safeSidebarPage: number
  sidebarTotalPages: number
  setSidebarPage: (updater: (page: number) => number) => void
  batchCommandCenterHref?: string
}

export function SettlementJournalBatchSidebar({
  tenantReady,
  clientBatches,
  feedLoaded,
  sidebarRows,
  selectedClientBatchId,
  selectClientBatch,
  liveMatchOutcome,
  batchMatchOutcomeCache,
  observationTotal,
  observationTotalLoading,
  safeSidebarPage,
  sidebarTotalPages,
  setSidebarPage,
  batchCommandCenterHref = payoutBatchCommandCenterHref(false),
}: SettlementJournalBatchSidebarProps) {
  return (
    <aside className={`flex h-full flex-col overflow-hidden border-r ${JOURNAL_BORDER} bg-white`}>
      <div className="border-b border-slate-200/90 px-4 pb-3 pt-4">
        <h2 className={`text-[14px] font-semibold tracking-tight ${HOME_TITLE_BLACK}`}>Batches</h2>
        <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
          {clientBatches.length} batch{clientBatches.length === 1 ? '' : 'es'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!tenantReady ? (
          <p className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50 px-3 py-4 text-center text-[14px] text-[#64748b]">
            Sign in to load settlement batches for your workspace.
          </p>
        ) : feedLoaded && clientBatches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50 px-3 py-4 text-center text-[14px] leading-relaxed text-[#64748b]">
            No batches yet. Upload settlement from{' '}
            <Link href={batchCommandCenterHref} className="font-semibold text-[#0f172a] underline">
              Batch Command Center
            </Link>
            .
          </p>
        ) : null}

        {sidebarRows.map((batchId) => {
          const selected = batchId === selectedClientBatchId
          const cached = batchMatchOutcomeCache[batchId]
          const liveOutcome = selected ? liveMatchOutcome : cached
          const dotClass = liveOutcome?.dotClass ?? 'bg-slate-300'
          const observationCountLine =
            selected && observationTotal != null
              ? `${observationTotal.toLocaleString('en-US')} observations`
              : selected && observationTotalLoading
                ? 'Loading observations…'
                : cached
                  ? cached.label
                  : '—'

          return (
            <button
              key={batchId}
              type="button"
              onClick={() => selectClientBatch(batchId)}
              className={`mb-1.5 w-full rounded-[10px] border px-3 py-2 text-left transition ${
                selected
                  ? 'border-[#111111] bg-slate-100'
                  : 'border-transparent hover:border-slate-200/90 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
                  <span className={`truncate font-mono text-[13px] font-medium ${HOME_TITLE_BLACK}`}>
                    {batchId}
                  </span>
                </div>
                {liveOutcome && liveOutcome.progressPct > 0 ? (
                  <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${liveOutcome.toneText}`}>
                    {liveOutcome.progressPct}%
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 pl-4 text-[13px] text-[#64748b]">{observationCountLine}</p>
              {selected && liveOutcome && liveOutcome.progressPct > 0 ? (
                <div className="mt-2 space-y-1.5 pl-4">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                    <div
                      className={`h-full rounded-full ${liveOutcome.barClass}`}
                      style={{ width: `${liveOutcome.progressPct}%` }}
                    />
                  </div>
                  <p className={`text-[13px] font-semibold ${liveOutcome.toneText}`}>{liveOutcome.label}</p>
                </div>
              ) : null}
            </button>
          )
        })}
      </div>

      {sidebarTotalPages > 1 ? (
        <div className="border-t border-slate-200/90 bg-slate-50 px-3 py-2 text-[14px] text-[#64748b]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSidebarPage((p) => Math.max(1, p - 1))}
              disabled={safeSidebarPage <= 1}
              className="rounded-md border border-slate-200/90 bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span className="tabular-nums">
              {safeSidebarPage} / {sidebarTotalPages}
            </span>
            <button
              type="button"
              onClick={() => setSidebarPage((p) => Math.min(sidebarTotalPages, p + 1))}
              disabled={safeSidebarPage >= sidebarTotalPages}
              className="rounded-md border border-slate-200/90 bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  )
}
