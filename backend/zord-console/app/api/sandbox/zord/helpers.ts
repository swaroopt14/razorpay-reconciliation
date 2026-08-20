import { NextRequest, NextResponse } from 'next/server'
import { getTimeRangeParam, resolveTenantId } from '@/services/analytics'

export const dynamic = 'force-dynamic'

export function resolveRequestContext(request: NextRequest): {
  tenantId: string
  timeRange: string
  response?: NextResponse
} {
  const tenant = resolveTenantId(request)
  if (tenant.error) {
    return {
      tenantId: tenant.tenantId,
      timeRange: getTimeRangeParam(request),
      response: NextResponse.json({ error: tenant.error }, { status: 400 }),
    }
  }

  return {
    tenantId: tenant.tenantId,
    timeRange: getTimeRangeParam(request),
  }
}

export function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}
