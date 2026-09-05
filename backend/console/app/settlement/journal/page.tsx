'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { persistEnvMode } from '@/services/auth/persistEnvMode'
import { enterDemoSession, isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'
import { SettlementJournalPage } from '@/features/payout-command/settlement-journal-v2/SettlementJournalPage'

/**
 * Spec 7.11 - Settlement Journal (`/settlement/journal`).
 * Intent Journal-style table → detail; distinct from Intent Journal.
 */
function SettlementBootstrap({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const demo = isDemoQuery(params.get('demo'))

  useEffect(() => {
    persistEnvMode('sandbox')
    if (demo) enterDemoSession()
  }, [demo])

  return <>{children}</>
}

export default function SettlementJournalRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-[13px] text-[#A1A1AA]">
          Loading Settlement Journal…
        </div>
      }
    >
      <SettlementBootstrap>
        <SettlementJournalPage />
      </SettlementBootstrap>
    </Suspense>
  )
}
