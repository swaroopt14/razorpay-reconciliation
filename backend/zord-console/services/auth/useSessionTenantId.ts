'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchSessionTenantId,
  type SessionTenantFetchResult,
  type SessionTenantMode,
} from './fetchSessionTenantId'

const TENANT_UPDATED_EVENT = 'zord-tenant-updated'

function broadcastTenantId(tenantId: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TENANT_UPDATED_EVENT, { detail: { tenantId } }))
}

/** Route-derived mode: sandbox paths may use sandbox-only tenant helpers. */
function clientTenantMode(): SessionTenantMode {
  if (typeof window === 'undefined') return 'live'
  return window.location.pathname.startsWith('/sandbox') ? 'sandbox' : 'live'
}

/**
 * Tenant id for UI / Ask Zord scope — CON-P0-09.
 * Live: verified `/api/auth/me` session only (never env / localStorage / batch inference).
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
  /** Re-run verified session resolution (sandbox may also try workspace keys). */
  refreshTenant: () => Promise<SessionTenantFetchResult>
}

/** Session tenant + settled flag after `/api/auth/me` (no live fallbacks). */
export function useSessionTenant(): UseSessionTenantResult {
  const [tenantId, setTenantId] = useState('')
  const [tenantReady, setTenantReady] = useState(false)
  const [tenantStatus, setTenantStatus] = useState('')
  const [tenantFetching, setTenantFetching] = useState(false)

  const refreshTenant = useCallback(async () => {
    setTenantFetching(true)
    try {
      const result = await fetchSessionTenantId({ mode: clientTenantMode() })
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
      const result = await fetchSessionTenantId({ mode: clientTenantMode() })
      if (cancelled) return
      setTenantId(result.tenantId)
      setTenantStatus(result.message)
      setTenantReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { tenantId, tenantReady, tenantStatus, tenantFetching, refreshTenant }
}
