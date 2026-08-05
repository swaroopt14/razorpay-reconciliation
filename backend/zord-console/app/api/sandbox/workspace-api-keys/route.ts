import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { authorizedEdgeFetch, parseJSONSafe } from '@/services/auth/server'
import { applyRefreshedSessionCookies } from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

type EdgeMePayload = {
  user?: { tenant_id?: string; tenant_name?: string; workspace_code?: string }
  session?: { tenant_id?: string; workspace_code?: string }
}

/**
 * Sandbox workspace credentials for the signed-in user (zord-edge `/v1/auth/me`).
 * No fabricated keys — full API secret is only available client-side if saved at signup.
 */
export async function GET(request: NextRequest) {
  const { edgeResponse, errorResponse, refreshedPayload } = await authorizedEdgeFetch(
    request,
    BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_ME,
  )

  if (errorResponse) return errorResponse

  if (!edgeResponse?.ok) {
    const res = NextResponse.json(
      {
        message:
          edgeResponse?.status === 401
            ? 'Sign in to load workspace credentials.'
            : `Could not reach auth service (${edgeResponse?.status ?? 'unknown'}).`,
      },
      { status: edgeResponse?.status === 401 ? 401 : 502, headers: { 'cache-control': 'no-store' } },
    )
    applyRefreshedSessionCookies(res, refreshedPayload)
    return res
  }

  const payload = await parseJSONSafe<EdgeMePayload>(edgeResponse)
  const tenant_id =
    payload?.session?.tenant_id?.trim() || payload?.user?.tenant_id?.trim() || ''

  if (!tenant_id) {
    const res = NextResponse.json(
      { message: 'Session payload missing tenant_id.' },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    )
    applyRefreshedSessionCookies(res, refreshedPayload)
    return res
  }

  const workspace_code =
    payload?.session?.workspace_code?.trim() || payload?.user?.workspace_code?.trim() || null
  const tenant_name = payload?.user?.tenant_name?.trim() ?? null
  const publishable_key = workspace_code

  const res = NextResponse.json(
    {
      tenant_id,
      tenant_name,
      workspace_code,
      publishable_key,
      secret_key_prefix: null,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
  applyRefreshedSessionCookies(res, refreshedPayload)
  return res
}
