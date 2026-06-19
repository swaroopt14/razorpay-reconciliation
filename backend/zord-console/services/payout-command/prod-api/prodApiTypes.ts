/** Response shapes for Next `/api/prod/*` proxies (ingestion admin API). */

export type ApiListResponse<T> = {
  items?: T[]
  pagination?: {
    page?: number
    page_size?: number
    total?: number
  }
}

export type ApiOverviewResponse = {
  kpis?: {
    intents_received_24h?: number
    p95_ingest_latency_ms?: number
    slo?: {
      success_rate_pct?: number
    }
  }
}

export type ApiIntentRow = {
  intent_id: string
  amount?: string | number
  currency?: string
  instrument?: string
  source?: string
  status?: string
  created_at?: string
  envelope_id?: string
  tenant_id?: string
  /** When intent-engine returns batch scope (intelligence / ingest correlation). */
  batch_id?: string
}

/** Payload from GET `/api/prod/intents/:id` (intent-engine mirror + extras). */
export type ApiProdIntentDetailPayload = {
  intent_id?: string
  batch_id?: string
  status?: string
  source?: string
  created_at?: string
  confidence_score?: number
  deadline_at?: string
  canonical?: {
    intent_type?: string
    amount?: {
      value?: string | number
      currency?: string
    }
    instrument?: {
      kind?: string
    }
    constraints?: Record<string, unknown>
  }
  beneficiary?: Record<string, unknown> | { name?: string }
  evidence?: {
    raw_envelope_id?: string
  }
  envelope_id?: string
  pii_tokens?: Record<string, unknown>
}

/** @deprecated Prefer `ApiProdIntentDetailPayload` — kept for older imports. */
export type ApiIntentDetail = ApiProdIntentDetailPayload

export type ApiEnvelopeRow = {
  envelope_id: string
  source?: string
  parse_status?: string
  object_ref?: string
}

export type ApiEnvelopeDetail = {
  envelope_id?: string
  source?: string
  parse_status?: string
  object_ref?: string
}

export type ApiDlqRow = {
  dlq_id: string
  envelope_id?: string
  /** Same ingest batch key as intents / intelligence `batch_id` when present. */
  client_batch_ref?: string
  batch_id?: string
  source_row_num?: number
  tenant_id?: string
  stage?: string
  reason_code?: string
  error_detail?: string
  dlq_status?: string
  intent_context?: Record<string, unknown> | null
  trace_id?: string
  replayable?: boolean
  created_at?: string
}

export type ApiPayoutContract = {
  contract_id: string
  tenant_id?: string
  intent_id?: string
  envelope_id?: string
  contract_payload?: string
  trace_id?: string
}

export type ApiTenant = {
  tenant_id: string
  tenant_name?: string
}
