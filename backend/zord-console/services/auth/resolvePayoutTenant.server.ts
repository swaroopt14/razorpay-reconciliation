/**
 * Server-only helpers for strict tenant isolation (payout / BFF).
 * Session tenant comes from zord-edge GET /v1/auth/me via cookies (with refresh).
 * Bearer tenant comes from GET /v1/auth/principal (JWT or tenant API key).
 */
import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { normalizeAuthorizationHeader } from '@/services/payout-command/batch-intake/intakeHttpShared'
import {
  ACCESS_COOKIE_NAME,
  applyAuthCookies,
  authorizedEdgeFetch,
  parseJSONSafe,
  type BackendAuthEnvelope,
} from '@/services/auth/server'

export const TENANT_MISMATCH_BODY = {
  code: 'TENANT_MISMATCH',
  message: 'API key or ingest credential does not belong to your session tenant.',
} as const

export type SessionTenantResult = {
  tenantId: string | null
  refreshedPayload?: BackendAuthEnvelope
}

export async function getSessionTenantIdFromRequest(request: NextRequest): Promise<SessionTenantResult> {
  const { edgeResponse, errorResponse, refreshedPayload } = await authorizedEdgeFetch(
    request,
    BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_ME,
    { method: 'GET' },
  )
  if (errorResponse) return { tenantId: null }
  if (!edgeResponse?.ok) return { tenantId: null, refreshedPayload }
  const payload = await parseJSONSafe<{
    user?: { tenant_id?: string }
    session?: { tenant_id?: string }
  }>(edgeResponse)
  const tid =
    payload?.session?.tenant_id?.trim() || payload?.user?.tenant_id?.trim() || null
  return { tenantId: tid, refreshedPayload }
}

