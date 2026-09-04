// Types for Error Monitor page

export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type ErrorStage = 
  | 'SCHEMA_VALIDATION'
  | 'PII_ENCLAVE'
  | 'CONSTRAINT_CHECKS'
  | 'SIGNATURE_VERIFICATION'
  | 'IDEMPOTENCY_CHECK'
  | 'BENEFICIARY_VALIDATION'
  | 'AMOUNT_SANITY'
  | 'DEADLINE_CONSTRAINTS'

export interface ErrorSummary {
  total_failures_24h: number
  dlq_created_24h: number
  replayable_24h: number
  non_replayable_24h: number
  
  // Trend vs previous 24h
  total_trend_percent?: number
  dlq_trend_percent?: number
}

export interface StageBreakdown {
  stage: ErrorStage
  display_name: string
  count: number
  percentage: number
  replayable: boolean
  severity: ErrorSeverity
}

export interface ServiceBreakdown {
  service: string
  display_name: string
  count: number
  percentage: number
  owner_team: string
  runbook_priority: 'P1' | 'P2' | 'P3'
}

export interface RecentError {
  error_id: string
  timestamp: string
  envelope_id: string
  dlq_id: string
  stage: ErrorStage
  reason_code: string
  reason_detail: string
  tenant_id: string
  tenant_name: string
  service: string
  replayable: boolean
  severity: ErrorSeverity
}

export interface ErrorMonitorResponse {
  summary: ErrorSummary
  stage_breakdown: StageBreakdown[]
  service_breakdown: ServiceBreakdown[]
  recent_errors: RecentError[]
  
  // Filters applied
  filters: {
    time_range: '1h' | '6h' | '24h' | '7d'
    tenant_id?: string
    severity?: ErrorSeverity
    stage?: ErrorStage
  }
}
