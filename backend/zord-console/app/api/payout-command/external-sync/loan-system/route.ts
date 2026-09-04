import { NextRequest } from 'next/server'
import {
  integrationNotConfiguredResponse,
  readExternalSyncContext,
} from '../_lib/integration-stub'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payout-command/external-sync/loan-system
 * Body (JSON): { tenant_id, batch_id, psp? }
 *
 * Placeholder for pulling batch / disbursement intent data from the customer's loan or ERP system
 * (e.g. SAP). Returns INTEGRATION_NOT_CONFIGURED until connectors are implemented.
 */
export async function POST(request: NextRequest) {
  const context = await readExternalSyncContext(request)
  return integrationNotConfiguredResponse(
    'loan_system_pull',
    'Loan / ERP system is not connected. Please connect SAP, Finacle, or your LMS to refresh this batch from the customer system.',
    context,
  )
}
