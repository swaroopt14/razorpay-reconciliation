import { NextRequest, NextResponse } from 'next/server'
import { assertCookieMutationProtection } from '@/services/auth/assertSameOrigin.server'
import { applyAuthCookies } from '@/services/auth/server'
import {
  applyRefreshedSessionCookies,
  resolveSettlementUploadContext,
} from '@/services/auth/resolvePayoutTenant.server'
import { consumeBffRateLimit, rateLimitKeyForTenant } from '@/services/bff/rateLimit.server'
import { publicBffError } from '@/services/bff/publicBffError'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Settlement upload BFF.
 * MERGE RULE: keep assertCookieMutationProtection + session auth (no env API-key
 * fallback) + publicBffError on upstream failure. Never restore leaky upstream JSON.
 */

/** Outcome-engine settlement ingest (default local: :8081). */
function settlementBase() {
  if (process.env.ZORD_SETTLEMENT_URL) return process.env.ZORD_SETTLEMENT_URL.replace(/\/$/, '')
  return 'http://localhost:8081'
}

/**
 * Proxies browser multipart upload to:
 * POST /v1/settlement/upload?tenant_id=<session>&psp=<query>&batch_id=<header optional>
 * Headers: Batch-Id, Authorization; optional X-Zord-Force-Reprocess(+Reason) only when explicit.
 * CON-P0-03: missing force is treated as false — never default to correction/reprocess.
 */

export async function POST(req: NextRequest) {
  // Cookie browser path: same-origin + CSRF. Explicit Authorization (API key) bypasses.
  const csrf = assertCookieMutationProtection(req, { allowBearerBypass: true })
  if (!csrf.ok) return csrf.response

  const contentType = req.headers.get('content-type')
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data with file.' }, { status: 400 })
  }

  // CON-P0-02: session and/or explicit Authorization only — no ZORD_*_API_KEY fallback.
  const ctx = await resolveSettlementUploadContext(req)
  if (!ctx.ok) return ctx.response

  const rate = consumeBffRateLimit({
    bucket: 'reprocess',
    key: rateLimitKeyForTenant(ctx.tenantId),
    message: 'Too many settlement upload/reprocess requests. Try again shortly.',
  })
  if (!rate.ok) {
    applyRefreshedSessionCookies(rate.response, ctx.refreshedPayload)
    return rate.response
  }

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

  // CON-P0-03: never default force/correction. Only forward when the client
  // explicitly opts into reprocess/correction (Outcome Engine distinguishes new /
  // duplicate / same-content reprocess / changed-content correction).
  const forceRaw = req.headers.get('x-zord-force-reprocess')?.trim().toLowerCase()
  const forceReprocess = forceRaw === 'true'
  const reason = req.headers.get('x-zord-force-reprocess-reason')?.trim() || ''

  if (forceReprocess) {
    if (!reason) {
      return NextResponse.json(
        {
          error: 'X-Zord-Force-Reprocess-Reason is required when force reprocessing.',
          allowed: ['CLIENT_CORRECTED_FILE', 'PARSER_FIX', 'BACKFILL', 'MANUAL'],
        },
        { status: 400 },
      )
    }
    if (!batchId?.trim()) {
      return NextResponse.json(
        { error: 'Batch-Id (or batch_id) is required for reprocess/correction uploads.' },
        { status: 400 },
      )
    }
    headers['X-Zord-Force-Reprocess'] = 'true'
    headers['X-Zord-Force-Reprocess-Reason'] = reason
  }

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
      applyAuthCookies(res, ctx.refreshedPayload, req)
    }
    applyRefreshedSessionCookies(res, ctx.refreshedPayload, req)
    return res
  } catch (error) {
    lastError = error
  }

  const res = publicBffError({
    code: 'UPSTREAM_UNAVAILABLE',
    message: 'Settlement upload is temporarily unavailable. Retry shortly.',
    status: 502,
    log: {
      route: '/api/settlement/upload',
      upstream: url,
      error: lastError,
    },
  })
  if (ctx.refreshedPayload) applyAuthCookies(res, ctx.refreshedPayload, req)
  applyRefreshedSessionCookies(res, ctx.refreshedPayload, req)
  return res
}
