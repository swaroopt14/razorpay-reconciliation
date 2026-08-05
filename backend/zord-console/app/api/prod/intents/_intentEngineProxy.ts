import { NextRequest, NextResponse } from 'next/server'
import type { BackendAuthEnvelope } from '@/services/auth/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  resolveProxyForwardAuthorization,
  TENANT_MISMATCH_BODY,
} from '@/services/auth/resolvePayoutTenant.server'

export type IntentEngineProxyGate =
  | {
      ok: true
      tenantId: string
      authorization: string
      refreshedPayload?: BackendAuthEnvelope
    }
  | { ok: false; response: NextResponse }

/** Session tenant + Bearer JWT for zord-intent-engine upstream (header-scoped). */
export async function requireIntentEngineProxyGate(request: NextRequest): Promise<IntentEngineProxyGate> {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate

  const queryTenant = request.nextUrl.searchParams.get('tenant_id')?.trim()
  if (queryTenant && queryTenant !== gate.tenantId) {
    const res = NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return { ok: false, response: res }
  }

  const auth = await resolveProxyForwardAuthorization(request, undefined)
  if (!auth.ok) return { ok: false, response: auth.response }

  return {
    ok: true,
    tenantId: gate.tenantId,
    authorization: auth.authorization,
    refreshedPayload: auth.refreshedPayload ?? gate.refreshedPayload,
  }
}

/** Headers expected by zord-intent-engine journal routes (tenant + batch in headers). */
export function intentEngineForwardHeaders(
  tenantId: string,
  authorization: string,
  batchId?: string,
): HeadersInit {
  return {
    'content-type': 'application/json',
    Authorization: authorization,
    'X-Tenant-ID': tenantId,
    'x-tenant-id': tenantId,
    'tenant-id': tenantId,
    tenant_id: tenantId,
    ...(batchId ? { batch_id: batchId } : {}),
  }
}
