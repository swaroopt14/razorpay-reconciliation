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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.text()
  const result = await authorizedEdgeFetch(
    request,
    BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_ADMIN_USER_STATUS(params.id),
    {
      method: 'PATCH',
      body,
    },
  )

  if (result.errorResponse || !result.edgeResponse) {
    return result.errorResponse ?? NextResponse.json({ code: 'AUTH_REQUEST_FAILED', message: 'Unable to update user.' }, { status: 500 })
  }

  if (!result.edgeResponse.ok) {
    const errorBody = await parseJSONSafe<BackendErrorEnvelope>(result.edgeResponse)
    return NextResponse.json(
      {
        code: errorBody?.code ?? 'AUTH_REQUEST_FAILED',
        message: errorBody?.message ?? 'Unable to update user.',
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
