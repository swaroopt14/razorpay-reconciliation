'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { ProofCenterPage } from '@/features/payout-command/proof-center/ProofCenterPage'

/** Spec 7.14 - Proof Center list (`/proof`). */
function ProofBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function ProofCenterRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading Proof Center…
        </div>
      }
    >
      <ProofBootstrap>
        <ProofCenterPage />
      </ProofBootstrap>
    </Suspense>
  )
}
