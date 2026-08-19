/**
 * Server-only helpers for strict tenant isolation (payout / BFF).
 * Session tenant comes from zord-edge GET /v1/auth/me via cookies (with refresh).
 * Bearer tenant comes from GET /v1/auth/principal (JWT or tenant API key).
 *
 * CON-P0-02: Browser-facing ingest/proxy routes must never silently fall back to
 * ZORD_BULK_INGEST_API_KEY / ZORD_SETTLEMENT_API_KEY. Callers need a verified
 * session cookie JWT and/or an explicit Authorization header bound to the same tenant.
 * Server env keys are reserved for separate internal-only workloads.
 */
import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { normalizeAuthorizationHeader } from '@/services/payout-command/batch-intake/intakeHttpShared'
import {
  applyAuthCookies,
  authorizedEdgeFetch,
  getAccessTokenFromRequest,
  parseJSONSafe,
  type BackendAuthEnvelope,
} from '@/services/auth/server'

export const TENANT_MISMATCH_BODY = {
  code: 'TENANT_MISMATCH',
  message: 'API key or ingest credential does not belong to your session tenant.',
} as const

const UNAUTHORIZED_NO_CREDENTIALS = {
  code: 'UNAUTHORIZED',
  message:
    'Sign in or provide an Authorization Bearer credential. Server ingest env keys are not used for browser console routes.',
} as const

export type SessionTenantResult = {
  tenantId: string | null
  /** Session JWT for upstream Kong/service auth (cookie or post-refresh). */
  accessToken?: string
  refreshedPayload?: BackendAuthEnvelope
}

function accessTokenFromSession(
  request: NextRequest,
  refreshedPayload?: BackendAuthEnvelope,
): string | undefined {
  const fromRefresh = refreshedPayload?.access_token?.trim()
  if (fromRefresh) return fromRefresh
  return getAccessTokenFromRequest(request)?.trim() || undefined
}

/** Headers for BFF → upstream service calls (session JWT + tenant claim header). */
export function sessionUpstreamHeaders(tenantId: string, accessToken: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-tenant-id': tenantId,
    Authorization: `Bearer ${accessToken}`,
  }
}

export async function getSessionTenantIdFromRequest(request: NextRequest): Promise<SessionTenantResult> {
  const { edgeResponse, errorResponse, refreshedPayload } = await authorizedEdgeFetch(
    request,
    BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_ME,
    { method: 'GET' },
  )
  if (errorResponse) return { tenantId: null }
  if (!edgeResponse?.ok) {
    return {
      tenantId: null,
      accessToken: accessTokenFromSession(request, refreshedPayload),
      refreshedPayload,
    }
  }
  const payload = await parseJSONSafe<{
    user?: { tenant_id?: string }
    session?: { tenant_id?: string }
  }>(edgeResponse)
  const tid =
    payload?.session?.tenant_id?.trim() || payload?.user?.tenant_id?.trim() || null
  return {
    tenantId: tid,
    accessToken: accessTokenFromSession(request, refreshedPayload),
    refreshedPayload,
  }
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
 * Resolves tenant from session cookies and/or explicit Authorization only.
 * Never uses server env ingest keys (CON-P0-02).
 */
export async function resolveSettlementUploadContext(
  request: NextRequest,
): Promise<SettlementUploadContext> {
  const { tenantId: sessionTenant, refreshedPayload: sessionRefresh } =
    await getSessionTenantIdFromRequest(request)

  const authResolution = await resolveProxyForwardAuthorization(request)
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
      response: NextResponse.json(UNAUTHORIZED_NO_CREDENTIALS, { status: 401 }),
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
  | { ok: true; tenantId: string; accessToken: string; refreshedPayload?: BackendAuthEnvelope }
  | { ok: false; response: NextResponse }
> {
  const { tenantId, accessToken, refreshedPayload } = await getSessionTenantIdFromRequest(request)
  if (!tenantId?.trim() || !accessToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'Session required for this resource.' },
        { status: 401 },
      ),
    }
  }
  return {
    ok: true,
    tenantId: tenantId.trim(),
    accessToken,
    refreshedPayload,
  }
}

export type SessionIdentityResult =
  | {
      ok: true
      tenantId: string
      userId: string
      sessionId: string
      accessToken?: string
      refreshedPayload?: BackendAuthEnvelope
    }
  | { ok: false; response: NextResponse }

