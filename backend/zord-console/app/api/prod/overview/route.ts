import { NextRequest, NextResponse } from 'next/server'
import { buildUnavailableOverview, fetchOverview } from '@/services/backend/overview'
import { requireSessionTenantForProdProxy } from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  try {
    // Fetch overview data from backend services (includes health checks)
    const overviewData = await fetchOverview()

    return NextResponse.json(overviewData, {
      status: overviewData.availability === 'UNAVAILABLE' ? 503 : 200,
      headers: { 'cache-control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching overview:', error)

    return NextResponse.json(buildUnavailableOverview(), {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    })
  }
}
