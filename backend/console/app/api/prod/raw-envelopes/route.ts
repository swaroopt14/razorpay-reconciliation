import { NextRequest, NextResponse } from 'next/server'
import { fetchEnvelopes } from '@/services/backend/envelopes'
import { fetchIntents } from '@/services/backend/intents'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('page_size') || '20', 10)
  const tenantId = searchParams.get('tenant_id') || undefined

  // Primary source: envelope backend.
  try {
    const response = await fetchEnvelopes({
      page,
      page_size: pageSize,
      tenant_id: tenantId,
    })

    const items = response.items.map((envelope) => ({
      envelope_id: envelope.envelope_id,
      source: envelope.source,
      content_type: 'application/json',
      size_bytes: 0,
      sha256: envelope.payload_hash,
      received_at: envelope.received_at,
      tenant_id: envelope.tenant_id,
      parse_status: envelope.parse_status,
      signature_status: envelope.signature_status,
    }))

    return NextResponse.json({
      items,
      pagination: response.pagination,
    })
  } catch (primaryError) {
    // Fallback source: infer envelope journal rows from intents to avoid blank UI when
    // envelope list endpoint is unavailable in local environments.
    try {
      const intents = await fetchIntents({
        page,
        page_size: pageSize,
        tenant_id: tenantId,
      })

      const items = intents.items.map((intent) => ({
        envelope_id: intent.envelope_id,
        source: intent.intent_type || 'API',
        content_type: 'application/json',
        size_bytes: 0,
        sha256: '',
        received_at: intent.created_at,
        tenant_id: intent.tenant_id,
        parse_status: 'CANONICALIZED',
        signature_status: 'UNKNOWN',
      }))

      return NextResponse.json({
        items,
        pagination: intents.pagination,
        warning: 'Envelope backend unavailable. Showing envelopes inferred from intents.',
      })
    } catch (fallbackError) {
      console.error('Error fetching raw envelopes from backend:', primaryError)
      console.error('Error loading raw envelopes fallback:', fallbackError)

      return NextResponse.json({
        items: [],
        pagination: {
          page,
          page_size: pageSize,
          total: 0,
        },
        error: fallbackError instanceof Error ? fallbackError.message : 'Failed to fetch envelopes',
      })
    }
  }
}
