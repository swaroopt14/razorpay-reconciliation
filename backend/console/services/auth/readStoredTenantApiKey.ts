/** One-time signup / workspace secret persisted per tenant (browser only). */
export function readStoredTenantApiKey(tenantId: string): string {
  const tid = tenantId.trim()
  if (!tid || typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(`zord_tenant_api_key:${tid}`)?.trim() ?? ''
  } catch {
    return ''
  }
}