/** Resolves tenant UUID string for a Bearer token (JWT or API key) via zord-edge. */
export async function getTenantIdForBearerAuthorizationHeader(authHeader: string): Promise<string | null> {
  const path = BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_PRINCIPAL
  const url = `${BACKEND_SERVICES.EDGE.BASE_URL}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: authHeader },
      cache: 'no-store',
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const payload = await parseJSONSafe<{ tenant_id?: string }>(res)
  return payload?.tenant_id?.trim() || null
}

export type SettlementUploadContext =
  | {
      ok: true
      tenantId: string
      authorization: string
      refreshedPayload?: BackendAuthEnvelope
    }
  | { ok: false; response: NextResponse }

/**
 * Settlement upload needs tenant_id on the upstream query (like Postman).
 * Resolves tenant from session cookies first, then from Bearer / env ingest key principal.
 */
export async function resolveSettlementUploadContext(
  request: NextRequest,
  envFallbackKey?: string,
): Promise<SettlementUploadContext> {
  const { tenantId: sessionTenant, refreshedPayload: sessionRefresh } =
    await getSessionTenantIdFromRequest(request)

  const authResolution = await resolveProxyForwardAuthorization(request, envFallbackKey)
  if (!authResolution.ok) return { ok: false, response: authResolution.response }

  const bearerTenant = await getTenantIdForBearerAuthorizationHeader(authResolution.authorization)
  const sessionTid = sessionTenant?.trim() ?? ''
  const bearerTid = bearerTenant?.trim() ?? ''

  if (sessionTid && bearerTid && sessionTid !== bearerTid) {
    return { ok: false, response: NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 }) }
  }

  const tenantId = sessionTid || bearerTid
  if (!tenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          code: 'UNAUTHORIZED',
          message:
            'Could not resolve tenant_id. Sign in with a session tenant, send Authorization Bearer (same as Postman), or set ZORD_SETTLEMENT_API_KEY / ZORD_BULK_INGEST_API_KEY in the console env.',
        },
        { status: 401 },
      ),
    }
  }

  return {
    ok: true,
    tenantId,
    authorization: authResolution.authorization,
    refreshedPayload: authResolution.refreshedPayload ?? sessionRefresh,
  }
}

export async function requireSessionTenantForProdProxy(
  request: NextRequest,
): Promise<
  | { ok: true; tenantId: string; refreshedPayload?: BackendAuthEnvelope }
  | { ok: false; response: NextResponse }
> {
  const { tenantId, refreshedPayload } = await getSessionTenantIdFromRequest(request)
  if (!tenantId?.trim()) {
    return {
      ok: false,
      response: NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'Session required for this resource.' },
        { status: 401 },
      ),
    }
  }
  return { ok: true, tenantId: tenantId.trim(), refreshedPayload }
}

/** Apply rotated access/refresh cookies when authorizedEdgeFetch refreshed the session. */
export function applyRefreshedSessionCookies(
  response: NextResponse,
  refreshedPayload?: BackendAuthEnvelope,
): void {
  if (refreshedPayload) applyAuthCookies(response, refreshedPayload)
}

export type ProxyForwardAuthResolution =
  | { ok: true; authorization: string; refreshedPayload?: BackendAuthEnvelope }
  | { ok: false; response: NextResponse }

/**
 * Case 1: session JWT only → forward JWT.
 * Case 2: API key only (no session) → forward key.
 * Case 3: session + explicit Authorization → tenants MUST match → forward explicit.
 * Case 4: none → 401.
 * When session exists and a server env fallback key is used, its tenant must match session.
 */
/**
 * Bulk ingest should mirror Postman: when ZORD_BULK_INGEST_API_KEY is configured and
 * belongs to the signed-in session tenant, forward that API key instead of the session JWT.
 */
export async function resolveBulkIngestForwardAuthorization(
  request: NextRequest,
  envFallbackKey: string | undefined,
): Promise<ProxyForwardAuthResolution> {
  const { tenantId: sessionTenant, refreshedPayload } = await getSessionTenantIdFromRequest(request)
  const envBearer = normalizeAuthorizationHeader(envFallbackKey ?? '')
  const sessionTid = sessionTenant?.trim() ?? ''

  if (envBearer && sessionTid) {
    const envTid = await getTenantIdForBearerAuthorizationHeader(envBearer)
    if (envTid && envTid === sessionTid) {
      return { ok: true, authorization: envBearer, refreshedPayload }
    }
  }

  return resolveProxyForwardAuthorization(request, envFallbackKey)
}

export async function resolveProxyForwardAuthorization(
  request: NextRequest,
  envFallbackKey: string | undefined,
): Promise<ProxyForwardAuthResolution> {
  const { tenantId: sessionTenant, refreshedPayload } = await getSessionTenantIdFromRequest(request)
  const incoming = normalizeAuthorizationHeader(request.headers.get('authorization') ?? '')
  const envBearer = normalizeAuthorizationHeader(envFallbackKey ?? '')
  const accessCookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value
  const cookieBearer = accessCookie?.trim() ? `Bearer ${accessCookie.trim()}` : null

  if (incoming) {
    const keyTid = await getTenantIdForBearerAuthorizationHeader(incoming)
    if (keyTid) {
      if (sessionTenant && keyTid !== sessionTenant) {
        return { ok: false, response: NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 }) }
      }
      return { ok: true, authorization: incoming, refreshedPayload }
    }
    // Stale/wrong client Authorization — fall through to session cookie or server env key.
  }

  if (cookieBearer) {
    if (sessionTenant) {
      const jwtTid = await getTenantIdForBearerAuthorizationHeader(cookieBearer)
      if (!jwtTid || jwtTid !== sessionTenant) {
        return {
          ok: false,
          response: NextResponse.json(
            jwtTid ? TENANT_MISMATCH_BODY : { code: 'UNAUTHORIZED', message: 'Invalid session token.' },
            { status: jwtTid ? 403 : 401 },
          ),
        }
      }
    }
    return { ok: true, authorization: cookieBearer, refreshedPayload }
  }

  if (envBearer) {
    const envTid = await getTenantIdForBearerAuthorizationHeader(envBearer)
    if (!envTid) {
      return {
        ok: false,
        response: NextResponse.json(
          { code: 'UNAUTHORIZED', message: 'Server ingest key is misconfigured or invalid.' },
          { status: 401 },
        ),
      }
    }
    if (sessionTenant && envTid !== sessionTenant) {
      return { ok: false, response: NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 }) }
    }
    return { ok: true, authorization: envBearer, refreshedPayload }
  }

  return {
    ok: false,
    response: NextResponse.json(
      { code: 'UNAUTHORIZED', message: 'Sign in or provide Authorization / server ingest key.' },
      { status: 401 },
    ),
  }
}
