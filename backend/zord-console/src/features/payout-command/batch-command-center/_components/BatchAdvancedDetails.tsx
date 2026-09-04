'use client'

import { useState } from 'react'
import { SessionTenantScopeBar } from '../../layout/SessionTenantScopeBar'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'

type BatchAdvancedDetailsProps = {
  batchId: string
  onBatchIdChange: (value: string) => void
  onAfterFetch: () => void
}

export function BatchAdvancedDetails({ batchId, onBatchIdChange, onAfterFetch }: BatchAdvancedDetailsProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-[#fafafa]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold text-[#334155]"
      >
        {BATCH_REVIEW_COPY.advancedDetails}
        <span className="text-[#64748b]">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="border-t border-[#e2e8f0] px-4 pb-4 pt-3">
          <SessionTenantScopeBar batchId={batchId} onBatchIdChange={onBatchIdChange} onAfterFetch={onAfterFetch} />
        </div>
      ) : null}
    </div>
  )
}
