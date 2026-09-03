'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** Developer is renamed to Connections — keep this route as a soft redirect. */
function DeveloperRedirect() {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    const demo = params.get('demo')
    router.replace(demo ? `/connections?demo=${encodeURIComponent(demo)}` : '/connections')
  }, [router, params])
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
      Opening Connections…
    </div>
  )
}

export default function DeveloperRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-[13px] text-[#64748B]">
          Opening Connections…
        </div>
      }
    >
      <DeveloperRedirect />
    </Suspense>
  )
}
