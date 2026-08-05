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

  test('POST /api/prompt-layer/query responds without hard failure', async ({ request }) => {
    const res = await request.post('/api/prompt-layer/query', {
      data: { query: 'smoke test', tenant_id: 'smoke-tenant', top_k: 1 },
    })
    // 502 when prompt-layer service is not running locally — still not a console crash
    expect(res.status()).toBeLessThan(503)
  })
})
