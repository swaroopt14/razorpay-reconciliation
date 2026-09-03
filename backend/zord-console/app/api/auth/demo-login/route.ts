import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  BackendAuthEnvelope,
  applyAuthCookies,
  buildForwardHeaders,
  parseJSONSafe,
  sanitizeAuthEnvelope,
} from '@/services/auth/server'
import { notifyLoginSlack } from '@/services/support/supportSlack.server'

export const dynamic = 'force-dynamic'

const SMOKE_FALLBACK = 'http://localhost:8099'

/**
 * Local sandbox demo session - no real credentials required.
 * Tries configured EDGE URL, then smoke simulator on :8099.
 */
export async function POST(request: NextRequest) {
  if (process.env.ZORD_DEMO_LOGIN_ENABLED !== '1') {
    return NextResponse.json(
      {
        code: 'DEMO_LOGIN_DISABLED',
        message: 'Open demo login is off. Sign in with an allowed email and password.',
      },
      { status: 403 },
    )
  }

  const body = {
    workspace_id: '',
    email: 'reviewer@yc.demo',
    password: 'demo',
    login_surface: 'customer',
  }

  const bases = Array.from(
    new Set(
      [BACKEND_SERVICES.EDGE.BASE_URL, process.env.ZORD_EDGE_URL, SMOKE_FALLBACK]
        .map((b) => (typeof b === 'string' ? b.trim().replace(/\/$/, '') : ''))
        .filter(Boolean),
    ),
  )

  let lastError = 'Authentication service is unavailable right now.'

  for (const base of bases) {
    const url = `${base}${BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_LOGIN}`
    try {
      const edgeResponse = await fetch(url, {
        method: 'POST',
        headers: buildForwardHeaders(request),
        cache: 'no-store',
        body: JSON.stringify(body),
      })
      if (!edgeResponse.ok) {
        lastError = `Auth login failed (${edgeResponse.status}) at ${base}`
        continue
      }
      const payload = await parseJSONSafe<BackendAuthEnvelope>(edgeResponse)
      if (!payload?.access_token || !payload.refresh_token) {
        lastError = `Auth response incomplete from ${base}`
        continue
      }
      // Prefer demo reviewer labels when smoke returns ops reviewer.
      if (payload.user) {
        payload.user = {
          ...payload.user,
          email: 'reviewer@yc.demo',
          name: 'Reviewer',
          tenant_name: payload.user.tenant_name || 'Acme Payments',
        }
      }
      const response = NextResponse.json({
        ...sanitizeAuthEnvelope(payload),
        demo: true,
        auth_base: base,
      })
      applyAuthCookies(response, payload)
      notifyLoginSlack({
        kind: 'login',
        email: payload.user?.email || 'reviewer@yc.demo',
        name: payload.user?.name,
        tenantId: payload.user?.tenant_id,
        tenantName: payload.user?.tenant_name,
        surface: 'demo',
        demo: true,
      })
      return response
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
    }
  }

  return NextResponse.json(
    {
      code: 'AUTH_SERVICE_UNAVAILABLE',
      message: `${lastError}. Start smoke: cd payout-smoke-simulator && docker compose up -d`,
    },
    { status: 503 },
  )
}
