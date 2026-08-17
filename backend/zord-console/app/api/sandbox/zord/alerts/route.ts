import { NextRequest, NextResponse } from 'next/server'
import { getAlerts } from '@/services/analytics'
import { resolveRequestContext, withNoStore } from '../helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = resolveRequestContext(request)
  if (ctx.response) return ctx.response

  const alerts = getAlerts(ctx.tenantId)
  return withNoStore(
    NextResponse.json({
      items: alerts,
      active_count: alerts.filter((item) => item.status === 'ACTIVE').length,
    }),
  )
}
