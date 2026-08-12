import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { assertCookieMutationProtection } from '@/services/auth/assertSameOrigin.server'
import {
  applyAuthCookies,
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
  BackendAuthEnvelope,
  BackendErrorEnvelope,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const csrf = assertCookieMutationProtection(request)
  if (!csrf.ok) return csrf.response

  const refreshToken = getRefreshTokenFromRequest(request)
  if (!refreshToken) {
    const response = NextResponse.json({ code: 'INVALID_SESSION', message: 'Session expired' }, { status: 401 })
    clearAuthCookies(response, {
      tenantId: resolveRequestedSessionTenantId(request),
      registry: readSessionTenantRegistry(request),
    })
    return response
  }

  // The backend /v1/session/refresh endpoint is JWT-protected. We must include
  // the current access token in the Authorization header so JWTAuthenticate passes.
  const accessToken = getAccessTokenFromRequest(request)

  let refreshResponse: Response
  try {
    refreshResponse = await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.SESSION_REFRESH), {
      method: 'POST',
      headers: buildForwardHeaders(request, accessToken),
      cache: 'no-store',
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    // CON-P1-03: outage ≠ logout.
    return authServiceUnavailableResponse()
  }

  if (!refreshResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(refreshResponse)
    return refreshFailureResponse(refreshResponse.status, errorBody)
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(refreshResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    return NextResponse.json(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Refresh response was incomplete. Retry shortly.' },
      { status: 502 },
    )
  }

  const response = NextResponse.json({
    user: payload.user,
    session: payload.session,
  })
  applyAuthCookies(response, payload, request)
  return response
}
