import { test, expect } from '@playwright/test'

/**
 * Smoke: public health + prod BFF routes return JSON (may 401 without session).
 * Run: npm run test:e2e -- e2e/console-api-smoke.spec.ts
 */
const BFF_PATHS = [
  '/api/health',
  '/api/prod/intelligence/leakage',
  '/api/prod/intelligence/ambiguity',
  '/api/prod/intelligence/timeseries/leakage?granularity=day',
  '/api/prod/ambiguity/velocity?days=7',
  '/api/prod/intelligence/patterns',
  '/api/prod/intelligence/recommendations',
  '/api/prod/intelligence/defensibility',
  '/api/prod/intelligence/batches?limit=1',
  '/api/prod/evidence/packs?page=1&page_size=1',
  '/api/prod/intents/batches?page=1&page_size=1',
  '/api/prod/intents/payment-intents?batch_id=batch-2026-06-12-payroll',
  '/api/prod/settlement/observations/batches?page=1&page_size=1',
  '/api/prod/ingest-status',
  '/api/prod/dlq',
  '/api/prod/intents?page=1&page_size=1',
  '/api/prod/systems/sync-status',
]

test.describe('console BFF smoke', () => {
  for (const path of BFF_PATHS) {
    test(`GET ${path} responds`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBeLessThan(500)
      const ct = res.headers()['content-type'] || ''
      if (ct.includes('json')) {
        const body = await res.json()
        expect(body).toBeTruthy()
      }
    })
  }

  // CON-P0-04 + CON-P1-01: forged identity headers must not authorize; session required.
  test('POST /api/prompt-layer/query rejects anonymous callers (CON-P0-04)', async ({
    request,
    baseURL,
  }) => {
    const origin = baseURL ? new URL(baseURL).origin : 'http://127.0.0.1:3000'
    const res = await request.post('/api/prompt-layer/query', {
      data: { query: 'smoke test', tenant_id: 'forged-tenant', top_k: 1 },
      headers: {
        Origin: origin,
        'x-tenant-id': '00000000-0000-4000-8000-000000000099',
        'x-user-id': 'forged-user',
        'x-session-id': 'forged-session',
      },
    })
    // Same-origin passes CSRF gate without cookies; no session ⇒ 401 (not 200/502).
    expect(res.status()).toBe(401)
  })

  // CON-P1-01: prompt-layer mutations reject cross-site Origin.
  test('POST /api/prompt-layer/query rejects cross-site Origin', async ({ request }) => {
    const res = await request.post('/api/prompt-layer/query', {
      headers: {
        Origin: 'https://evil.example',
        Cookie: 'zord_access_token=e2e-access; zord_csrf_token=e2e-csrf',
        'x-csrf-token': 'e2e-csrf',
        'content-type': 'application/json',
      },
      data: { query: 'csrf', top_k: 1 },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.code).toMatch(/ORIGIN_MISMATCH|CROSS_SITE_FORBIDDEN/)
  })

  // CON-P0-05: generic intelligence catch-all must not proxy; always 404.
  test('GET /api/intelligence/* is removed (404, no tunnel)', async ({ request }) => {
    const res = await request.get('/api/intelligence/leakage', {
      headers: {
        authorization: 'Bearer forged-token',
        'x-tenant-id': 'forged-tenant',
      },
    })
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  // CON-P1-01: cross-site cookie mutations must be rejected.
  test('POST /api/support/tickets rejects cross-site Origin', async ({ request }) => {
    const res = await request.post('/api/support/tickets', {
      headers: {
        Origin: 'https://evil.example',
        Cookie: 'zord_access_token=e2e-access; zord_csrf_token=e2e-csrf',
        'x-csrf-token': 'e2e-csrf',
        'content-type': 'application/json',
      },
      data: { category: 'billing', topic: 'csrf', description: 'cross-site should fail' },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.code).toMatch(/ORIGIN_MISMATCH|CROSS_SITE_FORBIDDEN/)
  })

  test('POST /api/support/tickets same-origin + CSRF passes origin gate', async ({ request, baseURL }) => {
    const origin = baseURL ? new URL(baseURL).origin : 'http://127.0.0.1:3000'
    const res = await request.post('/api/support/tickets', {
      headers: {
        Origin: origin,
        Cookie: 'zord_access_token=e2e-access; zord_csrf_token=e2e-csrf',
        'x-csrf-token': 'e2e-csrf',
        'content-type': 'application/json',
      },
      data: { category: 'billing', topic: 'csrf', description: 'same-origin reaches auth' },
    })
    // CSRF/same-origin ok → session auth fails with fake cookie (not 403 CSRF).
    expect(res.status()).not.toBe(403)
    expect([401, 502]).toContain(res.status())
  })

  // CON-P1-02: baseline browser security headers on live HTML.
  test('GET /signin includes CSP and baseline security headers', async ({ request }) => {
    const res = await request.get('/signin')
    expect(res.status()).toBeLessThan(500)
    const headers = res.headers()
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['x-frame-options']).toBe('DENY')
    const csp = headers['content-security-policy'] || ''
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("default-src 'self'")
    expect(headers['permissions-policy'] || '').toContain('camera=()')
  })
})
