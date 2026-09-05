import { NextRequest, NextResponse } from 'next/server'
import { fetchTenantById } from '@/services/backend/tenants'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant_id: string }> }
) {
  try {
    const { tenant_id } = await params

    if (!tenant_id) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 })
    }

    // Fetch from real backend (zord-edge)
    const tenant = await fetchTenantById(tenant_id)

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Return tenant platform response
    const response = {
      identity: {
        tenant_id: tenant.tenant_id,
        tenant_name: tenant.tenant_name,
        display_name: tenant.tenant_name,
        environment: 'PRODUCTION',
        region: 'ap-south-1',
        onboarded_date: tenant.created_at,
        tier: 'STANDARD',
        risk_level: 'LOW',
      },
      status: {
        overall: tenant.status === 'ACTIVE' ? 'HEALTHY' : 'IMPACTED',
        primary_issue: null,
        last_incident_minutes_ago: null,
      },
      usage: {
        api_calls_24h: 0,
        webhooks_24h: 0,
        streams_24h: 0,
        batch_rows_24h: 0,
        api_quota_percent: 0,
        webhook_quota_percent: 0,
        stream_lag_percent: 0,
      },
      reliability: {
        success_rate_percent: 0,
        failed_intents_24h: 0,
        dlq_items_24h: 0,
        replayable_24h: 0,
        top_failures: [],
      },
      evidence: {
        coverage_percent: 0,
        hash_chain_status: 'UNKNOWN',
        retention_years: 7,
        last_verification_minutes_ago: 0,
      },
      recent_activity: [],
      monitors: [],
      transactions: {
        total: 0,
        successful: 0,
        failed: 0,
        pending: 0,
        by_channel: [],
        by_type: [],
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching tenant from backend:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tenant' },
      { status: 500 }
    )
  }
}
