// Envelope Service - Fetches raw envelope data from zord-vault-journal
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

export interface BackendEnvelope {
  envelope_id: string
  tenant_id: string
  source: string
  source_system?: string
  idempotency_key?: string
  payload_hash: string
  object_ref: string
  parse_status: string
  signature_status?: string
  received_at: string
}

export interface EnvelopeListParams {
  tenant_id?: string
  page?: number
  page_size?: number
}

export interface EnvelopeListResponse {
  items: BackendEnvelope[]
  pagination: {
    page: number
    page_size: number
    total: number
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    return await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch raw envelopes from zord-vault-journal
 * Endpoint: GET http://localhost:8081/v1/envelopes
 * Note: This endpoint may need to be added to the backend
 */
export async function fetchEnvelopes(params: EnvelopeListParams = {}): Promise<EnvelopeListResponse> {
  const { page = 1, page_size = 50, tenant_id } = params

  const queryParams = new URLSearchParams()
  queryParams.set('page', String(page))
  queryParams.set('page_size', String(page_size))
  if (tenant_id) queryParams.set('tenant_id', tenant_id)

  const primaryUrl = buildUrl('VAULT_JOURNAL', BACKEND_SERVICES.VAULT_JOURNAL.ENDPOINTS.ENVELOPES)
  const fallbackUrl = buildUrl('EDGE', BACKEND_SERVICES.VAULT_JOURNAL.ENDPOINTS.ENVELOPES)
  const urls = [`${primaryUrl}?${queryParams.toString()}`, `${fallbackUrl}?${queryParams.toString()}`]

  try {
    let lastError: Error | null = null
    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url)
        if (!response.ok) {
          lastError = new Error(`Failed to fetch envelopes: ${response.status} ${response.statusText}`)
          continue
        }
        const data = await response.json()
        return data
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error('Request timeout while fetching envelopes')
          continue
        }
        lastError = error instanceof Error ? error : new Error('Failed to fetch envelopes')
      }
    }
    throw lastError ?? new Error('Failed to fetch envelopes')
  } catch (error) {
    throw error
  }
}

/**
 * Fetch single envelope by ID from zord-vault-journal
 * Endpoint: GET http://localhost:8081/v1/envelopes/:id
 * Note: This endpoint may need to be added to the backend
 */
export async function fetchEnvelopeById(envelopeId: string): Promise<BackendEnvelope | null> {
  const primaryUrl = buildUrl(
    'VAULT_JOURNAL',
    BACKEND_SERVICES.VAULT_JOURNAL.ENDPOINTS.ENVELOPE_BY_ID(envelopeId)
  )
  const fallbackUrl = buildUrl('EDGE', BACKEND_SERVICES.VAULT_JOURNAL.ENDPOINTS.ENVELOPE_BY_ID(envelopeId))
  const urls = [primaryUrl, fallbackUrl]

  try {
    let lastError: Error | null = null
    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url)
        if (response.status === 404) {
          continue
        }
        if (!response.ok) {
          lastError = new Error(`Failed to fetch envelope: ${response.status} ${response.statusText}`)
          continue
        }
        const data = await response.json()
        return data
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error('Request timeout while fetching envelope')
          continue
        }
        lastError = error instanceof Error ? error : new Error('Failed to fetch envelope')
      }
    }
    if (lastError) throw lastError
    return null
  } catch (error) {
    throw error
  }
}
