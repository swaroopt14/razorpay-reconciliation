import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { authorizedEdgeFetch, clearAuthCookies } from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const result = await authorizedEdgeFetch(request, BACKEND_SERVICES.EDGE.ENDPOINTS.SESSION_LOGOUT_ALL, {
    method: 'POST',
    body: JSON.stringify({}),
  })

  const response = NextResponse.json({ success: true })
  clearAuthCookies(response)

  if (result.errorResponse) {
    return result.errorResponse
  }

  return response
}
