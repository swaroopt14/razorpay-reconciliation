import { NextRequest, NextResponse } from 'next/server'
import { assertCookieMutationProtection } from '@/services/auth/assertSameOrigin.server'
import {
  applyRefreshedSessionCookies,
  requireSessionIdentityForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'
import { publicBffError } from '@/services/bff/publicBffError'
import { consumeBffRateLimit, rateLimitKeyForTenant } from '@/services/bff/rateLimit.server'

/**
 * CON-P0-04 + CON-P1-01 + CON-P1-06 + CON-P1-20 — Ask Zord / Prompt Layer BFF.
 *
 * MERGE RULE (do not regress on conflict resolution):
 * 1) CSRF / same-origin via assertCookieMutationProtection (CON-P1-01)
 * 2) Identity ONLY from requireSessionIdentityForProdProxy — never client
 *    Authorization / x-tenant-id / x-user-id / x-session-id (CON-P0-04)
 * 3) Public errors via publicBffError only — no upstream URLs in body (CON-P1-06)
 * 4) Per-tenant rate limit via consumeBffRateLimit (CON-P1-20)
 * When merging with master, keep ALL behaviors; never accept a side that
 * restores client identity forwarding or drops CSRF / publicBffError / rate limits.
 */

export const dynamic = 'force-dynamic'

function normalizePromptLayerBase(base: string) {
  return base.replace(/\/+$/, '').replace(/\/query$/, '')
}

function upstreamCandidates() {
  return Array.from(
    new Set(
      [
        process.env.PROMPT_LAYER_URL,
        'http://zord-prompt-layer:8086',
        'http://host.docker.internal:8086',
        'http://localhost:8086',
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

export async function POST(req: NextRequest) {
  // CON-P1-01: cookie mutations must be same-origin (+ CSRF when session present).
  const csrf = assertCookieMutationProtection(req)
  if (!csrf.ok) return csrf.response

  // CON-P0-04: session identity only — ignore browser identity headers.
  const identity = await requireSessionIdentityForProdProxy(req)
  if (!identity.ok) return identity.response

  // CON-P1-20: throttle expensive Ask Zord calls per session tenant.
  const rate = consumeBffRateLimit({
    bucket: 'prompt',
    key: rateLimitKeyForTenant(identity.tenantId),
    message: 'Too many Ask Zord requests. Try again shortly.',
  })
  if (!rate.ok) {
    applyRefreshedSessionCookies(rate.response, identity.refreshedPayload, req)
    return rate.response
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    const res = publicBffError({
      code: 'INVALID_BODY',
      message: 'Request body must be valid JSON.',
      status: 400,
      log: { route: '/api/prompt-layer/query' },
    })
    applyRefreshedSessionCookies(res, identity.refreshedPayload, req)
    return res
  }

  // Never trust client-supplied tenant/user/session fields inside the JSON body.
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const next = { ...(body as Record<string, unknown>) }
    delete next.tenant_id
    delete next.tenantId
    delete next.user_id
    delete next.userId
    delete next.session_id
    delete next.sessionId
    body = next
  }

  const serviceToken = process.env.PROMPT_LAYER_SERVICE_TOKEN?.trim()
  const bearer = serviceToken || identity.accessToken
  if (!bearer) {
    const res = publicBffError({
      code: 'UNAUTHORIZED',
      message: 'Session required for this resource.',
      status: 401,
      log: { route: '/api/prompt-layer/query' },
    })
    applyRefreshedSessionCookies(res, identity.refreshedPayload, req)
    return res
  }

  const candidateUrls = upstreamCandidates().map((base) => `${normalizePromptLayerBase(base)}/query`)
  let resUpstream: Response | null = null
  let lastError: unknown = null
  let lastUrl = candidateUrls[candidateUrls.length - 1]

  const forwardHeaders: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${bearer}`,
    // Derived from Edge session only — never from the browser request.
    'x-tenant-id': identity.tenantId,
    'x-user-id': identity.userId,
  }
  if (identity.sessionId) {
    forwardHeaders['x-session-id'] = identity.sessionId
  }

  for (const url of candidateUrls) {
    lastUrl = url
    try {
      resUpstream = await fetch(url, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify(body),
        cache: 'no-store',
      })

      if (resUpstream.ok || resUpstream.status < 500) {
        break
      }
    } catch (error) {
      lastError = error
    }
  }

  if (!resUpstream) {
    // CON-P1-06: never put upstream URL / exception text in the customer body.
    const res = publicBffError({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Ask Zord is temporarily unavailable. Retry shortly.',
      status: 502,
      log: {
        route: '/api/prompt-layer/query',
        upstream: lastUrl,
        error: lastError,
      },
    })
    applyRefreshedSessionCookies(res, identity.refreshedPayload, req)
    return res
  }

  const text = await resUpstream.text()
  const res = new NextResponse(text, {
    status: resUpstream.status,
    headers: {
      'content-type': resUpstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
  applyRefreshedSessionCookies(res, identity.refreshedPayload, req)
  return res
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
