'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { ProofCenterPage } from '@/features/payout-command/proof-center/ProofCenterPage'

/** Spec 7.14 / 7.15 - Proof detail (`/proof/:id`). */
function ProofDetailBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function ProofDetailRoutePage() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : undefined

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading proof pack…
        </div>
      }
    >
      <ProofDetailBootstrap>
        <ProofCenterPage packId={id} />
      </ProofDetailBootstrap>
    </Suspense>
  )
}
