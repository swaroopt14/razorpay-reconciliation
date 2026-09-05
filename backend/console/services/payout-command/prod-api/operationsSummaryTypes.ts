export type BatchCloseReadiness = {
  blocked_batch_count: number
  close_ready_batch_count: number
  blocked_batch_ids?: string[]
  close_ready_batch_ids?: string[]
}

export type OperationsInsightItem = {
  title: string
  detail: string
  severity?: 'low' | 'medium' | 'high' | string
  case_count?: number
  href?: string
}

export type OperationsSummaryResolved = {
  data_available: true
  tenant_id: string
  computed_at?: string
  snapshot_id?: string
  window_start?: string
  window_end?: string
  batch_id?: string
  settlement_confirmation_coverage_pct: number
  confirmed_matched_value_minor: number | string
  total_intended_amount_minor: number | string
  open_exception_queue_count: number
  open_exception_queue_value_minor: number | string
  batch_close_readiness: BatchCloseReadiness
  operations_insights?: OperationsInsightItem[]
}

export type OperationsSummaryResponse =
  | OperationsSummaryResolved
  | { data_available: false; reason?: string; tenant_id?: string }
