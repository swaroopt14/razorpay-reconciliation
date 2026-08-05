'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { DispatchRelayPage } from '@/features/payout-command/dispatch-relay/DispatchRelayPage'

/**
 * Spec 7.9 - Dispatch & Relay (`/execution/dispatches`).
 */
function DispatchBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function DispatchRelayRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading Dispatch & Relay…
        </div>
      }
    >
      <DispatchBootstrap>
        <DispatchRelayPage />
      </DispatchBootstrap>
    </Suspense>
  )
}
