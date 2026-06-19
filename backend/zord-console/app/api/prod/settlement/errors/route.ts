import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  resolveSettlementUploadContext,
  TENANT_MISMATCH_BODY,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function settlementBase() {
  if (process.env.ZORD_SETTLEMENT_URL) return process.env.ZORD_SETTLEMENT_URL.replace(/\/$/, '')
  return 'http://localhost:8081'
}

/** Proxy: GET /api/prod/settlement/errors → outcome-engine settlement parse errors. */
export async function GET(request: NextRequest) {
  const ctx = await resolveSettlementUploadContext(
    request,
    process.env.ZORD_SETTLEMENT_API_KEY ?? process.env.ZORD_BULK_INGEST_API_KEY,
  )
  if (!ctx.ok) return ctx.response
  const tenantId = ctx.tenantId

  const queryTenant = request.nextUrl.searchParams.get('tenant_id')?.trim()
  if (queryTenant && queryTenant !== tenantId) {
    const res = NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 })
    applyRefreshedSessionCookies(res, ctx.refreshedPayload)
    return res
  }

  const batchId =
    request.nextUrl.searchParams.get('batch_id')?.trim() ||
    request.nextUrl.searchParams.get('client_batch_id')?.trim()

  const upstreamParams = new URLSearchParams({ tenant_id: tenantId })
  if (batchId) upstreamParams.set('batch_id', batchId)

  const url = `${settlementBase()}/v1/settlement/errors?${upstreamParams.toString()}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        authorization: ctx.authorization,
        'x-tenant-id': tenantId,
        'tenant-id': tenantId,
        tenant_id: tenantId,
      },
      cache: 'no-store',
    })
    const text = await upstream.text()
    const res = new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
    applyRefreshedSessionCookies(res, ctx.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        error: 'settlement parse errors upstream unavailable',
        upstream: url,
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, ctx.refreshedPayload)
    return res
  }
}
