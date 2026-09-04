import { NextRequest, NextResponse } from 'next/server'
import { fetchDLQItems, fetchDLQManualReviewItems, type BackendDLQItem } from '@/services/backend/dlq'
import { mapBackendDlqForClient } from '@/services/backend/dlqBffTransform'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

function mergeDlqRows(primary: BackendDLQItem[], manualReview: BackendDLQItem[]): BackendDLQItem[] {
  const merged = new Map<string, BackendDLQItem>()
  const keyOf = (item: BackendDLQItem): string => {
    if (item.dlq_id && item.dlq_id.trim()) return `id:${item.dlq_id.trim()}`
    const envelope = item.envelope_id?.trim() || 'na'
    const stage = item.stage?.trim() || 'na'
    const reason = item.reason_code?.trim() || 'na'
    const created = item.created_at?.trim() || 'na'
    return `row:${envelope}:${stage}:${reason}:${created}`
  }

  for (const item of [...primary, ...manualReview]) {
    merged.set(keyOf(item), item)
  }
  return Array.from(merged.values())
}

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  try {
    const [standardRows, manualReviewRows] = await Promise.all([
      fetchDLQItems({ tenant_id: tenantId }),
      fetchDLQManualReviewItems({ tenant_id: tenantId }),
    ])
    const list = mergeDlqRows(
      Array.isArray(standardRows) ? standardRows : [],
      Array.isArray(manualReviewRows) ? manualReviewRows : [],
    )

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
    const res = NextResponse.json({
      items: [],
      pagination: {
        page: 1,
        page_size: 50,
        total: 0,
      },
      error: error instanceof Error ? error.message : 'Failed to fetch DLQ items',
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
