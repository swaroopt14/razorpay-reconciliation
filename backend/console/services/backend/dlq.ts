// DLQ Service - Fetches Dead Letter Queue data from zord-intent-engine
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

export interface BackendDLQItem {
  dlq_id: string
  tenant_id: string
  envelope_id: string
  client_batch_ref?: string
  batch_id?: string
  source_row_num?: number
  stage: string
  reason_code: string
  error_detail?: string
  dlq_status?: string
  intent_context?: Record<string, unknown> | null
  trace_id?: string
  replayable: boolean
  created_at: string
}

export interface DLQListParams {
  tenant_id?: string
}

function tenantHeaders(tenant_id?: string): Record<string, string> {
  const tid = tenant_id?.trim()
  if (!tid) return {}
  return {
    'x-tenant-id': tid,
    'tenant-id': tid,
    tenant_id: tid,
  }
}

async function fetchDLQListFromEndpoint(endpoint: string, params: DLQListParams = {}): Promise<BackendDLQItem[]> {
  const { tenant_id } = params

  const queryParams = new URLSearchParams()
  if (tenant_id) queryParams.set('tenant_id', tenant_id)

  const url = buildUrl('INTENT_ENGINE', endpoint)
  const fullUrl = queryParams.toString() ? `${url}?${queryParams.toString()}` : url

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(fullUrl, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      headers: tenantHeaders(tenant_id),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return []
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      return []
    }

    if (Array.isArray(data)) return data as BackendDLQItem[]
    if (data && typeof data === 'object') {
      const items = (data as { items?: unknown }).items
      if (Array.isArray(items)) return items as BackendDLQItem[]
    }
    return []
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      return []
    }
    return []
  }
}

/**
 * Fetch DLQ items from zord-intent-engine
 * Endpoint: GET http://localhost:8083/v1/dlq
 */
export async function fetchDLQItems(params: DLQListParams = {}): Promise<BackendDLQItem[]> {
  return fetchDLQListFromEndpoint(BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.DLQ, params)
}

/**
 * Fetch DLQ manual-review rows from zord-intent-engine
 * Endpoint: GET http://localhost:8083/v1/dlq/manual-review
 */
export async function fetchDLQManualReviewItems(params: DLQListParams = {}): Promise<BackendDLQItem[]> {
  return fetchDLQListFromEndpoint(BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.DLQ_MANUAL_REVIEW, params)
}

/** Tenant-scoped terminal DLQ count from intent-engine. */
export async function fetchDLQTerminalCount(params: DLQListParams = {}): Promise<number | null> {
  const { tenant_id } = params
  const queryParams = new URLSearchParams()
  if (tenant_id) queryParams.set('tenant_id', tenant_id)
  const url = buildUrl('INTENT_ENGINE', BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.DLQ_TERMINAL_COUNT)
  const fullUrl = queryParams.toString() ? `${url}?${queryParams.toString()}` : url

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(fullUrl, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      headers: tenantHeaders(tenant_id),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!response.ok) return null
    const data = (await response.json()) as { count?: unknown }
    const count = typeof data.count === 'number' ? data.count : Number(data.count)
    return Number.isFinite(count) ? count : null
  } catch {
    clearTimeout(timeoutId)
    return null
  }
}

/**
 * Fetch single DLQ item by ID
 * Endpoint: GET http://localhost:8083/v1/dlq/:id
 * FIXED: Now uses dedicated backend endpoint instead of fetching all and filtering
 */
export async function fetchDLQItemById(dlqId: string): Promise<BackendDLQItem | null> {
  const url = buildUrl(
    'INTENT_ENGINE',
    BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.DLQ_BY_ID(dlqId)
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
      throw new Error(`Failed to fetch DLQ item: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Intent engine not responding')
    }
    throw error
  }
}
