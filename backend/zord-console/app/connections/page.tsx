'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { ConnectionsPage } from '@/features/payout-command/connections/ConnectionsPage'

/**
 * Spec 7.3 - Connections (`/connections`).
 * Optional `?demo=sandbox` seeds the prepared demo session.
 */
function ConnectionsBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function ConnectionsRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading connections…
        </div>
      }
    >
      <ConnectionsBootstrap>
        <ConnectionsPage />
      </ConnectionsBootstrap>
    </Suspense>
  )
}
