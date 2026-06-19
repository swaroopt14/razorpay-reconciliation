import type { BackendDLQItem } from './dlq'

/** Normalized DLQ row returned by console BFF routes. */
export function mapBackendDlqForClient(item: BackendDLQItem) {
  return {
    dlq_id: item.dlq_id,
    envelope_id: item.envelope_id,
    client_batch_ref: item.client_batch_ref,
    batch_id: item.batch_id,
    source_row_num: item.source_row_num,
    stage: item.stage,
    reason_code: item.reason_code,
    error_detail: item.error_detail,
    replayable: item.replayable,
    created_at: item.created_at,
    tenant_id: item.tenant_id,
    dlq_status: item.dlq_status,
    intent_context: item.intent_context,
    trace_id: item.trace_id,
  }
}
