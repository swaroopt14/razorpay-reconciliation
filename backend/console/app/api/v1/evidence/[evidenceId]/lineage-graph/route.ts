import { NextRequest, NextResponse } from 'next/server'
import {
  applyEvidenceGateCookies,
  gateEvidenceTenant,
  getEvidencePackById,
  mapLineageGraphFromPack,
} from '../../_shared'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ evidenceId: string }> },
) {
  const gate = await gateEvidenceTenant(request)
  if (!gate.ok) return gate.response

  const { evidenceId: rawId } = await context.params
  const evidenceId = rawId?.trim()
  if (!evidenceId) {
    const res = NextResponse.json({ error: 'evidenceId is required' }, { status: 400 })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const full = await getEvidencePackById(gate.tenantId, evidenceId)
  if (!full.ok) {
    const res = NextResponse.json(
      { error: 'Could not load evidence pack', detail: full.detail },
      { status: full.status || 502 },
    )
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const graph = mapLineageGraphFromPack(full.data)
  const res = NextResponse.json(graph, { status: 200 })
  applyEvidenceGateCookies(res, gate.refreshedPayload)
  return res
}
