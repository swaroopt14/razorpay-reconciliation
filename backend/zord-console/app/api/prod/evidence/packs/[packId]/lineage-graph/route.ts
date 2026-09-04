import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardEvidence } from '../../../_shared'

export const dynamic = 'force-dynamic'

/** GET /api/prod/evidence/packs/:packId/lineage-graph → zord-evidence lineage graph */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const { packId } = await context.params
  return forwardEvidence(request, BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACK_LINEAGE_GRAPH(packId))
}
