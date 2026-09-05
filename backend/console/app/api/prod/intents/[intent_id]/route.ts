import { NextRequest, NextResponse } from 'next/server'
import { fetchIntentById } from '@/services/backend/intents'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { intent_id: string } },
) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  try {
    const { intent_id } = params

    if (!intent_id) {
      return NextResponse.json({ error: 'Intent ID is required' }, { status: 400 })
    }

    const intent = await fetchIntentById(intent_id)

    if (!intent) {
      const res = NextResponse.json({ error: 'Intent not found' }, { status: 404 })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    if (intent.tenant_id && intent.tenant_id !== gate.tenantId) {
      const res = NextResponse.json({ error: 'Intent not found' }, { status: 404 })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const intentDetail = {
      intent_id: intent.intent_id,
      batch_id: intent.batch_id,
      status: intent.status,
      source: intent.intent_type || 'API',
      canonical: {
        intent_type: intent.intent_type || 'PAYOUT',
        amount: {
          value: intent.amount,
          currency: intent.currency,
        },
        instrument: {
          kind: intent.beneficiary_type || 'BANK',
          account_token: '',
        },
        purpose_code: '',
        constraints: intent.constraints || {},
      },
      lifecycle: [],
      evidence: {
        raw_envelope_id: intent.envelope_id,
        canonical_snapshot: '',
        outbox_event_id: '',
      },
      beneficiary: intent.beneficiary,
      pii_tokens: intent.pii_tokens,
      deadline_at: intent.deadline_at,
      confidence_score: intent.confidence_score,
      created_at: intent.created_at,
    }

    const res = NextResponse.json(intentDetail)
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch intent' },
      { status: 500 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
