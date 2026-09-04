import { NextRequest } from 'next/server'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function resolveTenantId(request: NextRequest): { tenantId: string; source: 'query' | 'header' | 'default'; error?: string } {
  const fromQuery = request.nextUrl.searchParams.get('tenant_id')
  if (fromQuery) {
    if (!UUID_PATTERN.test(fromQuery)) {
      return { tenantId: DEFAULT_TENANT_ID, source: 'query', error: 'Invalid tenant_id format. Must be UUID.' }
    }
    return { tenantId: fromQuery, source: 'query' }
  }

  const fromHeader = request.headers.get('x-tenant-id')
  if (fromHeader) {
    if (!UUID_PATTERN.test(fromHeader)) {
      return { tenantId: DEFAULT_TENANT_ID, source: 'header', error: 'Invalid X-Tenant-Id format. Must be UUID.' }
    }
    return { tenantId: fromHeader, source: 'header' }
  }

  return { tenantId: DEFAULT_TENANT_ID, source: 'default' }
}

export function getTimeRangeParam(request: NextRequest): string {
  return request.nextUrl.searchParams.get('time_range') || '24h'
}
