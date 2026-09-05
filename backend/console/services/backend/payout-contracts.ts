// Payout Contracts Service - Fetches data from zord-relay (port 8082)
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

export interface BackendPayoutContract {
  contract_id: string
  tenant_id: string
  intent_id: string
  envelope_id: string
  contract_payload: string // base64-encoded payload (as currently returned by backend)
  contract_hash: string
  status: string
  created_at: string
  trace_id?: string
}

export interface PayoutContractListResponse {
  items: BackendPayoutContract[]
  // Pagination is optional because the backend response shape may vary.
  pagination?: {
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

function normalizeContractsResponse(data: unknown): PayoutContractListResponse {
  if (Array.isArray(data)) {
    return { items: data as BackendPayoutContract[] }
  }

  if (data && typeof data === 'object') {
    const obj = data as any
    if (Array.isArray(obj.items)) {
      return { items: obj.items as BackendPayoutContract[], pagination: obj.pagination }
    }
    // Some backends return a single contract object from list endpoints.
    if (typeof obj.contract_id === 'string') {
      return { items: [obj as BackendPayoutContract] }
    }
  }

  return { items: [] }
}

/**
 * Fetch payout contracts from zord-relay
 * Endpoint: GET http://localhost:8082/v1/contracts
 */
export async function fetchPayoutContracts(): Promise<PayoutContractListResponse> {
  const urls = [
    buildUrl('RELAY', BACKEND_SERVICES.RELAY.ENDPOINTS.CONTRACTS),
    buildUrl('CONTRACTS', BACKEND_SERVICES.CONTRACTS.ENDPOINTS.CONTRACTS),
  ]

  try {
    let lastError: Error | null = null
    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url)
        if (!response.ok) {
          lastError = new Error(`Failed to fetch payout contracts: ${response.status} ${response.statusText}`)
          continue
        }
        const data = await response.json()
        return normalizeContractsResponse(data)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error('Request timeout while fetching payout contracts')
          continue
        }
        lastError = error instanceof Error ? error : new Error('Failed to fetch payout contracts')
      }
    }
    throw lastError ?? new Error('Failed to fetch payout contracts')
  } catch (error) {
    throw error
  }
}

/**
 * Fetch payout contract by id from zord-relay (best-effort).
 * Endpoint: GET http://localhost:8082/v1/contracts/:id
 */
export async function fetchPayoutContractById(contractId: string): Promise<BackendPayoutContract | null> {
  const urls = [
    buildUrl('RELAY', BACKEND_SERVICES.RELAY.ENDPOINTS.CONTRACT_BY_ID(contractId)),
    buildUrl('CONTRACTS', BACKEND_SERVICES.CONTRACTS.ENDPOINTS.CONTRACT_BY_ID(contractId)),
  ]

  try {
    let lastError: Error | null = null
    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url)
        if (response.status === 404) continue
        if (!response.ok) {
          lastError = new Error(`Failed to fetch payout contract: ${response.status} ${response.statusText}`)
          continue
        }
        const data = await response.json()
        if (data && typeof data === 'object' && typeof (data as any).contract_id === 'string') {
          return data as BackendPayoutContract
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error('Request timeout while fetching payout contract')
          continue
        }
        lastError = error instanceof Error ? error : new Error('Failed to fetch payout contract')
      }
    }
    if (lastError) throw lastError
    return null
  } catch (error) {
    throw error
  }
}
