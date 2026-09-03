import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  BackendAuthEnvelope,
  BackendErrorEnvelope,
  applyAuthCookies,
  buildForwardHeaders,
  parseJSONSafe,
  sanitizeAuthEnvelope,
} from '@/services/auth/server'
import { notifyLoginSlack } from '@/services/support/supportSlack.server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let requestBody: unknown

  try {
    requestBody = await request.json()
  } catch {
    return NextResponse.json(
      { code: 'INVALID_AUTH_REQUEST', message: 'workspace_id, email, password, and login_surface are required' },
      { status: 400 },
    )
  }

  const body = requestBody as {
    email?: string
    company_name?: string
    companyName?: string
    login_surface?: string
    loginSurface?: string
  }
  const companyName = String(body.company_name || body.companyName || '').trim()
  const surface = body.login_surface || body.loginSurface || 'customer'
  if (surface === 'customer' && companyName.length < 2) {
    return NextResponse.json(
      { code: 'COMPANY_REQUIRED', message: 'Company name is required.' },
      { status: 400 },
    )
  }

  const loginBases = Array.from(
    new Set(
      [
        BACKEND_SERVICES.EDGE.BASE_URL,
        process.env.ZORD_EDGE_URL,
        'http://localhost:8099', // smoke simulator fallback when zord-edge is down
      ]
        .map((b) => (typeof b === 'string' ? b.trim().replace(/\/$/, '') : ''))
        .filter(Boolean),
    ),
  )

  let edgeResponse: Response | null = null
  let lastNetworkError = 'Authentication service is unavailable right now.'
  for (const base of loginBases) {
    try {
      const candidate = await fetch(`${base}${BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_LOGIN}`, {
        method: 'POST',
        headers: buildForwardHeaders(request),
        cache: 'no-store',
        body: JSON.stringify(requestBody),
      })
      // Prefer a successful auth response; keep last non-OK for error reporting.
      edgeResponse = candidate
      if (candidate.ok) break
    } catch (err) {
      lastNetworkError = err instanceof Error ? err.message : lastNetworkError
    }
  }

  if (!edgeResponse) {
    return NextResponse.json(
      {
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: `${lastNetworkError}. Tried: ${loginBases.join(', ')}. Start smoke on :8099 or set ZORD_EDGE_URL.`,
      },
      { status: 503 },
    )
  }

  if (!edgeResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(edgeResponse)
    return NextResponse.json(
      {
        code: errorBody?.code ?? 'AUTH_REQUEST_FAILED',
        message: errorBody?.message ?? 'Unable to sign in right now.',
      },
      { status: edgeResponse.status },
    )
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(edgeResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    return NextResponse.json(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Login response was incomplete.' },
      { status: 502 },
    )
  }

  const response = NextResponse.json(sanitizeAuthEnvelope(payload))
  applyAuthCookies(response, payload)
  notifyLoginSlack({
    kind: 'login',
    email: payload.user?.email || body.email || 'unknown',
    name: payload.user?.name,
    tenantId: payload.user?.tenant_id || payload.session?.tenant_id,
    tenantName: payload.user?.tenant_name || companyName,
    surface,
    demo: false,
  })
  return response
}
