import { NextRequest, NextResponse } from 'next/server'
import { getOverviewMetrics } from '@/services/analytics'
import { resolveRequestContext, withNoStore } from '../../helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = resolveRequestContext(request)
  if (ctx.response) return ctx.response

  try {
    const data = getOverviewMetrics(ctx.tenantId, ctx.timeRange)
    return withNoStore(NextResponse.json(data))
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load overview metrics', detail: error instanceof Error ? error.message : 'unknown error' }, { status: 500 })
  }
}
