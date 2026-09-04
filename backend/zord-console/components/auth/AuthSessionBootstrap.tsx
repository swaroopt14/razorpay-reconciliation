'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { clearAuth, getCurrentUser, hasSessionHint, hydrateSession } from '@/services/auth'
import { UserRole } from '@/types/auth'

/** Spec 7.18: exact `/admin` is workspace Team & Access (customer session). */
function isWorkspaceAdminPath(pathname: string) {
  return pathname === '/admin' || pathname === '/admin/'
}

/** Platform tenant console: `/admin/tenants`, `/admin/login`, etc. */
function isPlatformAdminPath(pathname: string) {
  return pathname.startsWith('/admin/') && !isWorkspaceAdminPath(pathname)
}

function getLoginRoute(pathname: string, _searchSuffix: string) {
  if (pathname.startsWith('/payout-command-view')) {
    return '/signin'
  }
  if (pathname.startsWith('/sandbox')) {
    return '/signin'
  }
  // Workspace Team & Access uses the same customer sign-in as Overview / Developer.
  if (isWorkspaceAdminPath(pathname)) return '/signin'
  if (isPlatformAdminPath(pathname)) return '/admin/login'
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
  // Only platform admin routes need ADMIN credentials.
  if (isPlatformAdminPath(pathname)) return role === 'ADMIN'
  if (pathname.startsWith('/ops')) return role === 'OPS'
  if (
    pathname.startsWith('/customer') ||
    pathname.startsWith('/console') ||
    pathname.startsWith('/app-final') ||
    pathname.startsWith('/payout-command-view') ||
    pathname.startsWith('/sandbox') ||
    isWorkspaceAdminPath(pathname)
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
    // Always revalidate through /api/auth/me - do not redirect based on hint/localStorage
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
