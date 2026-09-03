export type FinanceReconResult =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'UNRESOLVED'
  | 'CONFLICTED'
  | 'VARIANCE'
  | 'ORPHAN'
  | string

export type FinanceException = {
  id: string
  run_id?: string
  entity_type: string
  entity_id: string
  status?: string
  reconciliation_result: FinanceReconResult
  reason: string
  expected_amount: number
  observed_amount: number
  variance_amount: number
  confidence: number
  evidence_ids?: string[]
  created_at?: string
}

export type FinanceSummary = {
  entity_counts?: Record<string, number>
  result_counts?: Record<string, number>
  exposure_minor: number
  exposure_by_reason?: Array<{ reason: string; count: number; exposure_minor: number }>
  currency?: string
  scored_count: number
  matched_count: number
}

export type FinanceCashPosition = {
  gross_captured_minor: number
  settlement_expected_net_minor: number
  bank_credited_proven_minor: number
  in_flight_minor: number
  unresolved_exposure_minor: number
  currency?: string
  as_of?: string
}

export type FinanceObservation = {
  source: string
  provider_status: string
  canonical_status: string
  source_event_id?: string
  source_hash?: string
  observed_at?: string
}

export type FinancePayment = {
  status: string
  provider_status: string
  payment_id: string
  amount_minor: number
  currency: string
  captured?: boolean
  method?: string
  order_id?: string
  provider?: string
  provider_created_at?: string
  notes?: Record<string, string>
  sources?: string[]
  observations?: FinanceObservation[]
  reconciliation?: {
    result: FinanceReconResult
    reason: string
    expected_amount: number
    observed_amount: number
    variance_amount: number
    confidence: number
    bank_credit_proven?: boolean
  }
  evidence_refs?: Record<string, unknown>
  financial_movement?: {
    payment: number | null
    settlement: number | null
    bank: number | null
    refund: number | null
  }
}

export type FinanceRefund = {
  refund_id: string
  payment_id: string
  amount_minor: number
  currency?: string
  provider_status?: string
}

export type FinanceSettlementLine = {
  settlement_id?: string
  payment_id?: string
  entity_id?: string
  line_type?: string
  amount_minor?: number
  fee_minor?: number
  tax_minor?: number
  on_hold?: boolean
  utr?: string
}

export type FinanceInvestigation = {
  id: string
  exception_id?: string
  entity_type?: string
  entity_id: string
  status: string
  root_cause: string
  recommendation?: string
  confidence: number
  financial_impact: number
  evidence_ids?: string[]
  hypotheses?: Array<{ claim: string; verdict: string }>
  issue?: string
}

export type FinanceReconRow = {
  payment_id: string
  settlement: boolean | null
  bank: boolean | null
  result: FinanceReconResult
  variance_amount: number
  reason?: string
}

export type FinanceEvaluation = {
  dataset_records: number
  reconciliation_rate: number
  exception_detection_rate: number
  exception_resolution_rate: number
  false_resolution_rate: number
  financial_accuracy: number
  evidence_grounding: number
}
