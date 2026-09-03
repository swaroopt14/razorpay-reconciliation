import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  BackendErrorEnvelope,
  BackendAuthEnvelope,
  applyAuthCookies,
  authorizedEdgeFetch,
  parseJSONSafe,
} from '@/services/auth/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const result = await authorizedEdgeFetch(request, BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_ADMIN_USERS)
  if (result.errorResponse || !result.edgeResponse) {
    return result.errorResponse ?? NextResponse.json({ code: 'AUTH_REQUEST_FAILED', message: 'Unable to load users.' }, { status: 500 })
  }

  if (!result.edgeResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(result.edgeResponse)
    return NextResponse.json(
      {
        code: errorBody?.code ?? 'AUTH_REQUEST_FAILED',
        message: errorBody?.message ?? 'Unable to load users.',
      },
      { status: result.edgeResponse.status },
    )
  }

  const payload = await parseJSONSafe(result.edgeResponse)
  const response = NextResponse.json(payload)
  if (result.refreshedPayload) {
    applyAuthCookies(response, result.refreshedPayload as BackendAuthEnvelope)
  }
  return response
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const result = await authorizedEdgeFetch(request, BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_ADMIN_USERS, {
    method: 'POST',
    body,
  })

  if (result.errorResponse || !result.edgeResponse) {
    return result.errorResponse ?? NextResponse.json({ code: 'AUTH_REQUEST_FAILED', message: 'Unable to create user.' }, { status: 500 })
  }

  if (!result.edgeResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(result.edgeResponse)
    return NextResponse.json(
      {
        code: errorBody?.code ?? 'AUTH_REQUEST_FAILED',
        message: errorBody?.message ?? 'Unable to create user.',
      },
      { status: result.edgeResponse.status },
    )
  }

  const payload = await parseJSONSafe(result.edgeResponse)
  const response = NextResponse.json(payload, { status: 201 })
  if (result.refreshedPayload) {
    applyAuthCookies(response, result.refreshedPayload as BackendAuthEnvelope)
  }
  return response
}
