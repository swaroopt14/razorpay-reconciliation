import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import { fetchSmokeLoginAudit } from '@/services/internal/signInLogGate.server'

export const dynamic = 'force-dynamic'

/** Live sign-in log from smoke GET /v1/smoke/login-audit. No demo fixture. */
export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  try {
    const payload = await fetchSmokeLoginAudit(request.nextUrl.searchParams.get('limit') || '100')
    const res = NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        ok: false,
        live: false,
        error: 'smoke_unreachable',
        message: error instanceof Error ? error.message : 'Could not reach smoke login-audit.',
        items: [],
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
