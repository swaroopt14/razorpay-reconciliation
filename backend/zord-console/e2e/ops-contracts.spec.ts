import { test, expect } from '@playwright/test'

test('Ops contracts list renders payout contracts from API', async ({ page }) => {
  // Authenticate as OPS to avoid redirect.
  await page.addInitScript(() => {
    localStorage.setItem(
      'zord_auth',
      JSON.stringify({
        id: 'ops_1',
        email: 'ops@example.com',
        role: 'OPS',
        tenant: 'zord-ops',
        name: 'Ops User',
      })
    )
    localStorage.setItem('zord_current_role', 'OPS')
  })

  const contract = {
    contract_id: '4ad45794-e247-4031-8c77-0ec9857fb300',
    tenant_id: 'c897c223-e988-423f-a671-67eb8e476aa1',
    intent_id: '36946304-2154-419f-b3c5-4d6f18c4882f',
    envelope_id: '481418bf-f82a-48e3-869a-0d4584340390',
    contract_payload: 'eyJpbnRlbnRfdHlwZSI6ICJGWCIsICJhY2NvdW50X251bWJlciI6ICJBQ0M1NWtua241MDAwIn0=',
    contract_hash: 'a7d5777f943ad27f4b94b9c5909396e51b66146c7c55d14ffa4426f623aae744',
    status: 'ISSUED',
    created_at: '2026-02-06T10:34:50.183Z',
    trace_id: '',
  }

  await page.route('**/api/prod/payout-contracts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [contract] }),
    })
  })

  await page.goto('/ops/contracts')

  await expect(page.getByRole('heading', { name: /Contracts ▸ Payout Contracts/i })).toBeVisible()
  await expect(page.getByText(contract.contract_id)).toBeVisible()
  await expect(page.getByText(contract.intent_id)).toBeVisible()
})

