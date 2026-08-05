'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { OutcomeReviewPage } from '@/features/payout-command/outcome-review/OutcomeReviewPage'

/**
 * Spec 7.12 - Outcome Review (`/settlement/review`).
 * Resolve where actual outcomes differ from authorised expectations.
 */
function OutcomeBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function OutcomeReviewRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading Outcome Review…
        </div>
      }
    >
      <OutcomeBootstrap>
        <OutcomeReviewPage />
      </OutcomeBootstrap>
    </Suspense>
  )
}
