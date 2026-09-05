import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiProdIntentDetailPayload } from './prodApiTypes'
import { PROD_INTENTS_LIST_PATH } from './getProdIntentsPage'

export async function getProdIntentDetail(intentId: string): Promise<ApiProdIntentDetailPayload | null> {
  const path = `${PROD_INTENTS_LIST_PATH}/${encodeURIComponent(intentId)}`
  return fetchProdJsonGet<ApiProdIntentDetailPayload>(path)
}
