import { NextRequest, NextResponse } from 'next/server'
import { buildUnavailableOverview, fetchOverview } from '@/services/backend/overview'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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
