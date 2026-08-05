'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { clearAuth, getCurrentUser, hasSessionHint, hydrateSession } from '@/services/auth'
import { UserRole } from '@/types/auth'

function getLoginRoute(pathname: string) {
  if (pathname.startsWith('/payout-command-view') || pathname.startsWith('/sandbox')) {
    return '/signin'
  }
  return '/signin'
}

function isProtectedPath(pathname: string) {
  return pathname.startsWith('/payout-command-view') || pathname.startsWith('/sandbox')
}

function isLoginPath(pathname: string) {
  return pathname === '/signin' || pathname === '/signup' || pathname === '/register'
}

function roleMatchesPath(pathname: string, role: UserRole) {
  if (pathname.startsWith('/payout-command-view') || pathname.startsWith('/sandbox')) {
    return role === 'CUSTOMER_USER' || role === 'CUSTOMER_ADMIN'
  }
  return true
}

export function AuthSessionBootstrap() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!pathname || isLoginPath(pathname) || !isProtectedPath(pathname)) {
      return
    }

    // Middleware already verified HttpOnly session cookies before this page loaded.
    // Always revalidate through /api/auth/me — do not redirect based on hint/localStorage
    // alone, or hard refresh drops users back to /signin while cookies are still valid.
    let cancelled = false

    void hydrateSession()
      .then((user) => {
        if (cancelled) return

        if (!user) {
          // hydrateSession clears client auth only on 401/403; transient failures keep hints.
          if (!hasSessionHint() && !getCurrentUser()) {
            router.replace(getLoginRoute(pathname))
          }
          return
        }

        if (!roleMatchesPath(pathname, user.role)) {
          clearAuth()
          router.replace(getLoginRoute(pathname))
        }
      })
      .catch(() => {
        /* hydrateSession is defensive; swallow stray rejections */
      })

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return null
}
