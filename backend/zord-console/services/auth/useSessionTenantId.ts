'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchSessionTenantId, type SessionTenantFetchResult } from './fetchSessionTenantId'

const TENANT_UPDATED_EVENT = 'zord-tenant-updated'

function broadcastTenantId(tenantId: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TENANT_UPDATED_EVENT, { detail: { tenantId } }))
}

function readEnvTenant(): string {
  if (typeof process === 'undefined') return ''
  return process.env.NEXT_PUBLIC_ZORD_TENANT_ID?.trim() || ''
}

/**
 * Tenant id for `/api/prod/*` reads — no mock fallback.
 * Resolution: `NEXT_PUBLIC_ZORD_TENANT_ID` → `/api/auth/me` session → `localStorage.zord_tenant_id`.
 * Returns empty string until a real tenant is resolved (sign in or set env).
 */
export function useSessionTenantId(): string {
  const { tenantId } = useSessionTenant()
  return tenantId
}

export type UseSessionTenantResult = {
  tenantId: string
  /** True after the first auth/me resolution attempt finishes. */
  tenantReady: boolean
  /** Last manual or automatic fetch status message. */
  tenantStatus: string
  tenantFetching: boolean
  /** Re-run auth/me (+ optional intelligence batch lookup). */
  refreshTenant: (options?: { batchId?: string }) => Promise<SessionTenantFetchResult>
}

/** Session tenant + settled flag after `/api/auth/me` (no mock fallback). */
export function useSessionTenant(): UseSessionTenantResult {
  const envTenant = readEnvTenant()
  const [tenantId, setTenantId] = useState(() => envTenant)
  const [tenantReady, setTenantReady] = useState(false)
  const [tenantStatus, setTenantStatus] = useState('')
  const [tenantFetching, setTenantFetching] = useState(false)

  const refreshTenant = useCallback(async (options?: { batchId?: string }) => {
    setTenantFetching(true)
    try {
      const result = await fetchSessionTenantId(options)
      setTenantId(result.tenantId)
      setTenantStatus(result.message)
      setTenantReady(true)
      if (result.tenantId) broadcastTenantId(result.tenantId)
      return result
    } finally {
      setTenantFetching(false)
    }
  }, [])

  useEffect(() => {
    const onTenantUpdated = (event: Event) => {
      const tid = (event as CustomEvent<{ tenantId?: string }>).detail?.tenantId?.trim() ?? ''
      if (tid) setTenantId(tid)
    }
    window.addEventListener(TENANT_UPDATED_EVENT, onTenantUpdated)
    return () => window.removeEventListener(TENANT_UPDATED_EVENT, onTenantUpdated)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchSessionTenantId()
      if (cancelled) return
      setTenantId(result.tenantId)
      setTenantStatus(result.message)
      setTenantReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [envTenant])

  return { tenantId, tenantReady, tenantStatus, tenantFetching, refreshTenant }
}
