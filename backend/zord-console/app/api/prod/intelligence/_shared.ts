import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  sessionUpstreamHeaders,
} from '@/services/auth/resolvePayoutTenant.server'

const JSON_NO_STORE = { 'cache-control': 'no-store' } as const

type IntelligenceAvailability = 'AVAILABLE' | 'EMPTY' | 'STALE' | 'UNAVAILABLE'
type JsonRecord = Record<string, unknown>

function readAvailability(value: unknown): IntelligenceAvailability | null {
  return value === 'AVAILABLE' || value === 'EMPTY' || value === 'STALE' || value === 'UNAVAILABLE'
    ? value
    : null
}

function inferAvailability(payload: JsonRecord): IntelligenceAvailability {
  const explicit = readAvailability(payload.availability)
  if (explicit) return explicit
  if (payload.data_available === true) return 'AVAILABLE'
  if (payload.data_available === false) return 'EMPTY'

  for (const key of ['batches', 'snapshots', 'items', 'data']) {
    const value = payload[key]
    if (Array.isArray(value)) return value.length > 0 ? 'AVAILABLE' : 'EMPTY'
  }

  return 'AVAILABLE'
}

function unavailableResponse(reason: string): NextResponse {
  return NextResponse.json(
    {
      availability: 'UNAVAILABLE' as const,
      data_available: false as const,
      reason,
      retryable: true,
    },
    { status: 503, headers: JSON_NO_STORE },
  )
}

function normalizedSuccessResponse(text: string, upstreamStatus: number): NextResponse {
  if (upstreamStatus === 204 || !text.trim()) {
    return NextResponse.json(
      {
        availability: 'EMPTY' as const,
        data_available: false as const,
        reason: 'No intelligence data is available for this scope.',
      },
      { status: 200, headers: JSON_NO_STORE },
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return unavailableResponse('Intelligence returned an unreadable response. Retry shortly.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return unavailableResponse('Intelligence returned an invalid response. Retry shortly.')
  }

  const payload = parsed as JsonRecord
  const availability = inferAvailability(payload)
  return NextResponse.json(
    { ...payload, availability },
    { status: availability === 'UNAVAILABLE' ? 503 : 200, headers: JSON_NO_STORE },
  )
}

function logUpstreamFailure(details: {
  url: string
  status?: number
  traceId?: string | null
  error?: unknown
}) {
  console.error('[zord-bff]', {
    route: '/api/prod/intelligence',
    upstream: details.url,
    upstreamStatus: details.status,
    upstreamTraceId: details.traceId || undefined,
    error: details.error instanceof Error ? details.error.message : details.error ? 'unknown' : undefined,
  })
}

/**
 * Shared forwarder for `/api/prod/intelligence/*` Next routes → zord-intelligence (:8089).
 * Tenant is taken from the signed-in session; client-supplied tenant_id is ignored.
 *
 * Successful empty payloads are `EMPTY`. Upstream failures are HTTP 503 with
 * `UNAVAILABLE`; they are never rewritten as successful empty KPI/list payloads.
 */
export async function forwardIntelligence(request: NextRequest, path: string): Promise<NextResponse> {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId
  const accessToken = gate.accessToken

  const params = new URLSearchParams(request.nextUrl.searchParams)
  params.delete('tenant_id')
  params.set('tenant_id', tenantId)

  const url = `${BACKEND_SERVICES.INTELLIGENCE.BASE_URL}${path}?${params.toString()}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: sessionUpstreamHeaders(tenantId, accessToken),
      cache: 'no-store',
    })
    const text = await upstream.text()

    if (!upstream.ok) {
      logUpstreamFailure({
        url,
        status: upstream.status,
        traceId: upstream.headers.get('x-request-id') || upstream.headers.get('traceparent'),
      })
      const res = unavailableResponse('Intelligence service is temporarily unavailable. Retry shortly.')
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const res = normalizedSuccessResponse(text, upstream.status)
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    logUpstreamFailure({ url, error })
    const res = unavailableResponse('Intelligence service is temporarily unavailable. Retry shortly.')
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
