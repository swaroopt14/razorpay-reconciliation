'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { PaymentTracePage } from '@/features/payout-command/payment-trace/PaymentTracePage'

/**
 * Spec 7.10 - Payment Trace (`/payments/:id/trace`).
 */
function TraceBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

function TraceRouteInner() {
  const params = useParams()
  const raw = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : ''
  const paymentId = decodeURIComponent(raw || '')

  return <PaymentTracePage paymentId={paymentId} />
}

export default function PaymentTraceRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading Payment Trace…
        </div>
      }
    >
      <TraceBootstrap>
        <TraceRouteInner />
      </TraceBootstrap>
    </Suspense>
  )
}
