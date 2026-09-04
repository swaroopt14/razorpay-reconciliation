import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardEvidence } from '../../_shared'

export const dynamic = 'force-dynamic'

// GET /api/prod/evidence/packs/:packId?tenant_id=…
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const { packId: rawPackId } = await context.params
  const packId = rawPackId?.trim() || ''
  if (!packId) {
    return new Response(JSON.stringify({ error: 'packId is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }
  return forwardEvidence(request, BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACK_BY_ID(packId))
}
