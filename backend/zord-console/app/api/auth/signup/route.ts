import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  BackendAuthEnvelope,
  BackendErrorEnvelope,
  applyAuthCookies,
  buildForwardHeaders,
  edgeAuthUrl,
  parseJSONSafe,
  sanitizeAuthEnvelope,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

// Public signup route — creates a tenant + first admin user in one call.
// Mirrors /login but hits /v1/auth/signup on zord-edge.
export async function POST(request: NextRequest) {
  let requestBody: unknown
  try {
    requestBody = await request.json()
  } catch {
    return NextResponse.json(
      { code: 'INVALID_SIGNUP_REQUEST', message: 'tenant_name, name, email, and password are required' },
      { status: 400 },
    )
  }

  let edgeResponse: Response
  try {
    edgeResponse = await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_SIGNUP), {
      method: 'POST',
      headers: buildForwardHeaders(request),
      cache: 'no-store',
      body: JSON.stringify(requestBody),
    })
  } catch {
    return NextResponse.json(
      { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service is unavailable right now.' },
      { status: 503 },
    )
  }

  if (!edgeResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(edgeResponse)
    const fallbackMessage =
      edgeResponse.status === 404
        ? 'Signup is not available on the API gateway (missing POST /v1/auth/signup). Rebuild and restart zord-edge.'
        : edgeResponse.status === 503
          ? 'Authentication service is unavailable right now.'
          : 'Unable to create account right now.'
    return NextResponse.json(
      {
        code: errorBody?.code ?? 'SIGNUP_FAILED',
        message: errorBody?.message ?? fallbackMessage,
      },
      { status: edgeResponse.status },
    )
  }

  const payload = await parseJSONSafe<BackendAuthEnvelope>(edgeResponse)
  if (!payload?.access_token || !payload.refresh_token) {
    return NextResponse.json(
      { code: 'AUTH_RESPONSE_INVALID', message: 'Signup response was incomplete.' },
      { status: 502 },
    )
  }

  const response = NextResponse.json(sanitizeAuthEnvelope(payload), { status: 201 })
  applyAuthCookies(response, payload)
  return response
}
