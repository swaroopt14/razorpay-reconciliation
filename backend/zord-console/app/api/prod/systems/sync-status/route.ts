import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

const UPSTREAM_PATH = '/v1/connectors/sync-status'

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const base = process.env.ZORD_CONNECTORS_URL || process.env.ZORD_EDGE_URL || 'http://localhost:8080'
  const url = `${base}${UPSTREAM_PATH}?tenant_id=${encodeURIComponent(tenantId)}`

  try {
    const upstream = await fetch(url, {
      headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId },
      cache: 'no-store',
    })
    const text = await upstream.text()
    const res = new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch {
    const res = NextResponse.json({
      data_available: false,
      reason: 'sync_status_upstream_unreachable',
      connectors: [] as const,
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
