'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { DEMO_ACTION_CONTRACT_ID } from '@/services/payout-command/demo/actionContractDemo'
import { ActionContractPage } from '@/features/payout-command/action-contract/ActionContractPage'

/**
 * Spec 7.8 - Payment Action Contract (`/contracts/:id`).
 * Highest polish investment - central Zord primitive.
 */
function ContractBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

function ContractRouteInner() {
  const params = useParams()
  const raw = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : ''
  const contractId = decodeURIComponent(raw || DEMO_ACTION_CONTRACT_ID)

  return <ActionContractPage contractId={contractId} />
}

export default function PaymentActionContractRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading Payment Action Contract…
        </div>
      }
    >
      <ContractBootstrap>
        <ContractRouteInner />
      </ContractBootstrap>
    </Suspense>
  )
}
