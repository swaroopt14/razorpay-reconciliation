import { NextRequest, NextResponse } from 'next/server'
import { fetchDLQItemById } from '@/services/backend/dlq'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  resolveProxyForwardAuthorization,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dlq_id: string }> }
) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  const auth = await resolveProxyForwardAuthorization(request, undefined)
  if (!auth.ok) return auth.response

  try {
    const { dlq_id } = await params

    if (!dlq_id) {
      return NextResponse.json({ error: 'DLQ ID is required' }, { status: 400 })
    }

    // Fetch from real backend (zord-intent-engine)
    const dlqItem = await fetchDLQItemById(dlq_id, gate.tenantId, auth.authorization)

    if (!dlqItem) {
      const res = NextResponse.json({ error: 'DLQ item not found' }, { status: 404 })
      applyRefreshedSessionCookies(res, auth.refreshedPayload ?? gate.refreshedPayload)
      return res
    }

    // Transform backend response to match frontend DLQItemDetail type
    const detail = {
      dlq_id: dlqItem.dlq_id,
      envelope_id: dlqItem.envelope_id,
      stage: dlqItem.stage,
      reason_code: dlqItem.reason_code,
      created_at: dlqItem.created_at,
      replayable: dlqItem.replayable,
      error_detail: dlqItem.error_detail || '',
      raw_payload_hash: '', // TODO: Get from envelope
      linked_envelope: {
        envelope_id: dlqItem.envelope_id,
        source: 'API', // TODO: Get from envelope
        received_at: dlqItem.created_at,
      },
      linked_intent_id: undefined,
      replay_attempts: 0,
      last_replay_at: undefined,
      metadata: {
        tenant: dlqItem.tenant_id,
        trace_id: '',
        correlation_id: '',
        ingestion_channel: 'REST_API',
      },
    }

    const res = NextResponse.json(detail)
    applyRefreshedSessionCookies(res, auth.refreshedPayload ?? gate.refreshedPayload)
    return res
  } catch (error) {
    console.error('Error fetching DLQ item from backend:', error)
    const res = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch DLQ item' },
      { status: 500 }
    )
    applyRefreshedSessionCookies(res, auth.refreshedPayload ?? gate.refreshedPayload)
    return res
  }
}
