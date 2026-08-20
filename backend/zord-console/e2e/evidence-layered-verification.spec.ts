import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const PACK_ID = 'pack-layer-001'

const LAYER_CASES = [
  {
    name: 'all-pass',
    body: {
      status: 'VERIFIED',
      evidence_pack_id: PACK_ID,
      checked_at: '2026-05-01T12:00:00Z',
      stored_root: 'a'.repeat(64),
      computed_root: 'a'.repeat(64),
      explanation: 'All layers passed.',
      db_merkle_status: 'PASS',
      archive_status: 'PASS',
      signature_status: 'PASS',
      replay_status: 'PASS',
    },
    db: 'PASS',
    archive: 'PASS',
    signature: 'PASS',
    exportPolicy: 'Export allowed',
  },
  {
    name: 'DB tamper only',
    body: {
      status: 'CORRUPTED',
      evidence_pack_id: PACK_ID,
      checked_at: '2026-05-01T12:00:00Z',
      stored_root: 'a'.repeat(64),
      computed_root: 'b'.repeat(64),
      explanation: 'DB merkle mismatch.',
      db_merkle_status: 'FAIL',
      archive_status: 'PASS',
      signature_status: 'PASS',
      replay_status: 'PASS',
    },
    db: 'FAIL',
    archive: 'PASS',
    signature: 'PASS',
    exportPolicy: 'Export blocked — layer verification failed',
  },
  {
    name: 'archive-key failure',
    body: {
      status: 'FAILED',
      evidence_pack_id: PACK_ID,
      checked_at: '2026-05-01T12:00:00Z',
      stored_root: 'a'.repeat(64),
      explanation: 'Archive key failed.',
      db_merkle_status: 'PASS',
      archive_status: 'FAIL',
      signature_status: 'PASS',
      replay_status: 'NOT_RUN',
    },
    db: 'PASS',
    archive: 'FAIL',
    signature: 'PASS',
    exportPolicy: 'Export blocked — layer verification failed',
  },
  {
    name: 'signature failure',
    body: {
      status: 'FAILED',
      evidence_pack_id: PACK_ID,
      checked_at: '2026-05-01T12:00:00Z',
      stored_root: 'a'.repeat(64),
      explanation: 'Signature failed.',
      db_merkle_status: 'PASS',
      archive_status: 'PASS',
      signature_status: 'FAIL',
      replay_status: 'PASS',
    },
    db: 'PASS',
    archive: 'PASS',
    signature: 'FAIL',
    exportPolicy: 'Export blocked — layer verification failed',
  },
  {
    name: 'unverified/partial',
    body: {
      status: 'PARTIAL',
      evidence_pack_id: PACK_ID,
      checked_at: '2026-05-01T12:00:00Z',
      stored_root: 'a'.repeat(64),
      explanation: 'Verification incomplete.',
      db_merkle_status: 'PASS',
      archive_status: 'NOT_RUN',
      signature_status: 'UNKNOWN',
      replay_status: 'NOT_RUN',
    },
    db: 'PASS',
    archive: 'NOT_RUN',
    signature: 'UNKNOWN',
    exportPolicy: 'Export blocked — verification incomplete',
  },
  {
    name: 'superseded pack',
    body: {
      status: 'SUPERSEDED',
      evidence_pack_id: PACK_ID,
      checked_at: '2026-05-01T12:00:00Z',
      stored_root: 'a'.repeat(64),
      explanation: 'Pack superseded.',
      pack_status: 'SUPERSEDED',
      db_merkle_status: 'PASS',
      archive_status: 'PASS',
      signature_status: 'PASS',
      replay_status: 'PASS',
    },
    db: 'PASS',
    archive: 'PASS',
    signature: 'PASS',
    exportPolicy: 'Export blocked — pack superseded',
  },
] as const

async function prepare(page: Page, context: BrowserContext, verifyBody: Record<string, unknown>) {
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
          mfa_enabled: false,
        },
        session: {
          session_id: 'e2e-session',
          tenant_id: 'e2e-tenant',
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
  await page.route('**/api/prod/evidence/packs/**/verify', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifyBody),
    }),
  )
  await page.route('**/api/prod/**', (route) => {
    if (route.request().url().includes('/verify')) return
    const pack = {
      evidence_pack_id: PACK_ID,
      tenant_id: 'e2e-tenant',
      intent_id: 'intent-1',
      contract_id: 'c1',
      mode: 'LIVE',
      pack_status: 'READY',
      merkle_root: 'a'.repeat(64),
      ruleset_version: '1',
      items: [],
      proof_status: 'CERTIFIED',
      proof_score: 100,
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pack),
    })
  })
}

test.describe('layered evidence verification fixtures (CON-P1-39)', () => {
  for (const fixture of LAYER_CASES) {
    test(`${fixture.name} renders layered badges and export policy`, async ({ page, context }) => {
      await prepare(page, context, fixture.body)
      await page.goto(`/payout-command-view/evidence-pack/${PACK_ID}?tab=graph`)
      await page.getByRole('button', { name: 'Verify Proof Integrity' }).first().click()
      await expect(page.getByTestId('layered-verification-badges')).toBeVisible()
      await expect(page.getByTestId('layer-badge-db_merkle')).toHaveAttribute('data-status', fixture.db)
      await expect(page.getByTestId('layer-badge-archive')).toHaveAttribute('data-status', fixture.archive)
      await expect(page.getByTestId('layer-badge-signature')).toHaveAttribute('data-status', fixture.signature)
      await expect(page.getByTestId('export-policy')).toHaveText(fixture.exportPolicy)
    })
  }
})
