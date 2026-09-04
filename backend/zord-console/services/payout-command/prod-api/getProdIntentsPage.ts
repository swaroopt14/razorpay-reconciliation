import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiIntentRow, ApiListResponse } from './prodApiTypes'

export const PROD_INTENTS_LIST_PATH = '/api/prod/intents'
export const PROD_INTENTS_DEFAULT_QUERY = 'page=1&page_size=120'

export async function getProdIntentsPage(
  query: string = PROD_INTENTS_DEFAULT_QUERY,
): Promise<ApiListResponse<ApiIntentRow> | null> {
  return fetchProdJsonGet<ApiListResponse<ApiIntentRow>>(`${PROD_INTENTS_LIST_PATH}?${query}`)
}