/**
 * CON-P0-04 — full session identity from Edge `/v1/auth/me`.
 * Used by Prompt Layer BFF so tenant/user/session are never taken from client headers.
 * Do not remove when merging error-normalization / CSRF changes into this helper's callers.
 */
export async function requireSessionIdentityForProdProxy(
  request: NextRequest,
): Promise<SessionIdentityResult> {
  const { edgeResponse, errorResponse, refreshedPayload } = await authorizedEdgeFetch(
    request,
    BACKEND_SERVICES.EDGE.ENDPOINTS.AUTH_ME,
    { method: 'GET' },
  )
  if (errorResponse) return { ok: false, response: errorResponse }
  if (!edgeResponse?.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'Session required for this resource.' },
        { status: 401 },
      ),
    }
  }

  const payload = await parseJSONSafe<{
    user?: { id?: string; tenant_id?: string }
    session?: { tenant_id?: string; session_id?: string }
  }>(edgeResponse)

  const tenantId =
    payload?.session?.tenant_id?.trim() || payload?.user?.tenant_id?.trim() || ''
  const userId = payload?.user?.id?.trim() || ''
  const sessionId = payload?.session?.session_id?.trim() || ''

  if (!tenantId || !userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'Session identity incomplete. Sign in again.' },
        { status: 401 },
      ),
    }
  }

  const accessToken =
    refreshedPayload?.access_token?.trim() || getAccessTokenFromRequest(request)?.trim() || undefined

  return {
    ok: true,
    tenantId,
    userId,
    sessionId,
    accessToken,
    refreshedPayload,
  }
}

/** Apply rotated access/refresh cookies when authorizedEdgeFetch refreshed the session. */
export function applyRefreshedSessionCookies(
  response: NextResponse,
  refreshedPayload?: BackendAuthEnvelope,
  request?: NextRequest,
): void {
  if (refreshedPayload) applyAuthCookies(response, refreshedPayload, request)
}

export type ProxyForwardAuthResolution =
  | { ok: true; authorization: string; refreshedPayload?: BackendAuthEnvelope }
  | { ok: false; response: NextResponse }

/**
 * Browser-facing proxy auth (CON-P0-02):
 * Case 1: session JWT (cookie) → forward JWT when principal matches session tenant.
 * Case 2: explicit Authorization only → forward after principal resolve.
 * Case 3: session + explicit Authorization → tenants MUST match → forward explicit.
 * Case 4: none → 401 (even if ZORD_*_API_KEY env vars are set).
 *
 * Server env ingest keys are never used here.
 */
export async function resolveProxyForwardAuthorization(
  request: NextRequest,
  /** @deprecated CON-P0-02 — ignored; env ingest keys are not used on browser routes. */
  _envFallbackKey?: string,
): Promise<ProxyForwardAuthResolution> {
  const { tenantId: sessionTenant, refreshedPayload } = await getSessionTenantIdFromRequest(request)
  const incoming = normalizeAuthorizationHeader(request.headers.get('authorization') ?? '')
  const accessCookie = getAccessTokenFromRequest(request)
  const cookieBearer = accessCookie?.trim() ? `Bearer ${accessCookie.trim()}` : null

  if (incoming) {
    const keyTid = await getTenantIdForBearerAuthorizationHeader(incoming)
    if (keyTid) {
      if (sessionTenant && keyTid !== sessionTenant) {
        return { ok: false, response: NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 }) }
      }
      return { ok: true, authorization: incoming, refreshedPayload }
    }
    // Invalid/stale client Authorization — fall through to session cookie only (not env keys).
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

  return {
    ok: false,
    response: NextResponse.json(UNAUTHORIZED_NO_CREDENTIALS, { status: 401 }),
  }
}

/**
 * Bulk ingest browser route auth — same rules as resolveProxyForwardAuthorization.
 * Does not use ZORD_BULK_INGEST_API_KEY (CON-P0-02).
 */
export async function resolveBulkIngestForwardAuthorization(
  request: NextRequest,
  /** @deprecated CON-P0-02 — ignored. */
  _envFallbackKey?: string,
): Promise<ProxyForwardAuthResolution> {
  return resolveProxyForwardAuthorization(request)
}
