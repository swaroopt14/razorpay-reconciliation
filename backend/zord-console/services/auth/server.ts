import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'

export const ACCESS_COOKIE_NAME = 'zord_access_token'
export const REFRESH_COOKIE_NAME = 'zord_refresh_token'
export const SESSION_HINT_COOKIE_NAME = 'zord_session_present'
export const ROLE_COOKIE_NAME = 'zord_role'

const DEFAULT_REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function resolveCookieSecure() {
  const explicitValue = process.env.AUTH_COOKIE_SECURE
  if (typeof explicitValue === 'string' && explicitValue.trim() !== '') {
    return explicitValue === 'true'
  }
  return process.env.NODE_ENV === 'production'
}

export interface BackendAuthUser {
  id: string
  email: string
  role: string
  name: string
  tenant_id: string
  tenant_name: string
  workspace_code: string
  status: string
  mfa_enabled: boolean
  last_login_at?: string
}

export interface BackendAuthSession {
  session_id: string
  tenant_id: string
  workspace_code: string
  role: string
  access_expires_at: string
  idle_expires_at: string
  absolute_expires_at: string
}

export interface BackendAuthEnvelope {
  user: BackendAuthUser
  session: BackendAuthSession
  requires_mfa: boolean
  access_token?: string
  refresh_token?: string
  access_expires_at: string
  idle_expires_at?: string
  absolute_expires_at?: string
  /** Present only on signup — full tenant API key (`prefix.secret`). The
   * backend stores only the hash, so this is the one chance to capture it. */
  api_key?: string
}

export interface BackendErrorEnvelope {
  code?: string
  message?: string
}

interface AuthorizedEdgeFetchResult {
  edgeResponse?: Response
  refreshedPayload?: BackendAuthEnvelope
  errorResponse?: NextResponse
}

function cookieBaseOptions() {
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined

  return {
    sameSite: 'lax' as const,
    secure: resolveCookieSecure(),
    path: '/',
    ...(domain ? { domain } : {}),
  }
}

export function applyAuthCookies(response: NextResponse, payload: BackendAuthEnvelope) {
  // Access/refresh tokens stay HttpOnly so browser JavaScript never sees them.
  // We keep a separate non-sensitive hint cookie for route guards and fast client checks.
  const baseOptions = cookieBaseOptions()
  const accessExpiresAt = new Date(payload.access_expires_at)

  if (payload.access_token) {
    response.cookies.set({
      name: ACCESS_COOKIE_NAME,
      value: payload.access_token,
      httpOnly: true,
      expires: accessExpiresAt,
      ...baseOptions,
    })
  }

  if (payload.refresh_token) {
    response.cookies.set({
      name: REFRESH_COOKIE_NAME,
      value: payload.refresh_token,
      httpOnly: true,
      maxAge: DEFAULT_REFRESH_COOKIE_MAX_AGE_SECONDS,
      ...baseOptions,
    })
  }

  applySessionMarkerCookies(response, payload.user.role)
}

export function applySessionMarkerCookies(response: NextResponse, role: string) {
  const baseOptions = cookieBaseOptions()

  response.cookies.set({
    name: SESSION_HINT_COOKIE_NAME,
    value: '1',
    httpOnly: false,
    maxAge: DEFAULT_REFRESH_COOKIE_MAX_AGE_SECONDS,
    ...baseOptions,
  })

  response.cookies.set({
    name: ROLE_COOKIE_NAME,
    value: role,
    httpOnly: true,
    maxAge: DEFAULT_REFRESH_COOKIE_MAX_AGE_SECONDS,
    ...baseOptions,
  })
}

export function clearAuthCookies(response: NextResponse) {
  const baseOptions = cookieBaseOptions()

  for (const cookieName of [ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, SESSION_HINT_COOKIE_NAME, ROLE_COOKIE_NAME]) {
    response.cookies.set({
      name: cookieName,
      value: '',
      httpOnly:
        cookieName === ACCESS_COOKIE_NAME ||
        cookieName === REFRESH_COOKIE_NAME ||
        cookieName === ROLE_COOKIE_NAME,
      maxAge: 0,
      ...baseOptions,
    })
  }
}

export function sanitizeAuthEnvelope(payload: BackendAuthEnvelope) {
  return {
    user: payload.user,
    session: payload.session,
    requires_mfa: payload.requires_mfa,
    // api_key is passed through on signup (one-time disclosure). Tokens stay
    // server-side in HttpOnly cookies; this is metadata the UI can render.
    ...(payload.api_key ? { api_key: payload.api_key } : {}),
  }
}

export async function parseJSONSafe<T>(target: { json(): Promise<unknown> }): Promise<T | null> {
  try {
    return (await target.json()) as T
  } catch {
    return null
  }
}

/**
 * CON-P1-04 — validate a single IP literal for audit forwarding.
 * Rejects empty values, spaces/commas (multi-hop injection), and obvious garbage.
 */
