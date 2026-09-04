import { PRIMARY_BATCH, SMOKE_API_KEY, TENANT_ID, tenantForEmail } from './constants.js'
import {
  ambiguityHeatmap,
  ambiguityKpi,
  authEnvelope,
  bubbleMap,
  buildBatchContract,
  buildBatchDetail,
  buildBatchIdsList,
  buildDlqItems,
  buildIntelligenceBatches,
  buildManualReviewDlq,
  buildPaymentIntents,
  buildSettlementErrors,
  defensibilityKpi,
  evidencePackDetail,
  evidencePackTimeline,
  evidencePackVerify,
  evidencePacksList,
  intentsListPage,
  leakageExposureTimeseries,
  leakageKpi,
  lineageGraph,
  notFound,
  operationsSummary,
  exceptionsSummary,
  patternDetail,
  patternHistory,
  promptLayerQuery,
  recommendationDetail,
  recommendationsDashboard,
  patternsDashboard,
  emailForToken,
  rcaKpi,
  registerTokenEmail,
  sessionStatus,
  settlementObservationsRoute,
  bulkIngestAck,
  settlementUploadAck,
  syncStatus,
} from './fixtures.js'
import {
  resetUploadReadiness,
  uploadReadinessSnapshot,
} from './uploadReadiness.js'
import {
  listLoginAudit,
  loginAuditStatus,
  recordLoginAudit,
} from './loginAudit.js'
import {
  listAuthUsers,
  listLoginEmails,
  loginGateStatus,
  loginGateUserCount,
  upsertUser,
  verifyLogin,
} from './loginGate.js'
import { handleProtocolRequest } from './protocol/routes.js'
import { handleFinanceRequest, listRazorpaySettlements, listSettlementReconCombined } from './finance.js'

const LATENCY_MS = Number.parseInt(process.env.SMOKE_LATENCY_MS ?? '120', 10) || 0

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')?.trim() || null
}

function requireSmokeApiKey(request) {
  const auth = request.headers.get('authorization') ?? ''
  return auth.includes(SMOKE_API_KEY)
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  })
}

function readAuthTenant(request) {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.includes(SMOKE_API_KEY)) return TENANT_ID
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    const email = emailForToken(token)
    if (email) return tenantForEmail(email).tenant_id
    return TENANT_ID
  }
  const headerTenant = request.headers.get('x-tenant-id') ?? request.headers.get('tenant-id')
  if (headerTenant?.trim()) return headerTenant.trim()
  return TENANT_ID
}

function pathSegments(pathname) {
  return pathname.replace(/\/+$/, '').split('/').filter(Boolean)
}

function batchIdFromPath(pathname, markerIndex) {
  const parts = pathSegments(pathname)
  return parts[markerIndex + 1] ?? null
}

