import { test, expect, type Page } from '@playwright/test'

/**
 * Live sign-in smoke — canonical /signin (live payout command by default).
 *
 * Creates the account first if it does not exist (same email/password env vars as signup smoke).
 *
 * Prerequisites:
 *   npm run dev  (port 3000)
 *   cd backend/zord-edge && docker compose up -d
 *
 * Run with your credentials:
 *   SMOKE_SIGNUP_EMAIL=jainamoswal1811@gmail.com \
 *   SMOKE_SIGNUP_PASSWORD=12345678 \
 *   npm run test:e2e -- e2e/signin-smoke.spec.ts
 *
 * Note: email must match exactly what was registered (gmail.com ≠ gamil.com).
 */
const EDGE_URL = process.env.ZORD_EDGE_URL || 'http://localhost:8080'
const EMAIL = (process.env.SMOKE_SIGNUP_EMAIL || '').trim().toLowerCase()
const PASSWORD = process.env.SMOKE_SIGNUP_PASSWORD || 'SmokeTest@1234'
const TENANT_NAME = process.env.SMOKE_SIGNUP_TENANT || 'Smoke Sign-in Workspace'

let edgeHealthy = false

async function ensureAccountExists(page: Page, email: string, password: string) {
  const probe = await page.request.post('/api/auth/login', {
    data: { email, password, workspace_id: '', login_surface: 'customer' },
  })
  if (probe.ok()) return

  const signup = await page.request.post('/api/auth/signup', {
    data: {
      tenant_name: TENANT_NAME,
      name: 'Smoke Sign-in User',
      email,
      password,
    },
  })
  expect(signup.status(), `signup before sign-in (${email})`).toBe(201)
}

async function clearAuthCookies(page: Page) {
  await page.context().clearCookies()
}

test.describe('signin smoke (live zord-edge)', () => {
  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${EDGE_URL}/v1/health`, { timeout: 5_000 })
      edgeHealthy = res.ok()
    } catch {
      edgeHealthy = false
    }
  })

  test('signs in on live workspace and opens payout command', async ({ page }) => {
    test.skip(!edgeHealthy, `zord-edge not reachable at ${EDGE_URL}`)
    test.skip(!EMAIL, 'Set SMOKE_SIGNUP_EMAIL (e.g. jainamoswal1811@gmail.com)')

    await ensureAccountExists(page, EMAIL, PASSWORD)
    await clearAuthCookies(page)

    await page.goto('/signin')
    await expect(page).toHaveURL('/signin')
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible()

    await page.getByPlaceholder('Enter your email').fill(EMAIL)
    await page.getByPlaceholder('Enter your password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    await expect(page).toHaveURL(/\/payout-command-view/, { timeout: 25_000 })
    await expect(page.getByText('Invalid email or password')).toHaveCount(0)

    const me = await page.request.get('/api/auth/me')
    expect(me.status()).toBe(200)
    const body = (await me.json()) as { user?: { email?: string } }
    expect(body.user?.email?.toLowerCase()).toBe(EMAIL)

    await page.reload()
    await expect(page).toHaveURL(/\/payout-command-view\/today/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toHaveCount(0)
    const meAfterRefresh = await page.request.get('/api/auth/me')
    expect(meAfterRefresh.status()).toBe(200)
  })

  test('legacy /signin/tenant redirects to /signin', async ({ page }) => {
    test.skip(!edgeHealthy, `zord-edge not reachable at ${EDGE_URL}`)

    await page.goto('/signin/tenant')
    await expect(page).toHaveURL('/signin')
  })

  test('signup then sign-in round trip', async ({ page }) => {
    test.skip(!edgeHealthy, `zord-edge not reachable at ${EDGE_URL}`)

    const stamp = Date.now()
    const email = `smoke-roundtrip-${stamp}@e2e.zord.local`
    const password = PASSWORD

    await page.request.post('/api/auth/signup', {
      data: {
        tenant_name: `Roundtrip ${stamp}`,
        name: 'Roundtrip User',
        email,
        password,
      },
    })

    await clearAuthCookies(page)
    await page.goto('/signin')

    await page.getByPlaceholder('Enter your email').fill(email)
    await page.getByPlaceholder('Enter your password').fill(password)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    await expect(page).toHaveURL(/\/payout-command-view/, { timeout: 25_000 })
    const me = await page.request.get('/api/auth/me')
    expect(me.status()).toBe(200)
  })
})
