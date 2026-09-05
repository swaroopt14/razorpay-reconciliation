import { NextRequest, NextResponse } from 'next/server'
import { proxyIntentEngineGet } from '../_proxyIntentEngineGet'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

/** Proxy: GET /api/prod/intents/dlq-items?batch_id= → zord-intent-engine. */
export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get('batch_id')?.trim()
  if (!batchId) {
    const gate = await requireSessionTenantForProdProxy(request)
    const res = NextResponse.json({ error: 'batch_id query parameter is required' }, { status: 400 })
    if (gate.ok) applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
  return proxyIntentEngineGet(request, {
    upstreamPath: '/api/prod/intents/dlq-items',
    query: { batch_id: batchId },
  })
}
