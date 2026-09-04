import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiListResponse, ApiTenant } from './prodApiTypes'

export const PROD_TENANTS_LIST_PATH = '/api/prod/tenants'
export const PROD_TENANTS_DEFAULT_QUERY = 'page=1&page_size=200'

export async function getProdTenantsPage(
  query: string = PROD_TENANTS_DEFAULT_QUERY,
): Promise<ApiListResponse<ApiTenant> | null> {
  return fetchProdJsonGet<ApiListResponse<ApiTenant>>(`${PROD_TENANTS_LIST_PATH}?${query}`)
}
