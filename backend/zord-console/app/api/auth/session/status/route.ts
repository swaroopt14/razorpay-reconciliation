import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyAuthCookies,
  authServiceUnavailableResponse,
  authorizedEdgeFetch,
  clearAuthCookies,
  parseJSONSafe,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const result = await authorizedEdgeFetch(request, BACKEND_SERVICES.EDGE.ENDPOINTS.SESSION_STATUS)

  if (result.errorResponse) {
    return result.errorResponse
  }

  if (!result.edgeResponse) {
    return authServiceUnavailableResponse()
  }

  if (!result.edgeResponse.ok) {
    // CON-P1-03: do not treat Edge 5xx as session expiry.
    if (result.edgeResponse.status === 401 || result.edgeResponse.status === 403) {
      const response = NextResponse.json(
        { code: 'SESSION_EXPIRED', message: 'Session is expired or invalid' },
        { status: result.edgeResponse.status },
      )
      clearAuthCookies(response)
      return response
    }
    return authServiceUnavailableResponse()
  }

  const payload = await parseJSONSafe(result.edgeResponse)
  const response = NextResponse.json(payload)

  // If the token was silently refreshed during this poll, forward the new cookies
  // to the browser so it doesn't send a revoked refresh token on the next request.
  if (result.refreshedPayload) {
    applyAuthCookies(response, result.refreshedPayload, request)
  }

  return response
}
