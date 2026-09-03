'use client'

import { Suspense } from 'react'
import { FinanceConsoleShell } from '@/features/payout-command/finance-ops/FinanceConsoleShell'
import { FinanceRouteBootstrap } from '@/features/payout-command/finance-ops/FinanceRouteBootstrap'
import { BatchDetailSurface } from '@/features/payout-command/finance-ops/BatchDetailSurface'

/** Batch detail — Razorpay Overview-style metrics + payments table. */
export default function TransactionBatchDetailPage({
  params,
}: {
  params: { batchId: string }
}) {
  const batchId = decodeURIComponent(params.batchId || '').trim()

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F6F8] text-[13px] text-[#6B6B6B]">
          Loading batch…
        </div>
      }
    >
      <FinanceRouteBootstrap>
        <FinanceConsoleShell activeDock="grid">
          <BatchDetailSurface batchId={batchId} />
        </FinanceConsoleShell>
      </FinanceRouteBootstrap>
    </Suspense>
  )
}
