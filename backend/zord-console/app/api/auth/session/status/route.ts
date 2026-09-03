import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { authorizedEdgeFetch, parseJSONSafe, applyAuthCookies } from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const result = await authorizedEdgeFetch(request, BACKEND_SERVICES.EDGE.ENDPOINTS.SESSION_STATUS)
  
  if (result.errorResponse) {
    return result.errorResponse
  }

  if (!result.edgeResponse || !result.edgeResponse.ok) {
    return NextResponse.json(
      { code: 'SESSION_EXPIRED', message: 'Session is expired or invalid' },
      { status: 401 }
    )
  }

  const payload = await parseJSONSafe(result.edgeResponse)
  const response = NextResponse.json(payload)

  // If the token was silently refreshed during this poll, forward the new cookies
  // to the browser so it doesn't send a revoked refresh token on the next request.
  if (result.refreshedPayload) {
    applyAuthCookies(response, result.refreshedPayload)
  }

  return response
}
