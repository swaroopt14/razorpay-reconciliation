import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import { publicBffError } from '@/services/bff/publicBffError'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId
  const { packId } = await context.params
  const encoded = encodeURIComponent(packId)

  const url = `${BACKEND_SERVICES.EVIDENCE.BASE_URL}/v1/evidence/packs/${encoded}/verify?tenant_id=${encodeURIComponent(tenantId)}`

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: await request.text(),
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
  } catch (error) {
    const res = publicBffError({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Evidence verification is temporarily unavailable. Retry shortly.',
      status: 502,
      log: {
        route: '/api/prod/evidence/packs/[packId]/verify',
        upstream: url,
        error,
        extra: { pack_id: packId },
      },
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
