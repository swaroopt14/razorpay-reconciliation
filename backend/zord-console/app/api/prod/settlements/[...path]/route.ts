import { NextRequest, NextResponse } from 'next/server'
import { applyAuthCookies } from '@/services/auth/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function settlementsBase() {
  const explicit =
    process.env.ZORD_SETTLEMENT_URL?.trim() || process.env.SMOKE_SIMULATOR_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return 'http://localhost:8099'
}

function safePath(segments: string[]): string | null {
  if (segments.some((s) => !s || s.includes('..') || s.includes('/') || s.includes('\\'))) {
    return null
  }
  return segments.join('/')
}

async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  if (request.method.toUpperCase() !== 'GET') {
    return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
  }

  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const rest = safePath(segments)
  const params = new URLSearchParams(request.nextUrl.searchParams)
  params.delete('tenant_id')
  params.set('tenant_id', tenantId)

  const path = rest ? `/v1/settlements/${rest}` : '/v1/settlements'
  const url = `${settlementsBase()}${path}?${params.toString()}`
  const accessCookie = request.cookies.get('zord_access_token')?.value
  const authHeader = accessCookie?.trim() ? `Bearer ${accessCookie.trim()}` : ''

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
        'tenant-id': tenantId,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: 'no-store',
    })
    const text = await upstream.text()
    const res = new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
    if (gate.refreshedPayload) applyAuthCookies(res, gate.refreshedPayload)
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        error: 'settlements upstream unavailable',
        upstream: url,
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}

export async function GET(
  request: NextRequest,
  context: { params: { path?: string[] } },
) {
  return proxy(request, context.params.path ?? [])
}
