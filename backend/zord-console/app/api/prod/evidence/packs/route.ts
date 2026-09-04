import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardEvidence } from '../_shared'

export const dynamic = 'force-dynamic'

// GET /api/prod/evidence/packs?tenant_id=…&client_batch_id=…&intent_id=…
// Accepts legacy `batch_id` and maps to upstream `client_batch_id`.
export async function GET(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams)
  const legacyBatchId = params.get('batch_id')
  if (legacyBatchId && !params.get('client_batch_id')) {
    params.set('client_batch_id', legacyBatchId)
    params.delete('batch_id')
  }
  const rewritten = new URL(request.url)
  rewritten.search = params.toString()
  return forwardEvidence(new NextRequest(rewritten, request), BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACKS)
}
