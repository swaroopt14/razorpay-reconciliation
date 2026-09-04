import { NextRequest, NextResponse } from 'next/server'
import { fetchOverview, OverviewData } from '@/services/backend/overview'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Fetch overview data from backend services (includes health checks)
    const overviewData = await fetchOverview()

    return NextResponse.json(overviewData)
  } catch (error) {
    console.error('Error fetching overview:', error)

    // Return empty overview data on error (no mock data)
    const emptyOverview: OverviewData = {
      environment: 'PRODUCTION',
      kpis: {
        intents_received_24h: 0,
        canonicalized_24h: 0,
        rejected_24h: 0,
        idempotency_hits_24h: 0,
        p95_ingest_latency_ms: 0,
        slo: {
          latency_ms: 60,
          success_rate_pct: 99.9,
        },
      },
      health: [],
      errors_last_24h: {},
      recent_activity: [],
      evidence: {
        worm_active: false,
        last_write: '',
        hash_chain: 'OK',
      },
    }

    return NextResponse.json(emptyOverview)
  }
}
