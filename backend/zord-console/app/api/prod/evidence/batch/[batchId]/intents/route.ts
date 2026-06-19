import { NextRequest } from 'next/server'
import { forwardEvidence } from '../../../_shared'

export const dynamic = 'force-dynamic'

/** GET /api/prod/evidence/batch/:batchId/intents → zord-evidence batch intent packs */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await context.params
  const encoded = encodeURIComponent(batchId)
  return forwardEvidence(request, `/v1/evidence/batch/${encoded}/intents`)
}
