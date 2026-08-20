import { NextRequest, NextResponse } from 'next/server'
import {
  applyEvidenceGateCookies,
  gateEvidenceTenant,
  getEvidencePackById,
  getEvidenceTimelineById,
} from '../../_shared'
import { buildEvidenceTimelineResponse } from '@/services/payout-command/prod-api/mapEvidenceTimeline'

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

  const upstreamTimeline = await getEvidenceTimelineById(gate.tenantId, gate.accessToken, evidenceId)
  const pack = await getEvidencePackById(gate.tenantId, gate.accessToken, evidenceId)

  const payload = buildEvidenceTimelineResponse({
    evidencePackId: evidenceId,
    intentId: pack.ok ? pack.data.intent_id : '',
    upstreamTimeline: upstreamTimeline.ok ? (upstreamTimeline.data.timeline ?? []) : null,
    pack: pack.ok ? (pack.data as unknown as Record<string, unknown>) : null,
  })

  const res = NextResponse.json(payload, { status: 200 })
  applyEvidenceGateCookies(res, gate.refreshedPayload)
  return res
}
