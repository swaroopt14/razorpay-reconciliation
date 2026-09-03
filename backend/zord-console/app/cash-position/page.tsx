'use client'

import { Suspense } from 'react'
import { FinanceConsoleShell } from '@/features/payout-command/finance-ops/FinanceConsoleShell'
import { FinanceRouteBootstrap } from '@/features/payout-command/finance-ops/FinanceRouteBootstrap'
import { CashPositionSurface } from '@/features/payout-command/finance-ops/CashPositionSurface'

export default function CashPositionRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading cash position…
        </div>
      }
    >
      <FinanceRouteBootstrap>
        <FinanceConsoleShell activeDock="home">
          <CashPositionSurface />
        </FinanceConsoleShell>
      </FinanceRouteBootstrap>
    </Suspense>
  )
}
