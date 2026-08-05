import { NextRequest, NextResponse } from 'next/server'
import type {
  ExternalBatchSyncContext,
  ExternalBatchSyncOperation,
  ExternalBatchSyncResponse,
} from '@/services/payout-command/external-batch-sync/types'

export async function readExternalSyncContext(request: NextRequest): Promise<ExternalBatchSyncContext> {
  const sp = request.nextUrl.searchParams
  let tenant_id = sp.get('tenant_id')
  let batch_id = sp.get('batch_id')
  let psp = sp.get('psp')
  try {
    const raw = await request.json()
    if (raw && typeof raw === 'object') {
      const b = raw as Record<string, unknown>
      if (typeof b.tenant_id === 'string') tenant_id = b.tenant_id
      if (typeof b.batch_id === 'string') batch_id = b.batch_id
      if (typeof b.psp === 'string') psp = b.psp
    }
  } catch {
    /* empty body or invalid JSON — query string only */
  }
  return { tenant_id, batch_id, psp }
}

export function integrationNotConfiguredResponse(
  operation: ExternalBatchSyncOperation,
  message: string,
  context: ExternalBatchSyncContext,
): NextResponse<ExternalBatchSyncResponse> {
  const body: ExternalBatchSyncResponse = {
    ok: false,
    connected: false,
    code: 'INTEGRATION_NOT_CONFIGURED',
    operation,
    message,
    hint:
      'Customer systems (SAP, Finacle, custom LMS, or your bank / NACH gateway) are not connected for this tenant yet. Please connect the system under tenant integrations in Zord; until then this endpoint acknowledges the request but does not pull live data.',
    context,
    request_id: crypto.randomUUID(),
    received_at: new Date().toISOString(),
  }
  return NextResponse.json(body)
}
