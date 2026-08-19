import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  BackendAuthEnvelope,
  BackendErrorEnvelope,
  applyAuthCookies,
  authServiceUnavailableResponse,
  buildForwardHeaders,
  clearAuthCookies,
  edgeAuthUrl,
  getRefreshTokenFromRequest,
  parseJSONSafe,
  readSessionTenantRegistry,
  refreshFailureResponse,
  resolveRequestedSessionTenantId,
  sanitizeAuthEnvelope,
} from '@/services/auth/server'
import { consumeBffRateLimit, rateLimitKeyForIp } from '@/services/bff/rateLimit.server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const rate = consumeBffRateLimit({
    bucket: 'auth',
    key: rateLimitKeyForIp(request),
    message: 'Too many refresh attempts. Try again shortly.',
  })
  if (!rate.ok) return rate.response

  const body = (await parseJSONSafe<{ refresh_token?: string }>(request)) ?? {}
  const refreshToken = body.refresh_token || getRefreshTokenFromRequest(request)

  if (!refreshToken) {
    const response = NextResponse.json({ code: 'INVALID_SESSION', message: 'Session expired' }, { status: 401 })
    clearAuthCookies(response, {
      tenantId: resolveRequestedSessionTenantId(request),
      registry: readSessionTenantRegistry(request),
    })
    return response
  }

  let edgeResponse: Response
  try {
    edgeResponse = await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_REFRESH), {
      method: 'POST',
      headers: buildForwardHeaders(request),
      cache: 'no-store',
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    // CON-P1-03: do not clear cookies on Edge transport failure.
    return authServiceUnavailableResponse()
  }

  if (!edgeResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(edgeResponse)
    return refreshFailureResponse(edgeResponse.status, errorBody)
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(edgeResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    return NextResponse.json(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Refresh response was incomplete. Retry shortly.' },
      { status: 502 },
    )
  }

  const response = NextResponse.json(sanitizeAuthEnvelope(payload))
  applyAuthCookies(response, payload, request)
  return response
}
