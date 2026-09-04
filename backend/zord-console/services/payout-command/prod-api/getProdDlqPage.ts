import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiDlqRow, ApiListResponse } from './prodApiTypes'

export const PROD_DLQ_LIST_PATH = '/api/prod/dlq'
export const PROD_DLQ_DEFAULT_QUERY = 'page=1&page_size=100'
export const PROD_DLQ_PAGE_CHUNK = 500

export async function getProdDlqPage(query: string = PROD_DLQ_DEFAULT_QUERY): Promise<ApiListResponse<ApiDlqRow> | null> {
  return fetchProdJsonGet<ApiListResponse<ApiDlqRow>>(`${PROD_DLQ_LIST_PATH}?${query}`)
}

/** Loads every DLQ row across upstream pages (journal tables must not stop at 500). */
export async function getAllProdDlqRows(pageSize = PROD_DLQ_PAGE_CHUNK): Promise<ApiDlqRow[]> {
  const first = await getProdDlqPage(`page=1&page_size=${pageSize}`)
  const firstItems = first?.items ?? []
  if (firstItems.length === 0) return []

  const total = first?.pagination?.total ?? firstItems.length
  if (firstItems.length >= total) return firstItems

  const all = [...firstItems]
  const pagesNeeded = Math.ceil(total / pageSize)
  for (let page = 2; page <= pagesNeeded; page++) {
    const res = await getProdDlqPage(`page=${page}&page_size=${pageSize}`)
    const items = res?.items ?? []
    if (items.length === 0) break
    all.push(...items)
  }
  return all
}
