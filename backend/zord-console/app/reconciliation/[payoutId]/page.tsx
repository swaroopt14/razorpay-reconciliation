'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import { FinanceConsoleShell } from '@/features/payout-command/finance-ops/FinanceConsoleShell'
import { FinanceRouteBootstrap } from '@/features/payout-command/finance-ops/FinanceRouteBootstrap'
import { PayoutTraceSurface } from '@/features/payout-command/finance-ops/PayoutTraceSurface'

function TraceInner() {
  const params = useParams()
  const raw = typeof params?.payoutId === 'string' ? params.payoutId : Array.isArray(params?.payoutId) ? params.payoutId[0] : ''
  const payoutId = decodeURIComponent(raw || '')
  return <PayoutTraceSurface payoutId={payoutId} />
}

export default function ReconciliationTracePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading transaction lifecycle…
        </div>
      }
    >
      <FinanceRouteBootstrap>
        <FinanceConsoleShell activeDock="ambiguity">
          <TraceInner />
        </FinanceConsoleShell>
      </FinanceRouteBootstrap>
    </Suspense>
  )
}
