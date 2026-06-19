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

export function buildForwardHeaders(request: NextRequest, accessToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const userAgent = request.headers.get('user-agent')
  if (userAgent) {
    headers['User-Agent'] = userAgent
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    headers['X-Forwarded-For'] = forwardedFor
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
