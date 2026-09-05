import { NextRequest } from 'next/server'
import {
  integrationNotConfiguredResponse,
  readExternalSyncContext,
} from '../_lib/integration-stub'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payout-command/external-sync/settlement-feed
 * Body (JSON): { tenant_id, batch_id, psp? }
 *
 * Placeholder for fetching settlement updates from the PSP / bank for the batch.
 */
export async function POST(request: NextRequest) {
  const context = await readExternalSyncContext(request)
  return integrationNotConfiguredResponse(
    'settlement_feed_pull',
    'Settlement / PSP feed is not connected. Please connect your payment partner or bank settlement channel to fetch live settlement updates for this batch.',
    context,
  )
}
