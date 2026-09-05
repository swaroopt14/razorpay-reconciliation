'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { AskZordPage } from '@/features/payout-command/ask-zord/AskZordPage'

/**
 * Spec 7.16 - Ask Zord (`/ask`).
 * Ask · Act · Build with citations; AI on top of cryptographic truth.
 */
function AskBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function AskRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading Ask Zord…
        </div>
      }
    >
      <AskBootstrap>
        <AskZordPage />
      </AskBootstrap>
    </Suspense>
  )
}
