// Contracts Service - API calls for runtime contract instances
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'
import { ContractInstance, ContractInstanceListResponse, DecodedContractPayload } from '@/types/contract-instance'

export interface ContractsListParams {
  status?: string
  limit?: number
  offset?: number
  tenant_id?: string
}

/**
 * Fetch list of contract instances from runtime service
 */
export async function fetchContracts(params?: ContractsListParams): Promise<ContractInstanceListResponse> {
  const baseUrl = BACKEND_SERVICES.CONTRACTS.BASE_URL
  const contractsEndpoint = BACKEND_SERVICES.CONTRACTS.ENDPOINTS.CONTRACTS
  
  // Build query string from params
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.append('status', params.status)
  if (params?.limit) searchParams.append('limit', params.limit.toString())
  if (params?.offset) searchParams.append('offset', params.offset.toString())
  if (params?.tenant_id) searchParams.append('tenant_id', params.tenant_id)
  
  const queryString = searchParams.toString()
  const url = `${baseUrl}${contractsEndpoint}${queryString ? `?${queryString}` : ''}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Contracts API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to fetch contracts')
  }
}

/**
 * Fetch single contract instance by ID
 */
export async function fetchContractById(contractId: string): Promise<ContractInstance> {
  const url = buildUrl('CONTRACTS', BACKEND_SERVICES.CONTRACTS.ENDPOINTS.CONTRACT_BY_ID(contractId))

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Contract API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Failed to fetch contract ${contractId}`)
  }
}

/**
 * Decode base64 contract payload
 */
export function decodeContractPayload(base64Payload: string): DecodedContractPayload {
  try {
    const decoded = atob(base64Payload)
    return JSON.parse(decoded)
  } catch (error) {
    throw new Error('Failed to decode contract payload')
  }
}