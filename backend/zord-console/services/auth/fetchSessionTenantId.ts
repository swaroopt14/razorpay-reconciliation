'use client'

import { getIntelligenceBatchDetail, getIntelligenceBatches, getPatternsKpis } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'

export type SessionTenantSource = 'env' | 'auth_me' | 'workspace_keys' | 'local_storage' | 'intelligence_batch' | 'none'

export type SessionTenantFetchResult = {
  tenantId: string
  ok: boolean
  message: string
  source: SessionTenantSource
}

function readEnvTenant(): string {
  if (typeof process === 'undefined') return ''
  return process.env.NEXT_PUBLIC_ZORD_TENANT_ID?.trim() || ''
}

function persistTenantId(tid: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem('zord_tenant_id', tid)
  } catch {
    /* ignore */
  }
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

async function tenantFromIntelligenceBatch(batchId: string): Promise<string> {
  const bid = batchId.trim()
  if (!bid) return ''

  const detail = await getIntelligenceBatchDetail(bid)
  if (detail?.tenant_id?.trim()) return detail.tenant_id.trim()

  const patterns = await getPatternsKpis(bid)
  if (isDataAvailable(patterns) && patterns.tenant_id?.trim()) return patterns.tenant_id.trim()

  const list = await getIntelligenceBatches({ limit: 50 })
  const row = list?.batches?.find((b) => b.batch_id === bid)
  if (row?.tenant_id?.trim()) return row.tenant_id.trim()
  if (list?.tenant_id?.trim()) return list.tenant_id.trim()

  return ''
}

/**
 * Resolve tenant id for display and localStorage — BFF routes still use session cookies.
 * Order: env → /api/auth/me → /api/sandbox/workspace-api-keys → localStorage → intelligence (optional batchId).
 */
export async function fetchSessionTenantId(options?: {
  batchId?: string
}): Promise<SessionTenantFetchResult> {
  const env = readEnvTenant()
  if (env) {
    persistTenantId(env)
    return { tenantId: env, ok: true, message: 'Tenant from NEXT_PUBLIC_ZORD_TENANT_ID.', source: 'env' }
  }

  try {
    const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const tid = parseAuthMeTenant(data)
      if (tid) {
        persistTenantId(tid)
        return { tenantId: tid, ok: true, message: 'Tenant loaded from your session.', source: 'auth_me' }
      }
      return {
        tenantId: '',
        ok: false,
        message: 'Signed in, but tenant_id was not found. Enter a Batch-Id and click Fetch tenant id, or sign in with a tenant workspace.',
        source: 'none',
      }
    }
    if (res.status === 401) {
      clearPersistedTenantId()
      return {
        tenantId: '',
        ok: false,
        message: 'Not signed in (401). Your saved tenant was cleared so Ask Zord does not use stale workspace data. Sign in, then try again.',
        source: 'none',
      }
    }
  } catch {
    /* try fallbacks */
  }

  try {
    const res = await fetch('/api/sandbox/workspace-api-keys', { credentials: 'include', cache: 'no-store' })
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { tenant_id?: string } | null
      const tid = body?.tenant_id?.trim() || ''
      if (tid) {
        persistTenantId(tid)
        return {
          tenantId: tid,
          ok: true,
          message: 'Tenant loaded from workspace credentials.',
          source: 'workspace_keys',
        }
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const ls = typeof window !== 'undefined' ? window.localStorage.getItem('zord_tenant_id') : null
    if (ls?.trim()) {
      return { tenantId: ls.trim(), ok: true, message: 'Tenant restored from browser storage.', source: 'local_storage' }
    }
  } catch {
    /* ignore */
  }

  const batchId = options?.batchId?.trim()
  if (batchId) {
    try {
      const tid = await tenantFromIntelligenceBatch(batchId)
      if (tid) {
        persistTenantId(tid)
        return {
          tenantId: tid,
          ok: true,
          message: `Tenant resolved from intelligence for batch ${batchId}.`,
          source: 'intelligence_batch',
        }
      }
    } catch {
      /* ignore */
    }
    return {
      tenantId: '',
      ok: false,
      message: `Could not resolve tenant for batch ${batchId}. Check session sign-in and that intelligence has this batch.`,
      source: 'none',
    }
  }

  return {
    tenantId: '',
    ok: false,
    message: 'No tenant found. Sign in, set Batch-Id, then click Fetch tenant id.',
    source: 'none',
  }
}
