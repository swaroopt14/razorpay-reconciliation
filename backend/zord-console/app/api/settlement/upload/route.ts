import { NextRequest, NextResponse } from 'next/server'
import { applyAuthCookies } from '@/services/auth/server'
import {
  applyRefreshedSessionCookies,
  resolveSettlementUploadContext,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Outcome-engine settlement ingest (default local: :8081). */
function settlementBase() {
  if (process.env.ZORD_SETTLEMENT_URL) return process.env.ZORD_SETTLEMENT_URL.replace(/\/$/, '')
  return 'http://localhost:8081'
}

/**
 * Proxies browser multipart upload to:
 * POST /v1/settlement/upload?tenant_id=<session>&psp=<query>&batch_id=<header optional>
 * Headers: Batch-Id, X-Zord-Force-Reprocess, X-Zord-Force-Reprocess-Reason, Authorization
 */

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type')
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data with file.' }, { status: 400 })
  }

  const ctx = await resolveSettlementUploadContext(
    req,
    process.env.ZORD_SETTLEMENT_API_KEY ?? process.env.ZORD_BULK_INGEST_API_KEY,
  )
  if (!ctx.ok) return ctx.response

  const psp = req.nextUrl.searchParams.get('psp')
  if (!psp?.trim()) {
    return NextResponse.json({ error: 'Query parameter psp is required.' }, { status: 400 })
  }

  const bodyBuffer = Buffer.from(await req.arrayBuffer())
  const batchId =
    req.headers.get('batch-id') || req.headers.get('Batch-Id') || req.headers.get('batchid') || req.headers.get('BatchId')
  const upstreamParams = new URLSearchParams({
    tenant_id: ctx.tenantId,
    psp: psp.trim(),
  })
  if (batchId?.trim()) upstreamParams.set('batch_id', batchId.trim())
  const url = `${settlementBase()}/v1/settlement/upload?${upstreamParams.toString()}`

  const headers: Record<string, string> = {
    'content-type': contentType,
    authorization: ctx.authorization,
  }

  if (batchId?.trim()) headers['Batch-Id'] = batchId.trim()

  const force = req.headers.get('x-zord-force-reprocess') ?? 'true'
  headers['X-Zord-Force-Reprocess'] = force

  const reason = req.headers.get('x-zord-force-reprocess-reason') ?? 'CLIENT_CORRECTED_FILE'
  headers['X-Zord-Force-Reprocess-Reason'] = reason

  let lastError: unknown = null
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyBuffer,
      cache: 'no-store',
    })
    const payload = await upstream.text()
    const res = new NextResponse(payload, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
      },
    })
    if (ctx.refreshedPayload) {
      applyAuthCookies(res, ctx.refreshedPayload)
    }
    applyRefreshedSessionCookies(res, ctx.refreshedPayload)
    return res
  } catch (error) {
    lastError = error
  }

  const res = NextResponse.json(
    {
      error: 'Settlement upload upstream unavailable',
      upstream: url,
      details: lastError instanceof Error ? lastError.message : 'Unknown upstream error',
    },
    { status: 502 },
  )
  if (ctx.refreshedPayload) applyAuthCookies(res, ctx.refreshedPayload)
  applyRefreshedSessionCookies(res, ctx.refreshedPayload)
  return res
}
