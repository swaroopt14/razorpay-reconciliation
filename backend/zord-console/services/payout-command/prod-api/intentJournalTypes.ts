/** Raw shapes from zord-intent-engine journal split endpoints (port 8083). */

export type IntentJournalBatchIdItem = {
  batch_id: string
  /**
   * Sum of payment_intent amounts for the batch in major INR units
   * (intent-engine batch-ids). Convert exactly once at the journal adapter
   * via `resolveBatchTotalAmountMinor` — never store as ambiguous `totalValue`.
   */
  total_amount?: number
  /** Preferred when present — already minor units (paise). */
  total_amount_minor?: number
}

export type IntentJournalBatchIdsResponse = {
  items: IntentJournalBatchIdItem[]
}

/**
 * CON-P0-10 — live payment-intents contract includes authoritative governance /
 * lifecycle fields. Console must map these; never invent Ready for Dispatch.
 */
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
  status?: string | null
  governance_state?: string | null
  governance_decision?: string | null
  intent_lifecycle_state?: string | null
  business_state?: string | null
  /** Prefer `governance_reason_codes`; `reason_codes` is an alias from lite API. */
  reason_codes?: unknown
  governance_reason_codes?: unknown
  score_reason_codes?: unknown
  duplicate_reason_code?: string | null
  remediability?: string | null
  duplicate_risk_flag?: boolean | null
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
