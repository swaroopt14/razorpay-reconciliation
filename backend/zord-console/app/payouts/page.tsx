'use client'

import { Suspense } from 'react'
import { FinanceConsoleShell } from '@/features/payout-command/finance-ops/FinanceConsoleShell'
import { FinanceRouteBootstrap } from '@/features/payout-command/finance-ops/FinanceRouteBootstrap'
import { PayoutsSurface } from '@/features/payout-command/finance-ops/PayoutsSurface'

export default function PayoutsRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading payouts…
        </div>
      }
    >
      <FinanceRouteBootstrap>
        <FinanceConsoleShell activeDock="home">
          <PayoutsSurface />
        </FinanceConsoleShell>
      </FinanceRouteBootstrap>
    </Suspense>
  )
}
