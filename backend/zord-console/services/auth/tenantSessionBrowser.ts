'use client'

import {
  SESSION_TENANT_HEADER,
  SESSION_TENANT_QUERY,
  TAB_TENANT_STORAGE_KEY,
} from './tenantSessionConstants'

/** Preferred tenant for this tab: URL ?tenant= then sessionStorage. */
export function readTabSessionTenantId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const fromUrl = new URL(window.location.href).searchParams.get(SESSION_TENANT_QUERY)?.trim() || ''
    if (fromUrl) return fromUrl
    return window.sessionStorage.getItem(TAB_TENANT_STORAGE_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export function writeTabSessionTenantId(tenantId: string) {
  if (typeof window === 'undefined') return
  const tid = tenantId.trim()
  if (!tid) return
  try {
    window.sessionStorage.setItem(TAB_TENANT_STORAGE_KEY, tid)
  } catch {
    /* ignore quota */
  }
}

export function clearTabSessionTenantId() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(TAB_TENANT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Headers so BFF picks this tab's tenant-scoped cookies. */
export function sessionTenantHeaders(tenantId?: string): Record<string, string> {
  const tid = (tenantId ?? readTabSessionTenantId()).trim()
  return tid ? { [SESSION_TENANT_HEADER]: tid } : {}
}

export function withSessionTenantQuery(path: string, tenantId: string): string {
  const tid = tenantId.trim()
  if (!tid) return path
  try {
    const url = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://local')
    url.searchParams.set(SESSION_TENANT_QUERY, tid)
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    const join = path.includes('?') ? '&' : '?'
    return `${path}${join}${SESSION_TENANT_QUERY}=${encodeURIComponent(tid)}`
  }
}

let fetchPatched = false

/**
 * Ensure every same-origin /api/* call from this tab sends X-Zord-Session-Tenant
 * so concurrent Tenant A / Tenant B tabs keep isolated sessions.
 */
export function installSessionTenantFetchPatch() {
  if (typeof window === 'undefined' || fetchPatched) return
  fetchPatched = true
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const tid = readTabSessionTenantId()
    if (!tid) return original(input, init)

    let url = ''
    if (typeof input === 'string') url = input
    else if (input instanceof URL) url = input.toString()
    else if (typeof Request !== 'undefined' && input instanceof Request) url = input.url

    const isApi =
      url.startsWith('/api/') ||
      (typeof window !== 'undefined' && url.startsWith(`${window.location.origin}/api/`))
    if (!isApi) return original(input, init)

    const headers = new Headers(init?.headers)
    if (!headers.has(SESSION_TENANT_HEADER)) {
      headers.set(SESSION_TENANT_HEADER, tid)
    }
    return original(input, { ...init, headers })
  }
}
