'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  clearAuth,
  getCurrentUser,
  hasSessionHint,
  hydrateSession,
  readTabSessionTenantId,
  withSessionTenantQuery,
  writeTabSessionTenantId,
} from '@/services/auth'
import { installSessionTenantFetchPatch } from '@/services/auth/tenantSessionBrowser'
import { SESSION_TENANT_QUERY } from '@/services/auth/tenantSessionConstants'
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
  const searchParams = useSearchParams()

  useEffect(() => {
    installSessionTenantFetchPatch()

    // Bind this tab to ?tenant= before hydrate so /api/auth/me uses the right cookies.
    const fromUrl = searchParams?.get(SESSION_TENANT_QUERY)?.trim() || ''
    if (fromUrl) {
      writeTabSessionTenantId(fromUrl)
    }

    if (!pathname || isLoginPath(pathname) || !isProtectedPath(pathname)) {
      return
    }

    let cancelled = false

    void hydrateSession()
      .then((user) => {
        if (cancelled) return

        if (!user) {
          if (!hasSessionHint() && !getCurrentUser()) {
            router.replace(getLoginRoute(pathname))
          }
          return
        }

        if (!roleMatchesPath(pathname, user.role)) {
          clearAuth()
          router.replace(getLoginRoute(pathname))
          return
        }

        const tenantId = user.tenantId || user.tenant || ''
        writeTabSessionTenantId(tenantId)
        // Keep tenant in the URL so reload always restores this tab's workspace.
        const urlTenant = searchParams?.get(SESSION_TENANT_QUERY)?.trim() || ''
        if (tenantId && urlTenant !== tenantId && pathname) {
          const qs = searchParams?.toString() || ''
          const next = withSessionTenantQuery(
            qs ? `${pathname}?${qs}` : pathname,
            tenantId,
          )
          router.replace(next)
        }
      })
      .catch(() => {
        /* hydrateSession is defensive; swallow stray rejections */
      })

    return () => {
      cancelled = true
    }
  }, [pathname, router, searchParams])

  // Keep tab binding if URL changes without remount.
  useEffect(() => {
    const fromUrl = searchParams?.get(SESSION_TENANT_QUERY)?.trim() || ''
    if (fromUrl && fromUrl !== readTabSessionTenantId()) {
      writeTabSessionTenantId(fromUrl)
    }
  }, [searchParams])

  return null
}
