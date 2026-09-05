import { NextRequest, NextResponse } from 'next/server'
import { fetchDLQTerminalCount } from '@/services/backend/dlq'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

/** Proxy: GET /api/prod/dlq/terminal/count → intent-engine terminal DLQ count. */
export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  try {
    const count = await fetchDLQTerminalCount({ tenant_id: tenantId })
    const res = NextResponse.json({ count: count ?? 0 })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        count: 0,
        error: error instanceof Error ? error.message : 'Failed to fetch DLQ terminal count',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
