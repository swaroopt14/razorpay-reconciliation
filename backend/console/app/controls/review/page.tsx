'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { ControlReviewPage } from '@/features/payout-command/control-review/ControlReviewPage'

/**
 * Spec 7.7 - Control Review Queue (`/controls/review`).
 * Optional `?demo=sandbox` seeds the prepared demo session.
 */
function ControlReviewBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function ControlReviewRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading Control Review…
        </div>
      }
    >
      <ControlReviewBootstrap>
        <ControlReviewPage />
      </ControlReviewBootstrap>
    </Suspense>
  )
}
