import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  ACCESS_COOKIE_NAME,
  BackendAuthEnvelope,
  BackendAuthUser,
  BackendErrorEnvelope,
  REFRESH_COOKIE_NAME,
  applyAuthCookies,
  applySessionMarkerCookies,
  buildForwardHeaders,
  clearAuthCookies,
  edgeAuthUrl,
  parseJSONSafe,
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
      return jsonNoStore(
        { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service is unavailable right now.' },
        { status: 503 },
      )
    }

    if (meResponse.ok) {
      const payload = await parseJSONSafe<BackendMeEnvelope>(meResponse)
      if (payload) {
        const response = jsonNoStore(payload)
        applySessionMarkerCookies(response, payload.user.role)
        return response
      }
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
    return jsonNoStore(
      { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service is unavailable right now.' },
      { status: 503 },
    )
  }

  if (!refreshResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(refreshResponse)
    const response = jsonNoStore(
      {
        code: errorBody?.code ?? 'INVALID_SESSION',
        message: errorBody?.message ?? 'Session expired',
      },
      { status: refreshResponse.status },
    )
    clearAuthCookies(response)
    return response
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(refreshResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    const response = jsonNoStore(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Refresh response was incomplete.' },
      { status: 502 },
    )
    clearAuthCookies(response)
    return response
  }

  const response = jsonNoStore({
    user: payload.user,
    session: payload.session,
  })
  applyAuthCookies(response, payload)
  return response
}