/** Route table — all services share one port; console sets every ZORD_*_URL to this host. */
export async function handleRequest(request) {
  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method.toUpperCase()
  readAuthTenant(request)

  const protocol = await handleProtocolRequest(request)
  if (protocol) return protocol

  if (pathname === '/healthz' || pathname === '/v1/health' || pathname === '/health') {
    return jsonResponse({
      status: 'ok',
      service: 'payout-smoke-simulator',
      tenant_id: TENANT_ID,
      upload_readiness: uploadReadinessSnapshot(request),
      login_audit: loginAuditStatus(),
      login_gate: {
        ...loginGateStatus(),
        user_count: await loginGateUserCount(),
      },
    })
  }

  // ── zord-edge (auth) ─────────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/v1/auth/login') {
    const started = Date.now()
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const companyName =
      typeof body.company_name === 'string'
        ? body.company_name
        : typeof body.companyName === 'string'
          ? body.companyName
          : ''
    const workspaceId =
      typeof body.workspace_id === 'string'
        ? body.workspace_id
        : typeof body.workspaceId === 'string'
          ? body.workspaceId
          : ''
    const loginSurface =
      typeof body.login_surface === 'string'
        ? body.login_surface
        : typeof body.loginSurface === 'string'
          ? body.loginSurface
          : 'customer'

    const gate = await verifyLogin({
      email,
      password,
      companyName,
      ip: clientIp(request),
      loginSurface,
    })
    if (!gate.ok) {
      await recordLoginAudit({
        request,
        email,
        companyName,
        workspaceId,
        loginSurface,
        mode: 'sandbox',
        success: false,
        latencyMs: Date.now() - started,
      })
      const status =
        gate.code === 'too_many_attempts' ? 429 : gate.code === 'company_required' ? 400 : 401
      return jsonResponse({ error: gate.code, message: gate.message }, status)
    }

    // Keep uploaded batches across re-login — readiness is keyed by tenant and persisted.
    // Explicit wipe: POST /v1/smoke/reset-uploads

    const userTenant = tenantForEmail(gate.user.email)
    const envelope = authEnvelope({
      email: gate.user.email,
      name: gate.user.name,
      role: gate.user.role,
      companyName: gate.user.company_name,
      tenantId: userTenant.tenant_id,
      tenantName: userTenant.tenant_name,
    })
    // Map token → email so /v1/auth/refresh and /v1/auth/me resolve the right tenant.
    registerTokenEmail(envelope.access_token, gate.user.email)
    await recordLoginAudit({
      request,
      email: gate.user.email,
      companyName: gate.user.company_name,
      workspaceId,
      loginSurface,
      mode: 'sandbox',
      success: true,
      latencyMs: Date.now() - started,
    })
    return jsonResponse(envelope)
  }

  if (method === 'GET' && pathname === '/v1/auth/login-options') {
    const emails = await listLoginEmails()
    return jsonResponse({ ok: true, emails })
  }

  if (method === 'GET' && pathname === '/v1/smoke/auth-users') {
    if (!requireSmokeApiKey(request)) {
      return jsonResponse({ error: 'unauthorized', message: 'API key required' }, 401)
    }
    const items = await listAuthUsers()
    return jsonResponse({ ok: true, count: items.length, items })
  }

  if (method === 'POST' && pathname === '/v1/smoke/auth-users') {
    if (!requireSmokeApiKey(request)) {
      return jsonResponse({ error: 'unauthorized', message: 'API key required' }, 401)
    }
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    try {
      const user = await upsertUser({
        email: body.email,
        password: body.password,
        name: body.name,
        role: body.role,
      })
      return jsonResponse({ ok: true, user }, 201)
    } catch (err) {
      return jsonResponse(
        { error: 'invalid_user', message: err instanceof Error ? err.message : 'Could not save user.' },
        400,
      )
    }
  }

  // Login audit feed for ops (API key or bearer). Never returns passwords.
  if (method === 'GET' && pathname === '/v1/smoke/login-audit') {
    const auth = request.headers.get('authorization') ?? ''
    if (!auth.includes(SMOKE_API_KEY)) {
      return jsonResponse({ error: 'unauthorized', message: 'API key required' }, 401)
    }
    const limit = url.searchParams.get('limit')
    const result = await listLoginAudit({ limit })
    return jsonResponse({ ok: true, ...result, status: loginAuditStatus() })
  }

  if (method === 'POST' && pathname === '/v1/smoke/reset-uploads') {
    resetUploadReadiness(request)
    return jsonResponse({ ok: true, ...uploadReadinessSnapshot(request) })
  }
  if (method === 'POST' && pathname === '/v1/auth/refresh') {
    const existingAuth = request.headers.get('authorization') ?? ''
    const existingToken = existingAuth.replace(/^Bearer\s+/i, '').trim() || undefined
    return jsonResponse(authEnvelope({ existingAccessToken: existingToken }))
  }
  if (method === 'GET' && pathname === '/v1/auth/me') {
    const existingAuth2 = request.headers.get('authorization') ?? ''
    const existingToken2 = existingAuth2.replace(/^Bearer\s+/i, '').trim() || undefined
    return jsonResponse(authEnvelope({ existingAccessToken: existingToken2 }))
  }
  if (method === 'GET' && pathname === '/v1/auth/principal') {
    const auth4 = request.headers.get('authorization') ?? ''
    const token4 = auth4.replace(/^Bearer\s+/i, '').trim()
    const email4 = emailForToken(token4)
    const tenant4 = email4 ? tenantForEmail(email4).tenant_id : TENANT_ID
    return jsonResponse({ tenant_id: tenant4, principal_type: 'user' })
  }
  if (method === 'GET' && pathname === '/v1/session/status') {
    return jsonResponse(sessionStatus())
  }
  if (method === 'POST' && pathname === '/v1/session/refresh') {
    const existingAuth3 = request.headers.get('authorization') ?? ''
    const existingToken3 = existingAuth3.replace(/^Bearer\s+/i, '').trim() || undefined
    return jsonResponse(authEnvelope({ existingAccessToken: existingToken3 }))
  }

  // ── zord-edge (bulk ingest / Create Payout upload) ───────────────────────
  if (method === 'POST' && pathname === '/v1/bulk-ingest') {
    // Drain multipart body so clients can finish the upload; content is not parsed.
    try {
      await request.arrayBuffer()
    } catch {
      /* ignore empty/aborted body */
    }
    // Simulate real processing time so the console's upload overlay has time to paint.
    if (LATENCY_MS > 0) await sleep(LATENCY_MS)
    return jsonResponse(bulkIngestAck(request))
  }

  // ── zord-intent-engine ───────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/api/prod/intents/batch-ids') {
    return jsonResponse(buildBatchIdsList(request))
  }
  if (method === 'GET' && pathname === '/api/prod/intents/payment-intents') {
    const batchId = url.searchParams.get('batch_id')?.trim()
    if (!batchId) return jsonResponse({ items: [], pagination: { page: 1, page_size: 0, total: 0 } }, 400)
    if (LATENCY_MS > 0) await sleep(LATENCY_MS)
    return jsonResponse(buildPaymentIntents(batchId, request))
  }
  if (method === 'GET' && pathname === '/api/prod/intents/dlq-items') {
    const batchId = url.searchParams.get('batch_id')?.trim() ?? PRIMARY_BATCH
    return jsonResponse(buildDlqItems(batchId, request))
  }
  if (method === 'GET' && pathname === '/v1/intents') {
    const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
    const pageSize = Number.parseInt(url.searchParams.get('page_size') ?? '20', 10) || 20
    return jsonResponse(intentsListPage(page, pageSize, request))
  }
  if (method === 'GET' && pathname === '/v1/dlq') {
    return jsonResponse(buildManualReviewDlq(request))
  }
  if (method === 'GET' && pathname === '/v1/dlq/manual-review') {
    return jsonResponse(buildManualReviewDlq(request))
  }

  // ── zord-outcome-engine (finance recon) ──────────────────────────────────
  if (pathname.startsWith('/v1/reconciliation/') || pathname === '/v1/reconciliation') {
    let body = {}
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try {
        body = await request.json()
      } catch {
        body = {}
      }
    }
    const result = handleFinanceRequest(method, pathname, url, body)
    if (result) return jsonResponse(result.body, result.status)
  }

  // ── Razorpay settlements (list + combined recon) ─────────────────────────
  if (method === 'GET' && pathname === '/v1/settlements') {
    const status = url.searchParams.get('status')?.trim() || ''
    return jsonResponse(listRazorpaySettlements({ status }))
  }
  if (method === 'GET' && pathname === '/v1/settlements/recon/combined') {
    const settlementId = url.searchParams.get('settlement_id')?.trim() || ''
    return jsonResponse(listSettlementReconCombined({ settlementId }))
  }

  // ── zord-outcome-engine (settlement) ─────────────────────────────────────
  if (method === 'POST' && pathname === '/v1/settlement/upload') {
    try {
      await request.arrayBuffer()
    } catch {
      /* ignore empty/aborted body */
    }
    // Simulate real processing time so the console's upload overlay has time to paint.
    if (LATENCY_MS > 0) await sleep(LATENCY_MS)
    return jsonResponse(settlementUploadAck(url, request))
  }
  if (method === 'GET' && pathname === '/v1/settlement/observations/batches') {
    if (LATENCY_MS > 0) await sleep(LATENCY_MS)
    return jsonResponse(settlementObservationsRoute(url, request))
  }
  if (method === 'GET' && pathname === '/v1/settlement/errors') {
    const batchId =
      url.searchParams.get('client_batch_id')?.trim() ||
      url.searchParams.get('batch_id')?.trim()
    return jsonResponse(buildSettlementErrors(batchId, request))
  }

  // ── zord-intelligence ──────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/v1/operations/summary') {
    const batchId = url.searchParams.get('batch_id')?.trim() || undefined
    return jsonResponse(operationsSummary(batchId, request))
  }
  if (method === 'GET' && pathname === '/v1/exceptions/summary') {
    const batchId = url.searchParams.get('batch_id')?.trim() || undefined
    return jsonResponse(exceptionsSummary(batchId, request))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/leakage') {
    const fromDate = url.searchParams.get('from_date')?.trim() || undefined
    const toDate = url.searchParams.get('to_date')?.trim() || undefined
    const batchId = url.searchParams.get('batch_id')?.trim() || undefined
    return jsonResponse(leakageKpi(fromDate, toDate, batchId, request))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/timeseries/leakage-exposure') {
    const granularity = url.searchParams.get('granularity')?.trim() || 'day'
    return jsonResponse(leakageExposureTimeseries(granularity, request))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/ambiguity') {
    return jsonResponse(ambiguityKpi(request))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/ambiguity/heatmap') {
    return jsonResponse(ambiguityHeatmap(request))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/bubble-map') {
    return jsonResponse(bubbleMap(request))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/defensibility') {
    return jsonResponse(defensibilityKpi())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/patterns') {
    const batchId = url.searchParams.get('batch_id')
    return jsonResponse(patternsDashboard(batchId, request))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/rca') {
    const batchId = url.searchParams.get('batch_id')
    return jsonResponse(rcaKpi(batchId))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/pattern') {
    const batchId = url.searchParams.get('batch_id') ?? url.searchParams.get('scope_ref')
    return jsonResponse(patternDetail(batchId))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/pattern/history') {
    return jsonResponse(patternHistory())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/recommendations') {
    return jsonResponse(recommendationsDashboard())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/recommendation') {
    return jsonResponse(recommendationDetail())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/recommendation/history') {
    return jsonResponse({ count: 0, snapshots: [] })
  }
  if (method === 'GET' && pathname === '/v1/intelligence/batches') {
    const limit = url.searchParams.get('limit')?.trim() || undefined
    const status = url.searchParams.get('status')?.trim() || undefined
    return jsonResponse(buildIntelligenceBatches({ limit, status }, request))
  }
  if (method === 'GET' && pathname.startsWith('/v1/intelligence/batches/')) {
    const batchId = batchIdFromPath(pathname, 2)
    return jsonResponse(buildBatchDetail(batchId))
  }
  if (method === 'GET' && pathname.startsWith('/v1/intelligence/dashboard/batch_contract/')) {
    const batchId = batchIdFromPath(pathname, 3)
    return jsonResponse(buildBatchContract(batchId))
  }

  // ── zord-evidence ────────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/v1/evidence/packs') {
    return jsonResponse(evidencePacksList(url.searchParams))
  }
  if (method === 'GET' && pathname.match(/^\/v1\/evidence\/batch\/[^/]+\/intents$/)) {
    const batchId = batchIdFromPath(pathname, 2)
    return jsonResponse(
      evidencePacksList(new URLSearchParams({ batch_id: batchId, intents_only: '1' })),
    )
  }
  if (method === 'GET' && pathname.match(/^\/v1\/evidence\/batch\/[^/]+\/lineage-graph$/)) {
    const batchId = batchIdFromPath(pathname, 2)
    return jsonResponse(lineageGraph('batch', batchId))
  }
  if (method === 'GET' && pathname.match(/^\/v1\/evidence\/packs\/[^/]+\/lineage-graph$/)) {
    const packId = batchIdFromPath(pathname, 2)
    return jsonResponse(lineageGraph('pack', packId))
  }
  if (method === 'GET' && pathname.match(/^\/v1\/evidence\/packs\/[^/]+\/timeline$/)) {
    const packId = batchIdFromPath(pathname, 2)
    return jsonResponse(evidencePackTimeline(packId))
  }
  if (method === 'POST' && pathname.match(/^\/v1\/evidence\/packs\/[^/]+\/verify$/)) {
    const packId = batchIdFromPath(pathname, 2)
    return jsonResponse(evidencePackVerify(packId))
  }
  if (method === 'GET' && pathname.match(/^\/v1\/evidence\/packs\/[^/]+$/) && !pathname.endsWith('/export')) {
    const packId = pathname.split('/').pop()
    return jsonResponse(evidencePackDetail(packId))
  }

  // ── connectors / edge misc ─────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/v1/connectors/sync-status') {
    return jsonResponse(syncStatus())
  }

  // ── zord-prompt-layer (Ask Zord / Payment Operations View) ─────────────────
  if (method === 'POST' && (pathname === '/query' || pathname === '/v1/query')) {
    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    return jsonResponse(promptLayerQuery(body))
  }

  return jsonResponse(notFound(pathname), 404)
}
