import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  applyAuthCookies,
  buildForwardHeaders,
  clearAuthCookies,
  edgeAuthUrl,
  parseJSONSafe,
  BackendAuthEnvelope,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value
  if (!refreshToken) {
    const response = NextResponse.json({ code: 'INVALID_SESSION', message: 'Session expired' }, { status: 401 })
    clearAuthCookies(response)
    return response
  }

  // The backend /v1/session/refresh endpoint is JWT-protected. We must include
  // the current access token in the Authorization header so JWTAuthenticate passes.
  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value

  let refreshResponse: Response
  try {
    refreshResponse = await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.SESSION_REFRESH), {
      method: 'POST',
      headers: buildForwardHeaders(request, accessToken),
      cache: 'no-store',
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    return NextResponse.json(
      { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service is unavailable right now.' },
      { status: 503 }
    )
  }

  if (!refreshResponse.ok) {
    const response = NextResponse.json(
      { code: 'INVALID_SESSION', message: 'Session expired' },
      { status: 401 }
    )
    clearAuthCookies(response)
    return response
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(refreshResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    const response = NextResponse.json(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Refresh response was incomplete.' },
      { status: 502 }
    )
    clearAuthCookies(response)
    return response
  }

  const response = NextResponse.json({
    user: payload.user,
    session: payload.session,
  })
  applyAuthCookies(response, payload)
  return response
}
