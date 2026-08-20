import { NextRequest, NextResponse } from 'next/server'
import { requireSessionTenantForProdProxy } from '@/services/auth/resolvePayoutTenant.server'
import { publicBffError } from '@/services/bff/publicBffError'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  return publicBffError({
    code: 'UNAVAILABLE',
    message: 'Tenant directory is not part of live V1 BFF.',
    status: 503,
  })
}
