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

  test('POST /api/prompt-layer/query responds without hard failure', async ({ request, baseURL }) => {
    const origin = baseURL ? new URL(baseURL).origin : 'http://127.0.0.1:3000'
    const res = await request.post('/api/prompt-layer/query', {
      // CON-P1-01: cookie mutations require same-origin Origin (anonymous still fails auth later).
      headers: { Origin: origin },
      data: { query: 'smoke test', tenant_id: 'smoke-tenant', top_k: 1 },
    })
    // 502 when prompt-layer service is not running locally — still not a console crash
    expect(res.status()).toBeLessThan(503)
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
})
