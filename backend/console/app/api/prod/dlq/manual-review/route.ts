import { NextRequest, NextResponse } from 'next/server'
import { fetchDLQManualReviewItems } from '@/services/backend/dlq'
import { mapBackendDlqForClient } from '@/services/backend/dlqBffTransform'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  try {
    const items = await fetchDLQManualReviewItems({ tenant_id: tenantId })
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
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
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
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}

