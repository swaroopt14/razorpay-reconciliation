import { fetchProdJsonGetWithMeta, type ProdJsonGetResult } from './fetchProdJsonGet'
import type {
  IntentJournalBatchIdsResponse,
  IntentJournalDlqItemsResponse,
  IntentJournalPaymentIntentsResponse,
} from './intentJournalTypes'

export const JOURNAL_BATCH_IDS_BFF = '/api/prod/intents/batch-ids'
export const JOURNAL_PAYMENT_INTENTS_BFF = '/api/prod/intents/payment-intents'
export const JOURNAL_DLQ_ITEMS_BFF = '/api/prod/intents/dlq-items'

function withBatchId(path: string, batchId: string): string {
  const params = new URLSearchParams({ batch_id: batchId.trim() })
  return `${path}?${params.toString()}`
}

export async function getIntentJournalBatchIdsForSession(): Promise<
  ProdJsonGetResult<IntentJournalBatchIdsResponse>
> {
  return fetchProdJsonGetWithMeta<IntentJournalBatchIdsResponse>(JOURNAL_BATCH_IDS_BFF)
}

export async function getIntentJournalPaymentIntentsForSession(
  batchId: string,
): Promise<ProdJsonGetResult<IntentJournalPaymentIntentsResponse>> {
  const bid = batchId.trim()
  if (!bid) return { data: null, ok: false, status: 400, url: JOURNAL_PAYMENT_INTENTS_BFF }
  return fetchProdJsonGetWithMeta<IntentJournalPaymentIntentsResponse>(withBatchId(JOURNAL_PAYMENT_INTENTS_BFF, bid))
}

export async function getIntentJournalDlqItemsForSession(
  batchId: string,
): Promise<ProdJsonGetResult<IntentJournalDlqItemsResponse>> {
  const bid = batchId.trim()
  if (!bid) return { data: null, ok: false, status: 400, url: JOURNAL_DLQ_ITEMS_BFF }
  return fetchProdJsonGetWithMeta<IntentJournalDlqItemsResponse>(withBatchId(JOURNAL_DLQ_ITEMS_BFF, bid))
}
