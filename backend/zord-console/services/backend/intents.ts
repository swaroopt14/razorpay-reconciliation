// Intent Service - Fetches data from zord-intent-engine
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

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
}

/**
 * Fetch list of intents from zord-intent-engine
 * Endpoint: GET http://localhost:8083/v1/intents
 */
export async function fetchIntents(params: IntentListParams = {}): Promise<IntentListResponse> {
  const { page = 1, page_size = 50, tenant_id, status, batch_id } = params

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
