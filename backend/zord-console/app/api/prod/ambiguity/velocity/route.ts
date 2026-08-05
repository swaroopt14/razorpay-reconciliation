import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardIntelligence } from '../../intelligence/_shared'

export const dynamic = 'force-dynamic'

/** Ambiguity Velocity scatter — GET /v1/intelligence/dashboard/bubble-map */
export async function GET(request: NextRequest) {
  const res = await forwardIntelligence(request, BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.BUBBLE_MAP)
  if (res.status === 200) return res
  return NextResponse.json(
    {
      data_available: false as const,
      reason: 'Ambiguity velocity bubble map not available yet.',
    },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
}
