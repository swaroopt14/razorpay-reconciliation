/**
 * Multi-tenant tab sessions — shared client/server constants.
 * Each browser tab binds to a tenant via sessionStorage + X-Zord-Session-Tenant;
 * HttpOnly tokens are stored per-tenant so reload of tab B does not become tenant A.
 */

export const SESSION_TENANT_HEADER = 'x-zord-session-tenant'
export const SESSION_TENANT_QUERY = 'tenant'
/** Tab-local (survives reload within the same tab; not shared across tabs). */
export const TAB_TENANT_STORAGE_KEY = 'zord_tab_tenant'
export const ACTIVE_TENANT_COOKIE_NAME = 'zord_active_tenant'
export const SESSION_TENANTS_COOKIE_NAME = 'zord_session_tenants'

export function sanitizeTenantCookieKey(tenantId: string): string {
  return tenantId.trim().replace(/[^a-zA-Z0-9-]/g, '')
}