export function sanitizeSingleIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value || value.includes(',') || /\s/.test(value)) return null
  // Basic IPv4 / IPv6 (incl. compressed) guard — not a full parser.
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[0-9a-fA-F:]+$/
  if (ipv4.test(value)) {
    const parts = value.split('.').map((p) => Number(p))
    if (parts.every((n) => n >= 0 && n <= 255)) return value
    return null
  }
  if (ipv6.test(value) && value.includes(':')) return value
  return null
}

function trustProxyHeadersEnabled(): boolean {
  const explicit = process.env.TRUST_PROXY_HEADERS?.trim().toLowerCase()
  if (explicit === 'true' || explicit === '1') return true
  if (explicit === 'false' || explicit === '0') return false
  // Production console sits behind Kong/ALB which append the real client hop.
  return process.env.NODE_ENV === 'production'
}

/**
 * CON-P1-04 — resolve the client IP that Edge may record for audit.
 *
 * Never forwards the browser's raw X-Forwarded-For chain (spoofable).
 * Order:
 * 1) Ingress-controlled single-IP headers (x-real-ip / true-client-ip / cf-connecting-ip)
 * 2) When TRUST_PROXY_HEADERS / production: rightmost XFF hop only (proxy-appended)
 * 3) Otherwise omit (Edge falls back to TCP peer = console→edge, not attacker-chosen)
 */
export function resolveTrustedClientIp(request: NextRequest): string | null {
  for (const headerName of ['x-real-ip', 'true-client-ip', 'cf-connecting-ip'] as const) {
    const trusted = sanitizeSingleIp(request.headers.get(headerName))
    if (trusted) return trusted
  }

  if (!trustProxyHeadersEnabled()) {
    return null
  }

  const xff = request.headers.get('x-forwarded-for')
  if (!xff) return null
  const hops = xff
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (hops.length === 0) return null
  // Rightmost hop is appended by the nearest reverse proxy; leftmost is client-controlled.
  return sanitizeSingleIp(hops[hops.length - 1])
}

export function buildForwardHeaders(request: NextRequest, accessToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const userAgent = request.headers.get('user-agent')
  if (userAgent) {
    headers['User-Agent'] = userAgent
  }

  // CON-P1-04: never copy arbitrary browser X-Forwarded-For into Edge calls.
  const clientIp = resolveTrustedClientIp(request)
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp
    headers['X-Real-IP'] = clientIp
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  return headers
}

export function edgeAuthUrl(path: string) {
  return `${BACKEND_SERVICES.EDGE.BASE_URL}${path}`
}

async function refreshFromCookie(request: NextRequest): Promise<{ payload?: BackendAuthEnvelope; errorResponse?: NextResponse }> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value
  if (!refreshToken) {
    const response = NextResponse.json({ code: 'INVALID_SESSION', message: 'Session expired' }, { status: 401 })
    clearAuthCookies(response)
    return { errorResponse: response }
  }

  let refreshResponse: Response
  try {
    refreshResponse = await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_REFRESH), {
      method: 'POST',
      headers: buildForwardHeaders(request),
      cache: 'no-store',
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    const response = NextResponse.json(
      { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service is unavailable right now.' },
      { status: 503 },
    )
    clearAuthCookies(response)
    return { errorResponse: response }
  }

  if (!refreshResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(refreshResponse)
    const response = NextResponse.json(
      {
        code: errorBody?.code ?? 'INVALID_SESSION',
        message: errorBody?.message ?? 'Session expired',
      },
      { status: refreshResponse.status },
    )
    clearAuthCookies(response)
    return { errorResponse: response }
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(refreshResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    const response = NextResponse.json(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Refresh response was incomplete.' },
      { status: 502 },
    )
    clearAuthCookies(response)
    return { errorResponse: response }
  }

  return { payload }
}

// This helper centralizes "call zord-edge with the logged-in user's session".
// It tries the access token first, then refreshes once if needed, so admin pages
// do not break as soon as a short-lived access token expires.
export async function authorizedEdgeFetch(
  request: NextRequest,
  path: string,
  init: {
    method?: string
    body?: string
  } = {},
): Promise<AuthorizedEdgeFetchResult> {
  const method = init.method ?? 'GET'

  const callEdge = async (accessToken?: string) =>
    fetch(edgeAuthUrl(path), {
      method,
      headers: buildForwardHeaders(request, accessToken),
      cache: 'no-store',
      body: init.body,
    })

  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value
  if (accessToken) {
    try {
      const edgeResponse = await callEdge(accessToken)
      if (edgeResponse.status !== 401) {
        return { edgeResponse }
      }
    } catch {
      // Fall through and try a refresh token if one exists.
    }
  }

  const refreshResult = await refreshFromCookie(request)
  if (refreshResult.errorResponse || !refreshResult.payload?.access_token) {
    return { errorResponse: refreshResult.errorResponse }
  }

  let edgeResponse: Response
  try {
    edgeResponse = await callEdge(refreshResult.payload.access_token)
  } catch {
    return {
      errorResponse: NextResponse.json(
        { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service is unavailable right now.' },
        { status: 503 },
      ),
    }
  }

  return {
    edgeResponse,
    refreshedPayload: refreshResult.payload,
  }
}
