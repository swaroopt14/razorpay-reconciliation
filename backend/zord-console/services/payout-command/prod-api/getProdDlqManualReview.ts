import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiDlqRow, ApiListResponse } from './prodApiTypes'

export const PROD_DLQ_MANUAL_REVIEW_PATH = '/api/prod/dlq/manual-review'

export async function getProdDlqManualReview(): Promise<ApiListResponse<ApiDlqRow> | null> {
  return fetchProdJsonGet<ApiListResponse<ApiDlqRow>>(PROD_DLQ_MANUAL_REVIEW_PATH)
}
