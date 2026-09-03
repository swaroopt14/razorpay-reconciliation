'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { PaymentGapsPage } from '@/features/payout-command/payment-gaps/PaymentGapsPage'

/**
 * Spec 7.13 - Payment Gaps & Value at Risk (`/settlement/gaps`).
 */
function GapsBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function PaymentGapsRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading Payment Gaps…
        </div>
      }
    >
      <GapsBootstrap>
        <PaymentGapsPage />
      </GapsBootstrap>
    </Suspense>
  )
}
