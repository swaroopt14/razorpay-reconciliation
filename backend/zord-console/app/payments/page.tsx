'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { PaymentTracePage } from '@/features/payout-command/payment-trace/PaymentTracePage'

/**
 * Payment list entry - opens Payment Trace table (Spec 7.10).
 * Deep link a single payout via `/payments/:id/trace`.
 */
function PaymentsBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function PaymentsIndexPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading payments…
        </div>
      }
    >
      <PaymentsBootstrap>
        <PaymentTracePage />
      </PaymentsBootstrap>
    </Suspense>
  )
}
