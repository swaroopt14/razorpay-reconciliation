import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardIntelligence } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Forwards `batch_id` query param when present — intelligence service returns the
  // anomaly score for that batch instead of the most recent one.
  return forwardIntelligence(request, BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.PATTERNS)
}
