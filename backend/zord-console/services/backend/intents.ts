// Intent Service - Fetches data from zord-intent-engine
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

/**
 * R-02: zord-intent-engine's /internal/intents/* routes require a signed
 * internal-service token (X-Internal-Service-Token), not an end-user JWT —
 * these are cross-tenant reads with no single tenant to scope to, so they
 * can never be protected by the per-tenant session auth used elsewhere.
 * Must match INTERNAL_SERVICE_TOKEN configured on zord-intent-engine.
 */
function internalServiceHeaders(): HeadersInit {
  const token = process.env.INTERNAL_SERVICE_TOKEN
  return token ? { 'X-Internal-Service-Token': token } : {}
}

export interface BackendIntent {
  intent_id: string
  envelope_id: string
  tenant_id: string
  intent_type: string
  canonical_version: string
  schema_version?: string
  amount: string | number
  currency: string
  /** Optional ingest / intelligence batch correlation when engine exposes it. */
  batch_id?: string
  intended_execution_at?: string
  /** Original source row index when available. */
  source_row_num?: number
  /** Client-provided refs from canonical intent. */
  client_payout_ref?: string
  client_batch_ref?: string
  /** Optional provider / rail hints emitted by ingest + routing. */
  provider_hint?: string
  intent_quality_score?: number
  aggregate_confidence_score?: number
  deadline_at?: string
  constraints?: Record<string, unknown>
  beneficiary_type?: string
  pii_tokens?: Record<string, unknown>
  beneficiary?: Record<string, unknown>
  status: string
  confidence_score?: number
  created_at: string
}

export interface IntentListResponse {
  items: BackendIntent[]
  pagination: {
    page: number
    page_size: number
    total: number
  }
}

export interface IntentListParams {
  page?: number
  page_size?: number
  tenant_id?: string
  status?: string
  batch_id?: string
  /**
   * R-01: /v1/intents is behind auth.Protect on zord-intent-engine — every
   * caller must present the signed-in session's JWT, or the request 401s
   * before tenant_id is even checked. Callers MUST resolve this via
   * resolveProxyForwardAuthorization (see services/auth/resolvePayoutTenant.server)
   * and pass it through; omitting it is not a degraded mode, it's a guaranteed 401.
   */
  authorization?: string
}

/**
 * Fetch list of intents from zord-intent-engine
 * Endpoint: GET http://localhost:8083/v1/intents
 */
export async function fetchIntents(params: IntentListParams = {}): Promise<IntentListResponse> {
  const { page = 1, page_size = 50, tenant_id, status, batch_id, authorization } = params

  const queryParams = new URLSearchParams()
  queryParams.set('page', String(page))
  queryParams.set('page_size', String(page_size))
  if (tenant_id) queryParams.set('tenant_id', tenant_id)
  if (status) queryParams.set('status', status)
  if (batch_id) queryParams.set('batch_id', batch_id)

  const url = buildUrl('INTENT_ENGINE', BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.INTENTS)
  const fullUrl = `${url}?${queryParams.toString()}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  const empty = (): IntentListResponse => ({
    items: [],
    pagination: { page, page_size, total: 0 },
  })

  try {
    const response = await fetch(fullUrl, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      headers: {
        ...DEFAULT_FETCH_OPTIONS.headers,
        ...(authorization ? { Authorization: authorization } : {}),
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return empty()
    }

    let data: Partial<IntentListResponse> & Record<string, unknown>
    try {
      data = (await response.json()) as Partial<IntentListResponse> & Record<string, unknown>
    } catch {
      return empty()
    }
    const items = Array.isArray(data.items) ? data.items : []
    const p = data.pagination
    const pagination =
      p && typeof p.page === 'number' && typeof p.page_size === 'number' && typeof p.total === 'number'
        ? p
        : { page, page_size, total: items.length }
    return { items, pagination }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      return empty()
    }
    return empty()
  }
}

/**
 * Fetch the platform-wide total intent count across all tenants.
 * Internal-only endpoint — not exposed through the API gateway.
 * Endpoint: GET http://localhost:8083/internal/intents/count
 */
export async function fetchIntentsTotalCount(): Promise<number> {
  const url = buildUrl('INTENT_ENGINE', BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.INTENTS_COUNT_ALL)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      headers: { ...DEFAULT_FETCH_OPTIONS.headers, ...internalServiceHeaders() },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) return 0

    const data = (await response.json()) as { total?: number }
    return typeof data.total === 'number' ? data.total : 0
  } catch {
    clearTimeout(timeoutId)
    return 0
  }
}

/**
 * Fetch a single intent by envelope_id, searching across all tenants.
 * Internal-only endpoint — not exposed through the API gateway. Used only as
 * a fallback when the envelope_id's owning tenant isn't known by the caller.
 * Endpoint: GET http://localhost:8083/internal/intents/by-envelope
 */
export async function fetchIntentByEnvelopeAnyTenant(
  envelopeId: string
): Promise<BackendIntent | null> {
  const url = buildUrl(
    'INTENT_ENGINE',
    BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.INTENT_BY_ENVELOPE_ANY_TENANT(envelopeId)
  )

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      headers: { ...DEFAULT_FETCH_OPTIONS.headers, ...internalServiceHeaders() },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) return null

    return (await response.json()) as BackendIntent
  } catch {
    clearTimeout(timeoutId)
    return null
  }
}

/**
 * Fetch single intent by ID from zord-intent-engine
 * Endpoint: GET http://localhost:8083/v1/intents/:id
 */
export async function fetchIntentById(intentId: string): Promise<BackendIntent | null> {
  const url = buildUrl(
    'INTENT_ENGINE',
    BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.INTENT_BY_ID(intentId)
  )

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      return null
    }

    try {
      const data = (await response.json()) as BackendIntent
      return data
    } catch {
      return null
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      return null
    }
    return null
  }
}
