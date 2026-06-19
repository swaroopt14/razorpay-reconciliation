import { NextRequest } from 'next/server'
import { forwardEvidence } from '../../../_shared'

export const dynamic = 'force-dynamic'

/** GET /api/prod/evidence/packs/:packId/timeline → zord-evidence operational timeline */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const { packId } = await context.params
  const encoded = encodeURIComponent(packId)
  return forwardEvidence(request, `/v1/evidence/packs/${encoded}/timeline`)
}
