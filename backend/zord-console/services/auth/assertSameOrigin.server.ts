import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/services/auth/csrfConstants'

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME }

/** Keep in sync with `ACCESS_COOKIE_NAME` in server.ts (avoid circular import). */
const ACCESS_COOKIE_NAME = 'zord_access_token'

const JSON_NO_STORE = { 'cache-control': 'no-store' } as const

export type SameOriginGate =
  | { ok: true }
  | { ok: false; response: NextResponse }

function forbidden(code: string, message: string): SameOriginGate {
  return {
    ok: false,
    response: NextResponse.json({ code, message }, { status: 403, headers: JSON_NO_STORE }),
  }
}

function requestHost(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = (forwarded || request.headers.get('host')?.trim() || '').toLowerCase()
  return host
}

function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return null
  }
}

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function hasExplicitApiAuthorization(request: NextRequest): boolean {
  const auth = request.headers.get('authorization')?.trim() || ''
  return auth.length > 0
}

/**
 * CON-P1-01 — Origin/Host must match for browser mutations.
 * Rejects cross-site POSTs even when HttpOnly session cookies would otherwise be sent (SameSite=Lax gaps).
 */
export function assertSameOrigin(request: NextRequest): SameOriginGate {
  const host = requestHost(request)
  if (!host) {
    return forbidden('ORIGIN_REQUIRED', 'Host header is required for mutation requests.')
  }

  const secFetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase()
  if (secFetchSite === 'cross-site') {
    return forbidden('CROSS_SITE_FORBIDDEN', 'Cross-site mutation requests are not allowed.')
  }

  const origin = request.headers.get('origin')?.trim()
  if (origin) {
    const originHost = hostFromUrl(origin)
    if (!originHost || originHost !== host) {
      return forbidden('ORIGIN_MISMATCH', 'Request Origin does not match this host.')
    }
    return { ok: true }
  }

  const referer = request.headers.get('referer')?.trim()
  if (referer) {
    const refererHost = hostFromUrl(referer)
    if (!refererHost || refererHost !== host) {
      return forbidden('ORIGIN_MISMATCH', 'Request Referer does not match this host.')
    }
    return { ok: true }
  }

  return forbidden(
    'ORIGIN_REQUIRED',
    'Browser mutations require a same-origin Origin or Referer header.',
  )
}

function assertCsrfDoubleSubmit(request: NextRequest): SameOriginGate {
  const access = request.cookies.get(ACCESS_COOKIE_NAME)?.value
  if (!access) {
    // No session cookie — route auth will 401; skip CSRF.
    return { ok: true }
  }

  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value?.trim() || ''
  const headerToken = request.headers.get(CSRF_HEADER_NAME)?.trim() || ''

  if (!cookieToken || !headerToken) {
    return forbidden(
      'CSRF_REQUIRED',
      'Missing CSRF token. Reload the console so a session CSRF cookie is issued, then retry.',
    )
  }

  if (!safeEqualString(cookieToken, headerToken)) {
    return forbidden('CSRF_MISMATCH', 'CSRF token mismatch.')
  }

  return { ok: true }
}

export type CookieMutationProtectionOptions = {
  /**
   * When true, requests with an explicit `Authorization` header skip cookie CSRF/same-origin
   * (external API-key clients). Cookie-only browser calls still require protection.
   */
  allowBearerBypass?: boolean
}

/**
 * Shared gate for cookie-authenticated POST/PATCH/DELETE browser mutations.
 * External API-key callers remain separate via `allowBearerBypass`.
 */
export function assertCookieMutationProtection(
  request: NextRequest,
  options?: CookieMutationProtectionOptions,
): SameOriginGate {
  if (options?.allowBearerBypass && hasExplicitApiAuthorization(request)) {
    return { ok: true }
  }

  const originGate = assertSameOrigin(request)
  if (!originGate.ok) return originGate

  return assertCsrfDoubleSubmit(request)
}

export function newCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

/** Stable token derived from access token so /api/auth/me can re-issue without rotating mid-session. */
export function csrfTokenForAccessToken(accessToken: string): string {
  return createHash('sha256').update(`zord-csrf:${accessToken}`).digest('hex')
}
