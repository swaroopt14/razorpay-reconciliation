import { NextRequest, NextResponse } from 'next/server'
import { fetchDLQManualReviewItems } from '@/services/backend/dlq'
import { mapBackendDlqForClient } from '@/services/backend/dlqBffTransform'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  resolveProxyForwardAuthorization,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const auth = await resolveProxyForwardAuthorization(request, undefined)
  if (!auth.ok) return auth.response

  try {
    const items = await fetchDLQManualReviewItems({ tenant_id: tenantId, authorization: auth.authorization })
    const list = Array.isArray(items) ? items : []

    const transformedItems = list.map(mapBackendDlqForClient)

    const res = NextResponse.json({
      items: transformedItems,
      pagination: {
        page: 1,
        page_size: transformedItems.length,
        total: transformedItems.length,
      },
    })
    applyRefreshedSessionCookies(res, auth.refreshedPayload ?? gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        items: [],
        pagination: {
          page: 1,
          page_size: 0,
          total: 0,
        },
        error: error instanceof Error ? error.message : 'Failed to fetch DLQ manual-review items',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, auth.refreshedPayload ?? gate.refreshedPayload)
    return res
  }
}

