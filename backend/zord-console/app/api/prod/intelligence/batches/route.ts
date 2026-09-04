import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardIntelligence } from '../_shared'

export const dynamic = 'force-dynamic'

// GET /api/prod/intelligence/batches?tenant_id=…&status=…&limit=…
// Forwards to zord-intelligence /v1/intelligence/batches.
// Supported status filters: REQUIRES_REVIEW, SETTLED, PARTIALLY_SETTLED, PENDING, FAILED, CANCELLED.
export async function GET(request: NextRequest) {
  return forwardIntelligence(request, BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.BATCHES)
}
