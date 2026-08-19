/**
 * Multi-tenant tab session contract tests
 * Run: npx tsx --tsconfig tsconfig.json services/auth/tenantSession.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACTIVE_TENANT_COOKIE_NAME,
  sanitizeTenantCookieKey,
  SESSION_TENANT_HEADER,
  SESSION_TENANT_QUERY,
  SESSION_TENANTS_COOKIE_NAME,
} from './tenantSessionConstants'
import { scopedAccessCookieName, scopedRefreshCookieName } from './server'

const tid = '11111111-2222-3333-4444-555555555555'
assert.equal(sanitizeTenantCookieKey(tid), tid)
assert.equal(scopedAccessCookieName(tid), `zord_access_token__${tid}`)
assert.equal(scopedRefreshCookieName(tid), `zord_refresh_token__${tid}`)
assert.equal(SESSION_TENANT_HEADER, 'x-zord-session-tenant')
assert.equal(SESSION_TENANT_QUERY, 'tenant')
assert.equal(ACTIVE_TENANT_COOKIE_NAME, 'zord_active_tenant')
assert.equal(SESSION_TENANTS_COOKIE_NAME, 'zord_session_tenants')

{
  const serverSrc = readFileSync(join(__dirname, 'server.ts'), 'utf8')
  assert.match(serverSrc, /scopedAccessCookieName/, 'must write tenant-scoped access cookies')
  assert.match(serverSrc, /getAccessTokenFromRequest/, 'must resolve token by requested tenant')
  assert.match(serverSrc, /SESSION_TENANT_HEADER/, 'must honor session tenant header')
}

{
  const meSrc = readFileSync(join(__dirname, '../../app/api/auth/me/route.ts'), 'utf8')
  assert.match(meSrc, /getAccessTokenFromRequest/, 'me route must use tenant-scoped tokens')
}

console.log('tenantSession.contract.test.ts: OK')
