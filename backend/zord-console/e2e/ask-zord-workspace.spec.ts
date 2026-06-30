import { test, expect, type BrowserContext, type Page } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const SESSION_TENANT = 'e2e-session-tenant-111'

async function installPayoutSessionCookies(context: BrowserContext) {
  const parsed = new URL(BASE_URL)
  const port = parsed.port ? `:${parsed.port}` : ''
  const origins = new Set<string>([
    `${parsed.protocol}//${parsed.hostname}${port}`,
    `${parsed.protocol}//localhost${port}`,
    `${parsed.protocol}//127.0.0.1${port}`,
  ])
  const cookies = [...origins].flatMap((url) => ([
    { name: 'zord_access_token', value: 'e2e-playwright-access', url },
    { name: 'zord_refresh_token', value: 'e2e-playwright-refresh', url },
    { name: 'zord_role', value: 'CUSTOMER_USER', url },
    { name: 'zord_session_present', value: '1', url },
  ]))
  await context.addCookies(cookies)
}

async function installAuthIntelligenceAndPromptMocks(page: Page) {
  await page.route('**/api/auth/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'e2e-user', name: 'E2E User', email: 'e2e@test.com' },
        tenantId: SESSION_TENANT,
      }),
    })
  })

  await page.route('**/api/prompt-layer/query', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: '18 payments need review in this workspace snapshot.',
        citations: [],
      }),
    })
  })
}

test.describe('Ask Zord workspace', () => {
  test.beforeEach(async ({ context, page }) => {
    await installPayoutSessionCookies(context)
    await installAuthIntelligenceAndPromptMocks(page)
    await page.addInitScript((tid) => {
      localStorage.setItem('zord_tenant_id', tid)
    }, SESSION_TENANT)
  })

  test('loads ChatGPT-style Ask Zord workspace', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=workspace')

    await expect(page.getByRole('heading', { name: 'Payment Operations View' })).toBeVisible()
    await expect(page.getByTestId('workspace-surface')).toBeVisible()
    await expect(page.getByTestId('ask-zord-workspace')).toBeVisible()
    await expect(page.getByTestId('ask-zord-orb')).toBeVisible()
    await expect(page.getByTestId('ask-zord-prompt-input')).toBeVisible()
    await expect(page.getByTestId('ask-zord-history-sidebar')).toBeVisible()
    await expect(page.getByTestId('ask-zord-example-chip').first()).toBeVisible()

    await expect(page.getByTestId('workspace-operations-grid')).toHaveCount(0)
    await expect(page.getByText('Connected Sources')).toHaveCount(0)
  })

  test('example chip triggers prompt-layer POST', async ({ page }) => {
    const promptWait = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/api/prompt-layer/query'),
      { timeout: 20_000 },
    )

    await page.goto('/payout-command-view/today?dock=workspace')
    await page.getByTestId('ask-zord-example-chip').first().click()

    await promptWait
    await expect(page.getByTestId('ask-zord-thread')).toBeVisible({ timeout: 15_000 })
  })

  test('typed prompt triggers prompt-layer POST', async ({ page }) => {
    const promptWait = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/api/prompt-layer/query'),
      { timeout: 20_000 },
    )

    await page.goto('/payout-command-view/today?dock=workspace')
    await page.getByTestId('ask-zord-prompt-input').fill('Which batches are blocked from close?')
    await page.getByLabel('Send').click()

    await promptWait
    await expect(page.getByTestId('ask-zord-thread')).toBeVisible({ timeout: 15_000 })
  })
})
