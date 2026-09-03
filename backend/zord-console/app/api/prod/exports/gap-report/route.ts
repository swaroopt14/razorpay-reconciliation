import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const body = await request.json().catch(() => ({}))
  const res = NextResponse.json({
    data_available: false,
    reason: 'export_service_pending',
    tenant_id: tenantId,
    job_id: null,
    requested: body,
    message: 'Gap report export will run when the export worker is connected.',
  })
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}
