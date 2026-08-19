import { NextRequest, NextResponse } from 'next/server'

function getLoginPath(pathname: string) {
  if (pathname.startsWith('/payout-command-view')) return '/signin'
  if (pathname.startsWith('/sandbox')) return '/signin'
  return '/signin'
}

function loginRedirectUrl(request: NextRequest, pathname: string) {
  return new URL(getLoginPath(pathname), request.url)
}

function roleMatchesPath(pathname: string, role: string) {
  if (
    pathname.startsWith('/payout-command-view') ||
    pathname.startsWith('/sandbox')
  ) {
    return role === 'CUSTOMER_USER' || role === 'CUSTOMER_ADMIN'
  }
  return true
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Legacy URLs → canonical /signin (no ?next=).
  if (pathname === '/signin/tenant' || (pathname === '/signin' && request.nextUrl.search)) {
    return NextResponse.redirect(new URL('/signin', request.url))
  }

  if (pathname === '/signin' || pathname === '/signup' || pathname === '/register') {
    return NextResponse.next()
  }

  // Allow any global or tenant-scoped session cookie (multi-tab Tenant A + B).
  const hasGlobalSession =
    Boolean(request.cookies.get('zord_access_token')?.value) ||
    Boolean(request.cookies.get('zord_refresh_token')?.value)
  const registry = (request.cookies.get('zord_session_tenants')?.value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const hasScopedSession = registry.some(
    (tid) =>
      Boolean(request.cookies.get(`zord_access_token__${tid}`)?.value) ||
      Boolean(request.cookies.get(`zord_refresh_token__${tid}`)?.value),
  )
  if (!hasGlobalSession && !hasScopedSession) {
    return NextResponse.redirect(loginRedirectUrl(request, pathname))
  }

  const role = request.cookies.get('zord_role')?.value
  if (role && !roleMatchesPath(pathname, role)) {
    return NextResponse.redirect(loginRedirectUrl(request, pathname))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/signin',
    '/signin/tenant',
    '/payout-command-view',
    '/payout-command-view/:path*',
    '/sandbox',
    '/sandbox/:path*',
  ],
}
