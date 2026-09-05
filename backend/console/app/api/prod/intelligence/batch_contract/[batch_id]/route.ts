import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardIntelligence } from '../../_shared'

export const dynamic = 'force-dynamic'

// GET /api/prod/intelligence/batch_contract/{batch_id}
// Per-batch reference coverage and risk amounts from batch_contracts.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ batch_id: string }> },
) {
  const { batch_id } = await context.params
  return forwardIntelligence(request, BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.BATCH_CONTRACT(batch_id))
}
