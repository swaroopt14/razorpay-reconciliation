import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import liveNav from '../product-contract/live-nav.json'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

async function prepareLive(page: Page, context: BrowserContext) {
  const base = new URL(BASE_URL)
  await context.addCookies([
    { name: 'zord_access_token', value: 'e2e-access', url: base.origin },
    { name: 'zord_session_present', value: '1', url: base.origin },
    { name: 'zord_role', value: 'CUSTOMER_USER', url: base.origin },
  ])
  await page.route('**/api/auth/me**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'e2e-user',
          email: 'qa@example.test',
          role: 'CUSTOMER_USER',
          tenant_id: 'e2e-tenant',
          tenant_name: 'QA',
          workspace_code: 'QA',
          mfa_enabled: false,
        },
        session: {
          session_id: 'e2e-session',
          tenant_id: 'e2e-tenant',
          workspace_code: 'QA',
          role: 'CUSTOMER_USER',
          access_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
      }),
    }),
  )
  await page.route('**/api/auth/session/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        idle_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        absolute_expires_at: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
      }),
    }),
  )
  await page.route('**/api/prod/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data_available: false, items: [], batches: [] }),
    }),
  )
}

test.describe('live nav product contract (CON-P1-38)', () => {
  test('live home does not expose deferred or sandbox-only docks', async ({ page, context }) => {
    await prepareLive(page, context)
    await page.goto('/payout-command-view/today')
    await expect(page.getByRole('heading', { name: 'Payment Command Center', level: 1 }).first()).toBeVisible()
    await expect(page.getByText('Borrower Verification', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Post-Disbursal Monitoring', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Connector Performance & Leakage', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Billing', level: 1 })).toHaveCount(0)
  })

  test('sandbox still covers sandbox-only billing', async ({ page, context }) => {
    await prepareLive(page, context)
    await page.goto('/sandbox?dock=billing')
    await expect(page.getByRole('heading', { name: liveNav.sandboxOnlyTitles.billing, level: 1 })).toBeVisible({
      timeout: 25_000,
    })
  })
})
