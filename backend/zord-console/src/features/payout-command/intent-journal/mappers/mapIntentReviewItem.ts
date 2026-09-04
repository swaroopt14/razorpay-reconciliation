import type { IntentJournalDlqItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalFailureRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { mapDlqToFailureRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import type { ApiDlqRow } from '@/services/payout-command/prod-api/prodApiTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

function toApiDlqRow(row: IntentJournalDlqItem, selectedBatchId?: string): ApiDlqRow {
  const batchFromIngest = apiTrimmedString(row.client_batch_ref) || apiTrimmedString(row.batch_id)
  return {
    dlq_id: row.dlq_id,
    client_batch_ref: row.client_batch_ref,
    batch_id: batchFromIngest || apiTrimmedString(selectedBatchId) || row.batch_id,
    source_row_num: row.source_row_num,
    tenant_id: row.tenant_id,
    stage: row.stage,
    reason_code: row.reason_code,
    error_detail: row.error_detail,
    dlq_status: row.dlq_status,
    intent_context: row.intent_context,
    replayable: row.replayable,
    created_at: row.created_at,
  }
}

/** Map dlq-items / manual-review list item → Review Items table row. */
export function mapDlqListItemToReviewRow(
  row: IntentJournalDlqItem,
  selectedBatchId?: string,
): JournalFailureRow {
  const manualReview = apiTrimmedString(row.dlq_status) === 'NEEDS_MANUAL_REVIEW'
  return mapDlqToFailureRow(toApiDlqRow(row, selectedBatchId), {
    inManualReviewQueue: manualReview || undefined,
  })
}
