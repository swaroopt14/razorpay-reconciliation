/** Raw shapes from zord-intent-engine journal split endpoints (port 8083). */

export type IntentJournalBatchIdItem = {
  batch_id: string
  /** Sum of payment_intent amounts for the batch (major INR units, from intent-engine batch-ids). */
  total_amount?: number
}

export type IntentJournalBatchIdsResponse = {
  items: IntentJournalBatchIdItem[]
}

export type IntentJournalPaymentIntentItem = {
  tenant_id?: string
  amount?: string | number
  currency?: string
  intended_execution_at?: string
  provider_hint?: string
  rail_hint?: string
  intent_quality_score?: number | null
  confidence_score?: number | null
  mapping_confidence_score?: number | null
  /** Batch-level aggregate confidence (same value on every intent in the batch). */
  aggregate_confidence_score?: number | null
  intent_id?: string
  batch_id?: string
  client_payout_ref?: string
  client_batch_ref?: string
  source_row_num?: number
  beneficiary_type?: string | null
  beneficiary?: Record<string, unknown> | null
}

export type IntentJournalPaymentIntentsResponse = {
  items: IntentJournalPaymentIntentItem[]
  /** `pagination.total` is the authoritative batch instruction count for journal KPIs. */
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}

export type IntentJournalDlqItem = {
  dlq_id: string
  tenant_id?: string
  stage?: string
  reason_code?: string
  error_detail?: string
  dlq_status?: string
  intent_context?: Record<string, unknown> | null
  replayable?: boolean
  client_batch_ref?: string
  batch_id?: string
  source_row_num?: number
  created_at?: string
}

export type IntentJournalDlqItemsResponse = {
  items: IntentJournalDlqItem[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}
