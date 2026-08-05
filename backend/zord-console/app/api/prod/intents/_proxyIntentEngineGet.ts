import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { applyRefreshedSessionCookies } from '@/services/auth/resolvePayoutTenant.server'
import {
  intentEngineForwardHeaders,
  requireIntentEngineProxyGate,
} from './_intentEngineProxy'

export const dynamic = 'force-dynamic'

type ProxyOptions = {
  upstreamPath: string
  /** Extra query params forwarded upstream (tenant_id is never forwarded — headers only). */
  query?: Record<string, string | undefined>
}

/** Proxy GET to zord-intent-engine; tenant + auth from session headers only. */
export async function proxyIntentEngineGet(request: NextRequest, options: ProxyOptions) {
  const gate = await requireIntentEngineProxyGate(request)
  if (!gate.ok) return gate.response

  const upstreamParams = new URLSearchParams()
  for (const [k, v] of Object.entries(options.query ?? {})) {
    const trimmed = v?.trim()
    if (trimmed) upstreamParams.set(k, trimmed)
  }
  for (const [k, v] of request.nextUrl.searchParams.entries()) {
    if (k === 'tenant_id') continue
    if (!upstreamParams.has(k) && v.trim()) upstreamParams.set(k, v)
  }

  const batchId =
    options.query?.batch_id?.trim() ||
    request.nextUrl.searchParams.get('batch_id')?.trim() ||
    undefined

  const query = upstreamParams.toString()
  const url = `${BACKEND_SERVICES.INTENT_ENGINE.BASE_URL}${options.upstreamPath}${query ? `?${query}` : ''}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: intentEngineForwardHeaders(gate.tenantId, gate.authorization, batchId),
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
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      { error: 'intent-engine unreachable', details: error instanceof Error ? error.message : 'unknown' },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
