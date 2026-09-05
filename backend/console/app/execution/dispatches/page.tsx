'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function RedirectInner() {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    const q = params.toString()
    router.replace(q ? `/payouts?${q}` : '/payouts?demo=sandbox')
  }, [router, params])
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
      Opening Payouts…
    </div>
  )
}

/** Legacy Dispatch & Relay URL — canonical Payouts list. */
export default function DispatchRelayRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Opening Payouts…
        </div>
      }
    >
      <RedirectInner />
    </Suspense>
  )
}
