import { NextRequest, NextResponse } from 'next/server'
import { fetchLeakageTrendFromIntelligence } from '@/services/payout-command/prod-api/aggregateLeakageKpisToTrend'
import type {
  DisbursementTrendRange,
  DisbursementTrendResponse,
} from '@/services/payout-command/prod-api/disbursementTrendTypes'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

const RANGES: DisbursementTrendRange[] = ['week', 'month', 'quarter', 'year']

/**
 * Home trend chart BFF — buckets Intended vs Bank-Confirmed from zord-intelligence
 * leakage dashboard (GET /v1/intelligence/dashboard/leakage) per date window.
 * No intent-engine aggregation.
 */
export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const rangeRaw = (request.nextUrl.searchParams.get('range') || 'month').toLowerCase()
  const range = rangeRaw as DisbursementTrendRange

  if (!RANGES.includes(range)) {
    return NextResponse.json(
      { error: 'range must be one of: week, month, quarter, year' },
      { status: 400 },
    )
  }

  const buckets = await fetchLeakageTrendFromIntelligence(tenantId, range)
  const body: DisbursementTrendResponse = {
    data_available: buckets.some((b) => b.total_amount > 0 || b.confirmed_amount > 0),
    range,
    currency: 'INR',
    buckets,
    source: 'intelligence_leakage_windows',
    note: 'Each bucket calls GET /v1/intelligence/dashboard/leakage with from_date and to_date for that window.',
  }

  const res = NextResponse.json(body)
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}
