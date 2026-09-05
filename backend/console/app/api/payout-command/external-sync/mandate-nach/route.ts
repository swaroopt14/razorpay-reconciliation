import { NextRequest } from 'next/server'
import {
  integrationNotConfiguredResponse,
  readExternalSyncContext,
} from '../_lib/integration-stub'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payout-command/external-sync/mandate-nach
 * Body (JSON): { tenant_id, batch_id, psp? }
 *
 * Placeholder for mandate / NACH status checks against bank or mandate bureau.
 */
export async function POST(request: NextRequest) {
  const context = await readExternalSyncContext(request)
  return integrationNotConfiguredResponse(
    'mandate_nach_pull',
    'NACH / mandate gateway is not connected. Please connect your bank or mandate service to check live mandate status for this batch.',
    context,
  )
}
