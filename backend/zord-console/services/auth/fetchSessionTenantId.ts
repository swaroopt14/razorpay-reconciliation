'use client'

import {
  installSessionTenantFetchPatch,
  readTabSessionTenantId,
  sessionTenantHeaders,
  writeTabSessionTenantId,
} from '@/services/auth/tenantSessionBrowser'
import { SESSION_TENANT_QUERY } from '@/services/auth/tenantSessionConstants'

export type SessionTenantSource = 'auth_me' | 'sandbox_workspace_keys' | 'none'

export type SessionTenantMode = 'live' | 'sandbox'

export type SessionTenantFetchResult = {
  tenantId: string
  ok: boolean
  message: string
  source: SessionTenantSource
}

function clearPersistedTenantId() {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem('zord_tenant_id')
  } catch {
    /* ignore */
  }
}

function parseAuthMeTenant(data: unknown): string {
  const payload = data as
    | { session?: { tenant_id?: string }; user?: { tenant_id?: string } }
    | null
  return (
    payload?.session?.tenant_id?.trim() ||
    payload?.user?.tenant_id?.trim() ||
    (payload?.user as { tenantId?: string } | undefined)?.tenantId?.trim() ||
    ''
  )
}

async function tenantFromSandboxWorkspaceKeys(): Promise<string> {
  try {
    const res = await fetch('/api/sandbox/workspace-api-keys', {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return ''
    const body = (await res.json().catch(() => null)) as { tenant_id?: string } | null
    return body?.tenant_id?.trim() || ''
  } catch {
    return ''
  }
}

/**
 * CON-P0-09 — Live tenant identity comes only from the verified session (`/api/auth/me`).
 *
 * - Live: no `NEXT_PUBLIC_ZORD_TENANT_ID`, no localStorage, no workspace-keys, no batch inference.
 * - Sandbox: after session, may use sandbox workspace-api-keys only (explicitly sandbox-scoped).
 * - Never infer tenant from an intelligence batch result.
 *
 * BFF `/api/prod/*` routes still bind tenant from session cookies independently.
 */
export async function fetchSessionTenantId(options?: {
  mode?: SessionTenantMode
}): Promise<SessionTenantFetchResult> {
  const mode: SessionTenantMode = options?.mode === 'sandbox' ? 'sandbox' : 'live'
  installSessionTenantFetchPatch()
  const tabTenant = readTabSessionTenantId()
  const mePath = tabTenant
    ? `/api/auth/me?${SESSION_TENANT_QUERY}=${encodeURIComponent(tabTenant)}`
    : '/api/auth/me'

  try {
    const res = await fetch(mePath, {
      credentials: 'include',
      cache: 'no-store',
      headers: sessionTenantHeaders(tabTenant),
    })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const tid = parseAuthMeTenant(data)
      if (tid) {
        writeTabSessionTenantId(tid)
        return {
          tenantId: tid,
          ok: true,
          message: 'Tenant loaded from your verified session.',
          source: 'auth_me',
        }
      }
      clearPersistedTenantId()
      if (mode === 'sandbox') {
        const sandboxTid = await tenantFromSandboxWorkspaceKeys()
        if (sandboxTid) {
          return {
            tenantId: sandboxTid,
            ok: true,
            message: 'Sandbox tenant loaded from workspace credentials.',
            source: 'sandbox_workspace_keys',
          }
        }
      }
      return {
        tenantId: '',
        ok: false,
        message:
          'Signed in, but tenant_id was not found on the session. Sign in again with a tenant workspace.',
        source: 'none',
      }
    }

    if (res.status === 401) {
      clearPersistedTenantId()
      if (mode === 'sandbox') {
        const sandboxTid = await tenantFromSandboxWorkspaceKeys()
        if (sandboxTid) {
          return {
            tenantId: sandboxTid,
            ok: true,
            message: 'Sandbox tenant loaded from workspace credentials.',
            source: 'sandbox_workspace_keys',
          }
        }
      }
      return {
        tenantId: '',
        ok: false,
        message:
          mode === 'live'
            ? 'Not signed in. Live workspace requires a verified session — no env, storage, or batch fallback.'
            : 'Not signed in. Sign in to sandbox to load a workspace tenant.',
        source: 'none',
      }
    }
  } catch {
    if (mode === 'live') {
      clearPersistedTenantId()
      return {
        tenantId: '',
        ok: false,
        message: 'Could not reach /api/auth/me. Live workspace is unavailable until session resolves.',
        source: 'none',
      }
    }
  }

  if (mode === 'sandbox') {
    const sandboxTid = await tenantFromSandboxWorkspaceKeys()
    if (sandboxTid) {
      return {
        tenantId: sandboxTid,
        ok: true,
        message: 'Sandbox tenant loaded from workspace credentials.',
        source: 'sandbox_workspace_keys',
      }
    }
  }

  clearPersistedTenantId()
  return {
    tenantId: '',
    ok: false,
    message:
      mode === 'live'
        ? 'No live tenant. Sign in so /api/auth/me can provide the workspace id.'
        : 'No sandbox tenant found. Sign in to a sandbox workspace.',
    source: 'none',
  }
}
