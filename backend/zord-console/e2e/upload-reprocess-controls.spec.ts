import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const TENANT_ID = 'e2e-upload-tenant'
const CSV_FILE = {
  name: 'payments.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from('reference,amount,beneficiary,status\nPAY-1,1200,Account 1234,pending\n'),
}

async function prepareBatchPage(page: Page, context: BrowserContext) {
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
          name: 'QA User',
          tenant_id: TENANT_ID,
          tenant_name: 'QA Workspace',
          workspace_code: 'QA',
          mfa_enabled: false,
        },
        session: {
          session_id: 'e2e-session',
          tenant_id: TENANT_ID,
          workspace_code: 'QA',
          role: 'CUSTOMER_USER',
          access_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
      }),
    }),
  )
  await page.route('**/api/auth/session/status', (route) => {
    const now = Date.now()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        idle_expires_at: new Date(now + 15 * 60_000).toISOString(),
        absolute_expires_at: new Date(now + 8 * 60 * 60_000).toISOString(),
      }),
    })
  })
  await page.route('**/api/prod/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data_available: false, items: [], batches: [], pagination: { total: 0 } }),
    }),
  )
  await page.goto('/payout-command-view/batch-command-center')
  await expect(page.getByRole('heading', { name: 'Payment Batch Review' })).toBeVisible()
}

async function confirmReprocess(
  page: Page,
  target: 'Payment instruction file' | 'Bank / settlement confirmation file',
  reason: string,
) {
  const dialog = page.getByRole('dialog', { name: 'Why do you want to reprocess?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('radio', { name: target }).check()
  await dialog.getByLabel('Reprocess reason').selectOption(reason)
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toHaveCount(0)
}

test.describe('intent and settlement reprocess controls', () => {
  test.beforeEach(async ({ page, context }) => {
    await prepareBatchPage(page, context)
  })

  test('normal intent upload omits force headers', async ({ page }) => {
    let forceHeader: string | undefined
    let reasonHeader: string | undefined
    await page.route('**/api/bulk-ingest', async (route) => {
      forceHeader = route.request().headers()['x-zord-force-reprocess']
      reasonHeader = route.request().headers()['x-zord-force-reprocess-reason']
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ batch_id: 'batch-normal-1' }),
      })
    })

    await expect(page.getByRole('checkbox', { name: 'Reprocess payment instruction file' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Reprocess settlement confirmation file' })).not.toBeChecked()

    await page.getByLabel('Upload payment instruction file').setInputFiles(CSV_FILE)
    await page.getByRole('button', { name: 'Upload payment file', exact: true }).last().click()
    const successDialog = page.getByRole('dialog', { name: 'Payment file uploaded' })
    await expect(successDialog).toBeVisible()
    expect(forceHeader).toBeUndefined()
    expect(reasonHeader).toBeUndefined()
  })

  test('intent reprocess prompt asks why and sends force headers', async ({ page }) => {
    let forceHeader: string | undefined
    let reasonHeader: string | undefined
    await page.route('**/api/bulk-ingest', async (route) => {
      forceHeader = route.request().headers()['x-zord-force-reprocess']
      reasonHeader = route.request().headers()['x-zord-force-reprocess-reason']
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ batch_id: 'batch-reprocess-1' }),
      })
    })

    await page.getByLabel('Batch reference optional').fill('batch-reprocess-1')
    await page.getByRole('checkbox', { name: 'Reprocess payment instruction file' }).check()
    await confirmReprocess(page, 'Payment instruction file', 'PARSER_FIX')
    await page.getByLabel('Upload payment instruction file').setInputFiles(CSV_FILE)
    await page.getByRole('button', { name: 'Upload payment file', exact: true }).last().click()
    await expect(page.getByRole('dialog', { name: 'Payment file uploaded' })).toBeVisible()
    expect(forceHeader).toBe('true')
    expect(reasonHeader).toBe('PARSER_FIX')
  })

  test('forced settlement upload sends selected reason and displays backend failure', async ({ page }) => {
    let forceHeader: string | undefined
    let reasonHeader: string | undefined
    await page.route('**/api/settlement/upload?**', async (route) => {
      forceHeader = route.request().headers()['x-zord-force-reprocess']
      reasonHeader = route.request().headers()['x-zord-force-reprocess-reason']
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Settlement file is missing the bank reference column.' }),
      })
    })

    await page.getByLabel('Batch reference optional').fill('batch-settlement-1')
    await page.getByRole('checkbox', { name: 'Reprocess settlement confirmation file' }).check()
    await confirmReprocess(page, 'Bank / settlement confirmation file', 'PARSER_FIX')
    await page.getByLabel('Upload bank / settlement confirmation file').setInputFiles(CSV_FILE)
    await page.getByTestId('settlement-upload-submit').click()

    const dialog = page.getByRole('dialog', { name: 'Settlement confirmation upload failed' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Settlement file is missing the bank reference column.')
    expect(forceHeader).toBe('true')
    expect(reasonHeader).toBe('PARSER_FIX')
  })
})
