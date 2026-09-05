'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { markSandboxSetupStep, openSandboxSetupPanel } from '@/services/payout-command/sandbox-setup-guide'
import { OperationsOverviewPage } from '@/features/payout-command/overview/OperationsOverviewPage'

/**
 * Spec 7.2 - Operations Overview (`/overview`).
 * Optional `?demo=sandbox&guide=1` seeds the prepared demo session.
 */
function OverviewBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))
  const guide = params.get('guide') === '1'

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo || guide) {
      enterDemoSession({ guide })
      markSandboxSetupStep('overview')
      if (guide) openSandboxSetupPanel()
    }
  }, [demo, guide])

  return <>{children}</>
}

export default function OverviewRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading overview…
        </div>
      }
    >
      <OverviewBootstrap>
        <OperationsOverviewPage />
      </OverviewBootstrap>
    </Suspense>
  )
}
