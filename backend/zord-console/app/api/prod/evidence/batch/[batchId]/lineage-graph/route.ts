import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardEvidence } from '../../../_shared'

export const dynamic = 'force-dynamic'

/** GET /api/prod/evidence/batch/:batchId/lineage-graph → zord-evidence batch lineage graph */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await context.params
  return forwardEvidence(
    request,
    BACKEND_SERVICES.EVIDENCE.ENDPOINTS.BATCH_LINEAGE_GRAPH(batchId),
  )
}
