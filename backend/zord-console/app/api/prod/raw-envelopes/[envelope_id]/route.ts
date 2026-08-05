import { NextRequest, NextResponse } from 'next/server'
import { fetchEnvelopeById } from '@/services/backend/envelopes'
import { fetchIntents } from '@/services/backend/intents'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ envelope_id: string }> }
) {
  const { envelope_id } = await params

  if (!envelope_id) {
    return NextResponse.json({ error: 'Envelope ID is required' }, { status: 400 })
  }

  try {
    let envelope = null
    try {
      envelope = await fetchEnvelopeById(envelope_id)
    } catch {
      // Continue with fallback below when direct envelope endpoint is unavailable.
      envelope = null
    }

    if (!envelope) {
      // Fallback for environments where /v1/envelopes/:id is not exposed:
      // infer minimal envelope detail from intents by matching envelope_id.
      const intents = await fetchIntents({ page: 1, page_size: 200 })
      const relatedIntent = intents.items.find((i) => i.envelope_id === envelope_id)
      if (!relatedIntent) {
        return NextResponse.json({ error: 'Envelope not found' }, { status: 404 })
      }

      return NextResponse.json({
        envelope_id,
        tenant_id: relatedIntent.tenant_id,
        source: relatedIntent.intent_type || 'API',
        source_system: '',
        idempotency_key: '',
        sha256: '',
        object_ref: '',
        parse_status: 'CANONICALIZED',
        signature_status: 'UNKNOWN',
        received_at: relatedIntent.created_at,
      })
    }

    return NextResponse.json({
      envelope_id: envelope.envelope_id,
      tenant_id: envelope.tenant_id,
      source: envelope.source,
      source_system: envelope.source_system,
      idempotency_key: envelope.idempotency_key,
      sha256: envelope.payload_hash,
      object_ref: envelope.object_ref,
      parse_status: envelope.parse_status,
      signature_status: envelope.signature_status,
      received_at: envelope.received_at,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch envelope' },
      { status: 502 }
    )
  }
}
