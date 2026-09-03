import { NextRequest, NextResponse } from 'next/server'
import { IdempotencyListResponse, IdempotencyKey, IdempotencyStatus } from '@/types/validation'

export const dynamic = 'force-dynamic'

// Generate mock idempotency keys
function generateMockKeys(): IdempotencyKey[] {
  const tenants = ['default', 'tenant_arealis_nbfc', 'tenant_fintech_corp', 'tenant_payments_inc']
  const statuses: IdempotencyStatus[] = ['CONSUMED', 'REJECTED', 'PENDING', 'EXPIRED']
  const prefixes = ['pay', 'payout', 'refund', 'transfer', 'batch']
  
  const keys: IdempotencyKey[] = []
  const now = new Date()
  
  for (let i = 0; i < 50; i++) {
    const tenant = tenants[Math.floor(Math.random() * tenants.length)]
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const date = new Date(now.getTime() - Math.random() * 86400000 * 7) // Last 7 days
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '')
    const suffix = Math.random().toString(36).substring(2, 8)
    
    // Weight towards CONSUMED status
    let status: IdempotencyStatus
    const rand = Math.random()
    if (rand < 0.7) status = 'CONSUMED'
    else if (rand < 0.85) status = 'REJECTED'
    else if (rand < 0.95) status = 'EXPIRED'
    else status = 'PENDING'
    
    keys.push({
      tenant,
      idempotency_key: `${prefix}_${dateStr}_${suffix}`,
      status,
      first_seen: date.toISOString(),
      expires_at: status === 'EXPIRED' ? new Date(date.getTime() + 86400000).toISOString() : undefined,
    })
  }
  
  // Sort by first_seen descending
  keys.sort((a, b) => new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime())
  
  return keys
}

const mockKeys = generateMockKeys()

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('page_size') || '50', 10)
  const statusFilter = searchParams.get('status') as IdempotencyStatus | null
  const tenantFilter = searchParams.get('tenant')
  const search = searchParams.get('search') || ''

  // Filter keys
  let filteredKeys = [...mockKeys]

  if (statusFilter) {
    filteredKeys = filteredKeys.filter(k => k.status === statusFilter)
  }

  if (tenantFilter) {
    filteredKeys = filteredKeys.filter(k => k.tenant === tenantFilter)
  }

  if (search) {
    const searchLower = search.toLowerCase()
    filteredKeys = filteredKeys.filter(k => k.idempotency_key.toLowerCase().includes(searchLower))
  }

  // Paginate
  const total = filteredKeys.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = filteredKeys.slice(start, start + pageSize)

  // Calculate summary (last 24h)
  const last24h = new Date(Date.now() - 86400000)
  const keysLast24h = mockKeys.filter(k => new Date(k.first_seen) > last24h)
  const activeKeys = mockKeys.filter(k => k.status === 'CONSUMED' || k.status === 'PENDING').length
  const duplicatesBlocked = keysLast24h.filter(k => k.status === 'REJECTED').length
  const expiredKeys = keysLast24h.filter(k => k.status === 'EXPIRED').length

  const response: IdempotencyListResponse = {
    items,
    summary: {
      active_keys: activeKeys,
      duplicates_blocked_24h: duplicatesBlocked + 312, // Add some baseline
      replays_allowed: 0,
      expired_keys_24h: expiredKeys,
    },
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
  }

  return NextResponse.json(response)
}
