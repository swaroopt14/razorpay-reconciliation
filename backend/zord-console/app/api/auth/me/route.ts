import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  BackendAuthEnvelope,
  BackendAuthUser,
  BackendErrorEnvelope,
  applyAuthCookies,
  applyCsrfCookie,
  applySessionMarkerCookies,
  authServiceUnavailableResponse,
  buildForwardHeaders,
  clearAuthCookies,
  edgeAuthUrl,
  getAccessTokenFromRequest,
  getRefreshTokenFromRequest,
  parseJSONSafe,
  readSessionTenantRegistry,
  refreshFailureResponse,
  resolveRequestedSessionTenantId,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

/** Never cache session identity; shared caches must not reuse responses across users. */
function jsonNoStore<T>(body: T, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init)
  res.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
  res.headers.set('Vary', 'Cookie, X-Zord-Session-Tenant')
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
  const accessToken = getAccessTokenFromRequest(request)
  const refreshToken = getRefreshTokenFromRequest(request)
  const sessionTenant = resolveRequestedSessionTenantId(request)

  if (!accessToken && !refreshToken) {
    const response = jsonNoStore({ code: 'INVALID_SESSION', message: 'Session expired' }, { status: 401 })
    clearAuthCookies(response, {
      tenantId: sessionTenant,
      registry: readSessionTenantRegistry(request),
    })
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
    clearAuthCookies(response, {
      tenantId: sessionTenant,
      registry: readSessionTenantRegistry(request),
    })
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
  applyAuthCookies(response, payload, request)
  return response
}
