'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import { FinanceConsoleShell } from '@/features/payout-command/finance-ops/FinanceConsoleShell'
import { FinanceRouteBootstrap } from '@/features/payout-command/finance-ops/FinanceRouteBootstrap'
import { InvestigationDetailSurface } from '@/features/payout-command/finance-ops/InvestigationDetailSurface'

function Inner() {
  const params = useParams()
  const raw =
    typeof params?.investigationId === 'string'
      ? params.investigationId
      : Array.isArray(params?.investigationId)
        ? params.investigationId[0]
        : ''
  return <InvestigationDetailSurface investigationId={decodeURIComponent(raw || '')} />
}

export default function InvestigationDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading investigation…
        </div>
      }
    >
      <FinanceRouteBootstrap>
        <FinanceConsoleShell activeDock="home">
          <Inner />
        </FinanceConsoleShell>
      </FinanceRouteBootstrap>
    </Suspense>
  )
}
