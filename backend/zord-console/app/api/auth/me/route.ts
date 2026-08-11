import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  ACCESS_COOKIE_NAME,
  BackendAuthEnvelope,
  BackendAuthUser,
  BackendErrorEnvelope,
  REFRESH_COOKIE_NAME,
  applyAuthCookies,
  applyCsrfCookie,
  applySessionMarkerCookies,
  authServiceUnavailableResponse,
  buildForwardHeaders,
  clearAuthCookies,
  edgeAuthUrl,
  parseJSONSafe,
  refreshFailureResponse,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

/** Never cache session identity; shared caches must not reuse responses across users. */
function jsonNoStore<T>(body: T, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init)
  res.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
  res.headers.set('Vary', 'Cookie')
  return res
}

interface BackendMeEnvelope {
  user: BackendAuthUser
  session: {
    session_id: string
    tenant_id: string
    workspace_code: string
    role: string
    access_expires_at: string
  }
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value

  if (!accessToken && !refreshToken) {
    const response = jsonNoStore({ code: 'INVALID_SESSION', message: 'Session expired' }, { status: 401 })
    clearAuthCookies(response)
    return response
  }

  if (accessToken) {
    let meResponse: Response
    try {
      meResponse = await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_ME), {
        method: 'GET',
        headers: buildForwardHeaders(request, accessToken),
        cache: 'no-store',
      })
    } catch {
      // CON-P1-03: Edge unreachable — keep cookies.
      return authServiceUnavailableResponse()
    }

    if (meResponse.ok) {
      const payload = await parseJSONSafe<BackendMeEnvelope>(meResponse)
      if (payload) {
        const response = jsonNoStore(payload)
        applySessionMarkerCookies(response, payload.user.role)
        // CON-P1-01: ensure CSRF cookie exists for cookie-authenticated mutations.
        applyCsrfCookie(response, accessToken)
        return response
      }
    }

    // 401/403 → try refresh. Other /me failures without a refresh cookie → keep cookies, 503.
    if (meResponse.status !== 401 && meResponse.status !== 403 && !refreshToken) {
      return authServiceUnavailableResponse()
    }
  }

  if (!refreshToken) {
    const response = jsonNoStore({ code: 'INVALID_SESSION', message: 'Session expired' }, { status: 401 })
    clearAuthCookies(response)
    return response
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
    return authServiceUnavailableResponse()
  }

  if (!refreshResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(refreshResponse)
    return refreshFailureResponse(refreshResponse.status, errorBody)
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(refreshResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    return jsonNoStore(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Refresh response was incomplete. Retry shortly.' },
      { status: 502 },
    )
  }

  const response = jsonNoStore({
    user: payload.user,
    session: payload.session,
  })
  applyAuthCookies(response, payload)
  return response
}
