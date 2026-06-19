'use client'

import { tenantZordIdSuffix } from '@/services/payout-command/prod-api/tenantDisplay'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'

type BatchWorkspaceBarProps = {
  tenantId: string
  tenantReady: boolean
  isSandbox: boolean
  activeBatchId: string
  onSelectBatch: () => void
  onRefresh: () => void
  refreshing?: boolean
}

export function BatchWorkspaceBar({
  tenantId,
  tenantReady,
  isSandbox,
  activeBatchId,
  onSelectBatch,
  onRefresh,
  refreshing,
}: BatchWorkspaceBarProps) {
  const companyLabel = tenantReady && tenantId.trim() ? tenantZordIdSuffix(tenantId) : BATCH_REVIEW_COPY.workspace.notLoaded
  const batchLabel = activeBatchId.trim() || BATCH_REVIEW_COPY.workspace.notSelected

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-4 shadow-[0_2px_14px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
        {BATCH_REVIEW_COPY.workspace.title}
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-[12px] text-[#64748b]">{BATCH_REVIEW_COPY.workspace.company}</dt>
          <dd className="mt-0.5 text-[14px] font-semibold text-[#0f172a]">{companyLabel}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-[#64748b]">{BATCH_REVIEW_COPY.workspace.environment}</dt>
          <dd className="mt-0.5 text-[14px] font-semibold text-[#0f172a]">
            {isSandbox ? BATCH_REVIEW_COPY.workspace.environmentSandbox : BATCH_REVIEW_COPY.workspace.environmentLive}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-[#64748b]">{BATCH_REVIEW_COPY.workspace.currentBatch}</dt>
          <dd className="mt-0.5 truncate font-mono text-[13px] font-medium text-[#0f172a]" title={batchLabel}>
            {batchLabel}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelectBatch}
          className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-3.5 text-[13px] font-medium text-[#0f172a] transition hover:bg-slate-50"
        >
          {BATCH_REVIEW_COPY.workspace.selectBatch}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-9 rounded-lg bg-[#2563eb] px-3.5 text-[13px] font-medium text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : BATCH_REVIEW_COPY.workspace.refresh}
        </button>
      </div>
    </div>
  )
}
