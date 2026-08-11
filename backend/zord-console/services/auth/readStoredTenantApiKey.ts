/**
 * CON-P0-01 — tenant API secrets must never persist in browser storage.
 *
 * Full keys are disclosed once at signup in React state only. Settings and
 * credential UIs show `secret_key_prefix` from the session BFF. Console
 * actions authenticate via HttpOnly session cookies.
 */

const TENANT_API_KEY_PREFIX = 'zord_tenant_api_key:'
const LEGACY_CX_API_KEY = 'cx_api_key'

/** @deprecated Always returns empty — secrets are not readable from storage. */
export function readStoredTenantApiKey(_tenantId: string): string {
  return ''
}

/** Remove any legacy full-secret entries left from older console builds. */
export function clearLegacyTenantApiSecrets(tenantId?: string): void {
  if (typeof window === 'undefined') return
  try {
    const tid = tenantId?.trim()
    if (tid) window.localStorage.removeItem(`${TENANT_API_KEY_PREFIX}${tid}`)
    window.localStorage.removeItem(LEGACY_CX_API_KEY)

    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(TENANT_API_KEY_PREFIX)) toRemove.push(key)
    }
    for (const key of toRemove) window.localStorage.removeItem(key)
  } catch {
    /* storage may be unavailable */
  }
}

/** Format server-provided key prefix for display (never a full secret). */
export function formatSecretKeyPrefix(prefix: string | null | undefined): string {
  const p = prefix?.trim()
  if (!p) return '—'
  return p.endsWith('…') || p.endsWith('...') ? p : `${p}…`
}
