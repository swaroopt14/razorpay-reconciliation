// Tenant Service - Fetches tenant data from zord-edge
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

export interface BackendTenant {
  tenant_id: string
  tenant_name: string
  workspace_code: string
  api_key?: string // Not returned by backend (only hash is stored)
  status: 'ACTIVE' | 'DISABLED'
  created_at: string
}

export interface TenantListResponse {
  items: BackendTenant[]
  pagination: {
    page: number
    page_size: number
    total: number
  }
}

/**
 * Fetch tenants from zord-edge
 * Endpoint: GET http://localhost:8080/v1/tenants
 * 
 * WHY we build query params dynamically:
 * The Go handler supports optional filters (page, page_size, status).
 * We only append params that are provided, keeping the URL clean.
 */
export async function fetchTenants(params: {
  page?: number
  page_size?: number
  status?: string
} = {}): Promise<TenantListResponse> {
  const { page = 1, page_size = 50, status } = params

  const queryParams = new URLSearchParams()
  queryParams.set('page', String(page))
  queryParams.set('page_size', String(page_size))
  if (status) queryParams.set('status', status)

  const url = buildUrl('EDGE', BACKEND_SERVICES.EDGE.ENDPOINTS.TENANTS)
  const fullUrl = `${url}?${queryParams.toString()}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(fullUrl, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Failed to fetch tenants: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Edge service not responding')
    }
    throw error
  }
}

/**
 * Fetch single tenant by ID
 * Endpoint: GET http://localhost:8080/v1/tenants/:id
 * 
 * WHY we return null on 404:
 * The Next.js API route checks for null and returns a proper 404 to the frontend.
 * This is the same pattern used in fetchIntentById() and fetchEnvelopeById().
 */
export async function fetchTenantById(tenantId: string): Promise<BackendTenant | null> {
  
  const url = buildUrl('EDGE', BACKEND_SERVICES.EDGE.ENDPOINTS.TENANT_BY_ID(tenantId))

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
      throw new Error(`Failed to fetch tenant: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Edge service not responding')
    }
    throw error
  }
}

/**
 * Register a new tenant
 * Endpoint: POST http://localhost:8080/v1/tenantReg
 */
export async function registerTenant(merchantName: string): Promise<{
  tenant_id: string
  api_key: string
}> {
  const url = buildUrl('EDGE', BACKEND_SERVICES.EDGE.ENDPOINTS.TENANT_REGISTER)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({ name: merchantName }),
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let data: any = null
      try {
        data = JSON.parse(text)
      } catch {
        // ignore
      }

      const details = typeof data?.details === 'string' ? data.details : ''
      if (details.includes('tenants_tenant_name_key') || details.toLowerCase().includes('duplicate key')) {
        throw new Error('TENANT_NAME_EXISTS')
      }

      const errMsg =
        typeof data?.error === 'string'
          ? data.error
          : typeof data?.message === 'string'
            ? data.message
            : text || response.statusText
      throw new Error(`Failed to register tenant: ${response.status} ${errMsg}`)
    }

    const data = await response.json()
    return {
      tenant_id: data.TenantId,
      api_key: data.APIKEY,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Edge service not responding')
    }
    throw error
  }
}
