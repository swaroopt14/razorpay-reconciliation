'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Payout Command View is session-scoped: unauthenticated or tenant-less users
 * are redirected to console login (returnTo preserves deep links).
 */
export default function PayoutCommandViewLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const returnTo = pathname || '/payout-command-view'
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (cancelled) return
        if (!res.ok) {
          router.replace(`/console/login?returnTo=${encodeURIComponent(returnTo)}`)
          return
        }
        const data = (await res.json().catch(() => null)) as {
          user?: { tenant_id?: string }
          session?: { tenant_id?: string }
        } | null
        const tid = data?.session?.tenant_id?.trim() || data?.user?.tenant_id?.trim()
        if (!tid) {
          router.replace(`/console/login?returnTo=${encodeURIComponent(returnTo)}`)
        }
      } catch {
        if (cancelled) return
        // Network / dev-server hiccup — treat as unauthenticated instead of crashing the route.
        router.replace(`/console/login?returnTo=${encodeURIComponent(returnTo)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router, pathname])

  return <>{children}</>
}
