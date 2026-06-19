import { test, expect, type BrowserContext, type Page } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const SESSION_TENANT = 'e2e-session-tenant-111'

async function installPayoutSessionCookies(context: BrowserContext) {
  await context.addCookies([
    { name: 'zord_access_token', value: 'e2e-playwright-access', url: BASE_URL },
    { name: 'zord_role', value: 'CUSTOMER_USER', url: BASE_URL },
  ])
}

function installAuthIntelligenceAndPromptMocks(page: Page) {
  return Promise.all([
    page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { tenant_id: SESSION_TENANT },
          user: { id: 'e2e-user-1', tenant_id: SESSION_TENANT },
        }),
      })
    }),
    page.route('**/api/prod/ingest-status**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant_id: SESSION_TENANT,
          sources: [
            { id: 'intent_file', label: 'Payment instructions', status: 'received' },
            { id: 'settlement_file', label: 'Settlement file', status: 'received' },
            { id: 'bank_statement', label: 'Bank statement', status: 'missing' },
            { id: 'evidence', label: 'Evidence', status: 'partial' },
          ],
        }),
      })
    }),
    page.route('**/api/prod/home/disbursement-trend**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data_available: true,
          range: 'month',
          currency: 'INR',
          buckets: [
            { key: '1', label: 'W1', total_amount: 10000, confirmed_amount: 8000, review_amount: 2000, intent_count: 10, confirmed_count: 8 },
          ],
          source: 'intelligence_leakage_windows',
        }),
      })
    }),
    page.route('**/api/prod/intelligence/**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      const url = new URL(route.request().url())
      const path = url.pathname

      let body: Record<string, unknown> = {
        data_available: true,
        tenant_id: SESSION_TENANT,
        computed_at: new Date().toISOString(),
      }

      if (path.includes('/rca')) {
        body = {
          ...body,
          parser_weakness_rate: 0.667,
          weak_parse_count: 2,
          mapping_weakness_rate: 0.333,
          weak_mapping_count: 1,
          source_system_defect_rate: 0.5,
          source_system_defects: { HDFC_BANK: 0.5, ICICI_BANK: 0.5 },
          rca_concentration: 0.3,
          total_settlements: 3,
        }
      } else if (path.includes('/patterns')) {
        body = {
          ...body,
          success_count: 1100,
          pending_count: 84,
          failed_count: 12,
          total_count: 1231,
          batch_anomaly_score: 0.1,
          anomaly_level: 'LOW',
          batch_risk_score: 0.2,
          risk_tier: 'LOW',
          finality_status: 'SETTLED',
        }
      } else if (path.includes('/ambiguity')) {
        body = {
          ...body,
          ambiguous_intent_count: 18,
          ambiguity_rate: 0.009,
          avg_attachment_confidence: 0.92,
          provider_ref_missing_rate: 0.0,
          carrier_completeness_rate: 1.0,
          low_confidence_rate: 0.02,
          candidate_collision_rate: 0.01,
          value_at_risk_minor: '450000',
          risk_tier: 'LOW',
        }
      } else if (path.includes('/recommendations')) {
        body = {
          ...body,
          action_acceptance_rate: 0.88,
          action_resolution_rate: 0.72,
          total_actions: 459,
          accepted_actions: 400,
          resolved_actions: 300,
        }
      } else if (path.includes('/leakage')) {
        body = {
          ...body,
          total_intended_amount_minor: '500000000',
          total_observed_settled_amount_minor: '480000000',
          unmatched_amount_minor: '5000000',
          under_settlement_amount_minor: '2000000',
          orphan_amount_minor: '0',
          reversal_exposure_minor: '1000000',
          ambiguous_value_at_risk_minor: '4500000',
          leakage_percentage: 0.01,
          risk_tier: 'LOW',
          value_date_mismatch_count: 3,
        }
      } else if (path.includes('/defensibility')) {
        body = {
          ...body,
          evidence_pack_rate: 0.84,
          governance_coverage_pct: 0.88,
          replayability_pct: 0.9,
          defensibility_score: 58,
          defensibility_tier: 'STRONG',
          audit_ready_pct: 0.8,
          dispute_ready_pct: 0.75,
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    }),
    page.route('**/api/prompt-layer/query', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answer:
            'Zord found 18 payments needing review. Upload any missing bank references and open Payment Review to resolve ambiguous matches.',
          confidence: 'high',
          citations: [],
        }),
      })
    }),
  ])
}

test.describe('Payment Operations View (Ask Zord workspace)', () => {
  test.beforeEach(async ({ page, context }) => {
    await installPayoutSessionCookies(context)
    await installAuthIntelligenceAndPromptMocks(page)
    await page.addInitScript((tid) => {
      localStorage.setItem('zord_tenant_id', tid)
    }, SESSION_TENANT)
  })

  test('loads payment operations view with ops language', async ({ page }) => {
    await page.goto('/payout-command-view/today?dock=workspace')

    await expect(page.getByRole('heading', { name: 'Payment Operations View' })).toBeVisible()
    await expect(page.getByTestId('workspace-surface')).toBeVisible()
    await expect(page.getByTestId('workspace-summary-strip')).toBeVisible()
    await expect(page.getByTestId('workspace-operations-grid')).toBeVisible()
    await expect(page.getByTestId('workspace-intelligence-panel')).toBeVisible()

    await expect(page.getByText('Payments in Scope')).toBeVisible()
    await expect(page.getByText('Connected Sources')).toBeVisible()
    await expect(page.getByText('Value at Risk')).toBeVisible()
    await expect(page.getByText('Items Needing Review')).toBeVisible()
    await expect(page.getByText('Ask Zord About This Payment Data')).toBeVisible()

    await expect(page.getByText(/Command scope clean payouts/i)).toHaveCount(0)
    await expect(page.getByText(/Provider posture/i)).toHaveCount(0)
    await expect(page.getByText(/Recovery intelligence/i)).toHaveCount(0)
    await expect(page.getByText(/routed value is concentrating/i)).toHaveCount(0)

    await expect(page.getByTestId('workspace-routing-tab-disabled')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Value at Risk' })).toBeVisible()
  })

  test('loads initial latest answer from prompt-layer', async ({ page }) => {
    const promptWait = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/api/prompt-layer/query'),
      { timeout: 20_000 },
    )

    await page.goto('/payout-command-view/today?dock=workspace')

    await promptWait
    await expect(page.getByTestId('workspace-chat-transcript-answer')).toBeVisible()
    await expect(page.getByText(/18 payments needing review|missing bank references/i)).toBeVisible({
      timeout: 15_000,
    })
  })

  test('typed prompt triggers prompt-layer POST', async ({ page }) => {
    const promptWait = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/api/prompt-layer/query'),
      { timeout: 20_000 },
    )

    await page.goto('/payout-command-view/today?dock=workspace')

    await page.getByPlaceholder('Ask anything or search').fill('Which payments need review?')
    await page.getByRole('button', { name: 'Send message' }).click()

    const req = await promptWait
    const body = req.postDataJSON() as { query?: string; tenant_id?: string }
    expect(body.tenant_id).toBe(SESSION_TENANT)
    expect(body.query).toBe('Which payments need review?')

    await expect(page.getByText(/payments needing review|missing bank references/i)).toBeVisible({
      timeout: 15_000,
    })
  })
})
