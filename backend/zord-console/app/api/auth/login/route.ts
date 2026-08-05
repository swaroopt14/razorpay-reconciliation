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

  let edgeResponse: Response
  try {
    edgeResponse = await fetch(edgeAuthUrl(BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_LOGIN), {
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
  return response
}
