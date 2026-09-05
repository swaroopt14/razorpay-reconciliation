import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  REFRESH_COOKIE_NAME,
  buildForwardHeaders,
  clearAuthCookies,
  edgeAuthUrl,
  parseJSONSafe,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = (await parseJSONSafe<{ refresh_token?: string }>(request)) ?? {}
  const refreshToken = body.refresh_token || request.cookies.get(REFRESH_COOKIE_NAME)?.value

  if (refreshToken) {
    await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_LOGOUT), {
      method: 'POST',
      headers: buildForwardHeaders(request),
      cache: 'no-store',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => undefined)
  }

  const response = NextResponse.json({ success: true })
  clearAuthCookies(response)
  return response
}
