import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { assertCookieMutationProtection } from '@/services/auth/assertSameOrigin.server'
import { authorizedEdgeFetch, clearAuthCookies } from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const csrf = assertCookieMutationProtection(request)
  if (!csrf.ok) return csrf.response

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
