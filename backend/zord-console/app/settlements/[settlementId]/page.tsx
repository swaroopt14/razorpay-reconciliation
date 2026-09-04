'use client'

import { Suspense } from 'react'
import { FinanceConsoleShell } from '@/features/payout-command/finance-ops/FinanceConsoleShell'
import { FinanceRouteBootstrap } from '@/features/payout-command/finance-ops/FinanceRouteBootstrap'
import { SettlementDetailSurface } from '@/features/payout-command/finance-ops/SettlementDetailSurface'

/** Settlement batch detail — Overview + Matched / Not resolved / Failed tabs. */
export default function SettlementDetailRoutePage({
  params,
}: {
  params: { settlementId: string }
}) {
  const settlementId = decodeURIComponent(params.settlementId || '').trim()

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F6F8] text-[13px] text-[#6B6B6B]">
          Loading settlement…
        </div>
      }
    >
      <FinanceRouteBootstrap>
        <FinanceConsoleShell activeDock="settlement">
          <SettlementDetailSurface settlementId={settlementId} />
        </FinanceConsoleShell>
      </FinanceRouteBootstrap>
    </Suspense>
  )
}
