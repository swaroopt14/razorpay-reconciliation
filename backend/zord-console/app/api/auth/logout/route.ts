import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { assertCookieMutationProtection } from '@/services/auth/assertSameOrigin.server'
import {
  buildForwardHeaders,
  clearAuthCookies,
  edgeAuthUrl,
  getRefreshTokenFromRequest,
  parseJSONSafe,
  readSessionTenantRegistry,
  resolveRequestedSessionTenantId,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const csrf = assertCookieMutationProtection(request)
  if (!csrf.ok) return csrf.response

  const body = (await parseJSONSafe<{ refresh_token?: string }>(request)) ?? {}
  const refreshToken = body.refresh_token || getRefreshTokenFromRequest(request)
  const tenantId = resolveRequestedSessionTenantId(request)

  if (refreshToken) {
    await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_LOGOUT), {
      method: 'POST',
      headers: buildForwardHeaders(request),
      cache: 'no-store',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => undefined)
  }

  const response = NextResponse.json({ success: true })
  // Only clear this tab's tenant session — keep other tenants alive in other tabs.
  clearAuthCookies(response, {
    tenantId,
    registry: readSessionTenantRegistry(request),
  })
  return response
}
