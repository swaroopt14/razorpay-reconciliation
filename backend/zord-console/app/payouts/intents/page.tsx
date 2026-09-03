'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { isDemoQuery } from '@/services/payout-command/demo/ycDemoConstants'

/**
 * Spec 7.6 - Intent Journal canonical route `/payouts/intents`.
 * Redirects into the existing journal surface (`dock=grid`) so chrome and data stay shared.
 */
function IntentsRedirect() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const q = new URLSearchParams()
    q.set('dock', 'grid')
    const batch = params.get('batch_id')?.trim() || params.get('client_batch_id')?.trim()
    if (batch) {
      q.set('batch_id', batch)
      q.set('client_batch_id', batch)
    }
    const filter = params.get('filter')
    if (filter) q.set('filter', filter)
    if (isDemoQuery(params.get('demo'))) q.set('demo', 'sandbox')
    router.replace(`/sandbox?${q.toString()}`)
  }, [router, params])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
      Opening Intent Journal…
    </div>
  )
}

export default function PayoutsIntentsRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Opening Intent Journal…
        </div>
      }
    >
      <IntentsRedirect />
    </Suspense>
  )
}
