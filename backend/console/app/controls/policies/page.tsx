'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { PolicyStudioPage } from '@/features/payout-command/policy-studio/PolicyStudioPage'

/**
 * Spec 7.5 - Policy Studio (`/controls/policies`).
 * Optional `?demo=sandbox` seeds the prepared demo session.
 */
function PolicyStudioBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function PolicyStudioRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading Policy Studio…
        </div>
      }
    >
      <PolicyStudioBootstrap>
        <PolicyStudioPage />
      </PolicyStudioBootstrap>
    </Suspense>
  )
}
