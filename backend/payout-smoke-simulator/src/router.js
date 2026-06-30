import { PRIMARY_BATCH, SMOKE_API_KEY, TENANT_ID, intentId } from './constants.js'
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
  buildPaymentIntents,
  buildSettlementErrors,
  defensibilityKpi,
  evidencePackDetail,
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
  recommendationDetail,
  recommendationsDashboard,
  patternsDashboard,
  sessionStatus,
  settlementObservationsRoute,
  syncStatus,
} from './fixtures.js'

const LATENCY_MS = Number.parseInt(process.env.SMOKE_LATENCY_MS ?? '120', 10) || 0

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  if (auth.toLowerCase().startsWith('bearer ')) return TENANT_ID
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

  if (pathname === '/healthz' || pathname === '/v1/health' || pathname === '/health') {
    return jsonResponse({ status: 'ok', service: 'payout-smoke-simulator', tenant_id: TENANT_ID })
  }

  // ── zord-edge (auth) ─────────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/v1/auth/login') {
    return jsonResponse(authEnvelope())
  }
  if (method === 'POST' && pathname === '/v1/auth/refresh') {
    return jsonResponse(authEnvelope())
  }
  if (method === 'GET' && pathname === '/v1/auth/me') {
    return jsonResponse(authEnvelope())
  }
  if (method === 'GET' && pathname === '/v1/auth/principal') {
    return jsonResponse({ tenant_id: TENANT_ID, principal_type: 'user' })
  }
  if (method === 'GET' && pathname === '/v1/session/status') {
    return jsonResponse(sessionStatus())
  }
  if (method === 'POST' && pathname === '/v1/session/refresh') {
    return jsonResponse(authEnvelope())
  }

  // ── zord-intent-engine ───────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/api/prod/intents/batch-ids') {
    return jsonResponse(buildBatchIdsList())
  }
  if (method === 'GET' && pathname === '/api/prod/intents/payment-intents') {
    const batchId = url.searchParams.get('batch_id')?.trim()
    if (!batchId) return jsonResponse({ items: [], pagination: { page: 1, page_size: 0, total: 0 } }, 400)
    if (LATENCY_MS > 0) await sleep(LATENCY_MS)
    return jsonResponse(buildPaymentIntents(batchId))
  }
  if (method === 'GET' && pathname === '/api/prod/intents/dlq-items') {
    const batchId = url.searchParams.get('batch_id')?.trim() ?? PRIMARY_BATCH
    return jsonResponse(buildDlqItems(batchId))
  }
  if (method === 'GET' && pathname === '/v1/intents') {
    const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
    const pageSize = Number.parseInt(url.searchParams.get('page_size') ?? '1', 10) || 1
    return jsonResponse(intentsListPage(page, pageSize))
  }
  if (method === 'GET' && pathname === '/v1/dlq') {
    return jsonResponse(buildDlqItems(PRIMARY_BATCH))
  }
  if (method === 'GET' && pathname === '/v1/dlq/manual-review') {
    return jsonResponse(buildDlqItems(PRIMARY_BATCH))
  }

  // ── zord-outcome-engine (settlement) ─────────────────────────────────────
  if (method === 'GET' && pathname === '/v1/settlement/observations/batches') {
    if (LATENCY_MS > 0) await sleep(LATENCY_MS)
    return jsonResponse(settlementObservationsRoute(url))
  }
  if (method === 'GET' && pathname === '/v1/settlement/errors') {
    const batchId = url.searchParams.get('client_batch_id')?.trim()
    return jsonResponse(buildSettlementErrors(batchId))
  }

  // ── zord-intelligence ──────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/v1/operations/summary') {
    return jsonResponse(operationsSummary())
  }
  if (method === 'GET' && pathname === '/v1/exceptions/summary') {
    return jsonResponse(exceptionsSummary())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/leakage') {
    const fromDate = url.searchParams.get('from_date')?.trim() || undefined
    const toDate = url.searchParams.get('to_date')?.trim() || undefined
    return jsonResponse(leakageKpi(fromDate, toDate))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/timeseries/leakage-exposure') {
    const granularity = url.searchParams.get('granularity')?.trim() || 'day'
    return jsonResponse(leakageExposureTimeseries(granularity))
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/ambiguity') {
    return jsonResponse(ambiguityKpi())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/ambiguity/heatmap') {
    return jsonResponse(ambiguityHeatmap())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/bubble-map') {
    return jsonResponse(bubbleMap())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/defensibility') {
    return jsonResponse(defensibilityKpi())
  }
  if (method === 'GET' && pathname === '/v1/intelligence/dashboard/patterns') {
    const batchId = url.searchParams.get('batch_id')
    return jsonResponse(patternsDashboard(batchId))
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
    return jsonResponse(buildIntelligenceBatches())
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
    return jsonResponse(evidencePacksList(new URLSearchParams({ batch_id: batchId })))
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
    return jsonResponse({
      evidence_pack_id: packId,
      intent_id: intentId(PRIMARY_BATCH, 0),
      timeline: [{ timestamp: '2026-06-01T12:00:00Z', event: 'Payment instruction received', node_id: 'n1' }],
    })
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

  return jsonResponse(notFound(pathname), 404)
}
