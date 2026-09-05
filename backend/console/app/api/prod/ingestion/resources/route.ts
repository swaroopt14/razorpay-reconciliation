import { NextRequest, NextResponse } from 'next/server'
import { fetchIntents } from '@/services/backend/intents'
import { fetchDLQItems } from '@/services/backend/dlq'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Try to fetch real counts from backend services
    let intentsTotal = 0
    let dlqCount = 0

    try {
      const intentsResponse = await fetchIntents({ page: 1, page_size: 1 })
      intentsTotal = intentsResponse.pagination.total
    } catch {
      // Service unavailable, use 0
    }

    try {
      const dlqItems = await fetchDLQItems()
      dlqCount = dlqItems.length
    } catch {
      // Service unavailable, use 0
    }

    // Return real counts where available, zeros otherwise
    const resources = {
      intents: {
        total: intentsTotal,
        running: intentsTotal - dlqCount,
        pending: dlqCount,
      },
      raw_envelopes: 0, // TODO: Add endpoint in vault-journal
      batches: 0,
      batch_pipelines: 0,
      stream_consumers: 0,
      consumer_groups: 0,
      evidence_receipts: 0,
      schema_versions: 0,
      idempotency_keys: 0,
      security_groups: 0,
      api_gateways: 0,
      webhook_receivers: 0,
    }

    return NextResponse.json(resources)
  } catch (error) {
    console.error('Error fetching resources:', error)

    // Return empty counts on error (no mock data)
    return NextResponse.json({
      intents: { total: 0, running: 0, pending: 0 },
      raw_envelopes: 0,
      batches: 0,
      batch_pipelines: 0,
      stream_consumers: 0,
      consumer_groups: 0,
      evidence_receipts: 0,
      schema_versions: 0,
      idempotency_keys: 0,
      security_groups: 0,
      api_gateways: 0,
      webhook_receivers: 0,
    })
  }
}
