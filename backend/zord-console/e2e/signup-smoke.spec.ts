import { test, expect } from '@playwright/test'

/**
 * Live signup smoke — creates a real tenant + admin via zord-edge (not mocked).
 *
 * Prerequisites:
 *   1. `npm run dev` in zord-console (port 3000)
 *   2. zord-edge up: `cd backend/zord-edge && docker compose up -d`
 *
 * Run:
 *   npm run test:e2e -- e2e/signup-smoke.spec.ts
 *
 * Optional env:
 *   SMOKE_SIGNUP_EMAIL=you@gmail.com   — fixed email (fails if already registered)
 *   ZORD_EDGE_URL=http://localhost:8080
 */
const EDGE_URL = process.env.ZORD_EDGE_URL || 'http://localhost:8080'
const SIGNUP_PASSWORD = process.env.SMOKE_SIGNUP_PASSWORD || 'SmokeTest@1234'

let edgeHealthy = false

test.describe('signup smoke (live zord-edge)', () => {
  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${EDGE_URL}/v1/health`, { timeout: 5_000 })
      edgeHealthy = res.ok()
    } catch {
      edgeHealthy = false
    }
  })

  test('creates workspace through /signup UI and lands in sandbox', async ({ page }) => {
    test.skip(!edgeHealthy, `zord-edge not reachable at ${EDGE_URL} — run: cd backend/zord-edge && docker compose up -d`)

    const stamp = Date.now()
    const email =
      process.env.SMOKE_SIGNUP_EMAIL?.trim().toLowerCase() ||
      `smoke-signup-${stamp}@e2e.zord.local`
    const tenantName = process.env.SMOKE_SIGNUP_TENANT || `Smoke Workspace ${stamp}`

    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: 'Get started with your workspace' })).toBeVisible()

    await page.getByPlaceholder('e.g. Acme Payments').fill(tenantName)
    await page.getByPlaceholder('e.g. Alex Patel').fill('Smoke Test User')
    await page.getByPlaceholder('Enter your email').fill(email)
    await page.getByPlaceholder('At least 8 characters').fill(SIGNUP_PASSWORD)

    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Save your tenant API key' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Workspace ready')).toBeVisible()
    await expect(page.locator('code.text-emerald-300')).toBeVisible()

    await page.getByRole('button', { name: 'Continue to sandbox' }).click()
    await expect(page).toHaveURL(/\/sandbox/, { timeout: 20_000 })

    const me = await page.request.get('/api/auth/me')
    expect(me.status(), '/api/auth/me after signup').toBe(200)
    const body = (await me.json()) as { user?: { email?: string; tenant_id?: string } }
    expect(body.user?.email?.toLowerCase()).toBe(email)
    expect(body.user?.tenant_id?.trim()).toBeTruthy()
  })

  test('rejects duplicate email with clear error', async ({ page }) => {
    test.skip(!edgeHealthy, `zord-edge not reachable at ${EDGE_URL}`)

    const stamp = Date.now()
    const email = `smoke-dup-${stamp}@e2e.zord.local`
    const payload = {
      tenant_name: `Dup Tenant ${stamp}`,
      name: 'Dup User',
      email,
      password: SIGNUP_PASSWORD,
    }

    const first = await page.request.post('/api/auth/signup', { data: payload })
    expect(first.status(), 'first signup should succeed').toBe(201)

    await page.goto('/signup')
    await page.getByPlaceholder('e.g. Acme Payments').fill(`Dup Tenant Again ${stamp}`)
    await page.getByPlaceholder('e.g. Alex Patel').fill('Dup User')
    await page.getByPlaceholder('Enter your email').fill(email)
    await page.getByPlaceholder('At least 8 characters').fill(SIGNUP_PASSWORD)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    await expect(page.getByText(/already exists|email.*taken/i)).toBeVisible({ timeout: 15_000 })
  })
})
