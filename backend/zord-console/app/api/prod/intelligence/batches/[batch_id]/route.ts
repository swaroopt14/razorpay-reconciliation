import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardIntelligence } from '../../_shared'

export const dynamic = 'force-dynamic'

// GET /api/prod/intelligence/batches/{batch_id}?tenant_id=…
// Returns the batch_contracts row + batch.health projection (intended/confirmed/
// variance/ambiguity totals) for the selected batch.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ batch_id: string }> },
) {
  const { batch_id } = await context.params
  return forwardIntelligence(request, BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.BATCH_BY_ID(batch_id))
}
