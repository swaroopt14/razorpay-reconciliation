'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { clearAuth, getCurrentUser, hasSessionHint, hydrateSession } from '@/services/auth'
import { UserRole } from '@/types/auth'

function getLoginRoute(pathname: string, _searchSuffix: string) {
  if (pathname.startsWith('/payout-command-view')) {
    return '/signin'
  }
  if (pathname.startsWith('/sandbox')) {
    return '/signin'
  }
  if (pathname.startsWith('/admin')) return '/admin/login'
  if (pathname.startsWith('/ops')) return '/ops/login'
  if (pathname.startsWith('/customer')) return '/customer/login'
  if (pathname.startsWith('/app-final')) return '/app-final/login'
  return '/signin'
}

function isProtectedPath(pathname: string) {
  return (
    pathname.startsWith('/console') ||
    pathname.startsWith('/customer') ||
    pathname.startsWith('/ops') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/app-final') ||
    pathname.startsWith('/payout-command-view') ||
    pathname.startsWith('/sandbox')
  )
}

function isLoginPath(pathname: string) {
  return (
    pathname === '/signin' ||
    pathname === '/signup' ||
    pathname === '/register' ||
    pathname === '/console/login' ||
    pathname === '/customer/login' ||
    pathname === '/ops/login' ||
    pathname === '/admin/login' ||
    pathname === '/app-final/login'
  )
}

function roleMatchesPath(pathname: string, role: UserRole) {
  if (pathname.startsWith('/admin')) return role === 'ADMIN'
  if (pathname.startsWith('/ops')) return role === 'OPS'
  if (
    pathname.startsWith('/customer') ||
    pathname.startsWith('/console') ||
    pathname.startsWith('/app-final') ||
    pathname.startsWith('/payout-command-view') ||
    pathname.startsWith('/sandbox')
  ) {
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

    const searchSuffix = typeof window !== 'undefined' ? window.location.search : ''

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
            router.replace(getLoginRoute(pathname, searchSuffix))
          }
          return
        }

        if (!roleMatchesPath(pathname, user.role)) {
          clearAuth()
          router.replace(getLoginRoute(pathname, searchSuffix))
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
