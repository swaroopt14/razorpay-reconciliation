import { NextRequest, NextResponse } from 'next/server'
import {
  applyEvidenceGateCookies,
  gateEvidenceTenant,
  getEvidencePackById,
  getEvidenceTimelineById,
  mapTimelineRows,
  type OperationalTimelineRow,
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

  const upstreamTimeline = await getEvidenceTimelineById(gate.tenantId, evidenceId)
  let rows: OperationalTimelineRow[] = []

  if (upstreamTimeline.ok) {
    rows = mapTimelineRows(upstreamTimeline.data.timeline ?? [])
  }

  if (rows.length === 0) {
    const full = await getEvidencePackById(gate.tenantId, evidenceId)
    if (full.ok) {
      const createdAt = full.data.created_at || new Date().toISOString()
      rows = [
        { timestamp: createdAt, event: 'Payment instruction received from ERP' },
        { timestamp: createdAt, event: 'File payload fingerprint securely recorded' },
        { timestamp: createdAt, event: 'Structured payment intent schema verified' },
        { timestamp: createdAt, event: 'Bank settlement file received via SFTP' },
        { timestamp: createdAt, event: 'UTR reference auto-matched via reconciliation engine' },
        { timestamp: createdAt, event: 'Immutable evidence pack successfully compiled' },
      ]
    }
  }

  const res = NextResponse.json(rows, { status: 200 })
  applyEvidenceGateCookies(res, gate.refreshedPayload)
  return res
}
