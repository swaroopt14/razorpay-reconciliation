export type IntentStatus = 'RECEIVED' | 'REJECTED_PREACC' | 'QUEUED_ACC' | 'CANONICALIZED'

export type IntentSource = 'API' | 'BATCH' | 'WEBHOOK'

export type IntentInstrument = 'BANK' | 'UPI' | 'NEFT' | 'IMPS' | 'RTGS'

export interface Intent {
  intent_id: string
  source: IntentSource
  amount: string
  currency: string
  instrument: IntentInstrument
  status: IntentStatus
  created_at: string
  error_code?: string
}

export interface IntentListResponse {
  items: Intent[]
  pagination: {
    page: number
    page_size: number
    total: number
  }
}

// Intent Detail Types
export type IntentType = 'PAYOUT' | 'COLLECT' | 'REFUND' | 'REVERSAL'

export type LifecycleStep =
  | 'RAW_STORED'
  | 'CANONICALIZED'
  | 'IDEMPOTENCY_CHECKED'
  | 'PUBLISHED'
  | 'VALIDATED'
  | 'REJECTED'

export interface LifecycleEvent {
  step: LifecycleStep
  time: string
  hash: string
}

export interface IntentDetail {
  intent_id: string
  status: IntentStatus
  source: IntentSource
  error_code?: string
  canonical: {
    intent_type: IntentType
    amount: {
      value: string
      currency: string
    }
    instrument: {
      kind: IntentInstrument
      account_token: string
    }
    purpose_code: string
    constraints?: {
      must_post_by?: string
    }
  }
  lifecycle: LifecycleEvent[]
  evidence: {
    raw_envelope_id: string
    canonical_snapshot: string
    outbox_event_id: string
  }
}
