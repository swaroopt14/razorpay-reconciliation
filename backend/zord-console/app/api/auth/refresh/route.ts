import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  BackendAuthEnvelope,
  BackendErrorEnvelope,
  REFRESH_COOKIE_NAME,
  applyAuthCookies,
  buildForwardHeaders,
  clearAuthCookies,
  edgeAuthUrl,
  parseJSONSafe,
  sanitizeAuthEnvelope,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = (await parseJSONSafe<{ refresh_token?: string }>(request)) ?? {}
  const refreshToken = body.refresh_token || request.cookies.get(REFRESH_COOKIE_NAME)?.value

  if (!refreshToken) {
    const response = NextResponse.json({ code: 'INVALID_SESSION', message: 'Session expired' }, { status: 401 })
    clearAuthCookies(response)
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
    const response = NextResponse.json(
      { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service is unavailable right now.' },
      { status: 503 },
    )
    clearAuthCookies(response)
    return response
  }

  if (!edgeResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(edgeResponse)
    const response = NextResponse.json(
      {
        code: errorBody?.code ?? 'INVALID_SESSION',
        message: errorBody?.message ?? 'Session expired',
      },
      { status: edgeResponse.status },
    )
    clearAuthCookies(response)
    return response
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(edgeResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    const response = NextResponse.json(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Refresh response was incomplete.' },
      { status: 502 },
    )
    clearAuthCookies(response)
    return response
  }

  const response = NextResponse.json(sanitizeAuthEnvelope(payload))
  applyAuthCookies(response, payload)
  return response
}
