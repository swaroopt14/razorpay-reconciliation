'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { DeveloperPage } from '@/features/payout-command/developer/DeveloperPage'

/**
 * Spec 7.17 - Developer & Integrations (`/developer`).
 * Credentials relocation (P0) + full developer tabs (P1).
 */
function DeveloperBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function DeveloperRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Loading developer…
        </div>
      }
    >
      <DeveloperBootstrap>
        <DeveloperPage />
      </DeveloperBootstrap>
    </Suspense>
  )
}
