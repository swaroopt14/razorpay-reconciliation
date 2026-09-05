export type ExceptionsSummaryResolved = {
  data_available: true
  tenant_id: string
  computed_at?: string
  batch_id?: string
  open_financial_exception_count: number
  open_financial_exception_value_minor: number | string
  oldest_unresolved_exception_at?: string
  by_bucket?: {
    unmatched_count?: number
    under_settlement_count?: number
    orphan_count?: number
    reversal_count?: number
    unresolved_count?: number
  }
}

export type ExceptionsSummaryResponse =
  | ExceptionsSummaryResolved
  | { data_available: false; reason?: string; tenant_id?: string }
