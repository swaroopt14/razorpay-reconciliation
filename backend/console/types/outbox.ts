// Types for Outbox / Event Bus Health page (Fintech-Grade)

export type OutboxStatus = 'PENDING' | 'RETRYING' | 'DELIVERED' | 'FAILED' | 'DEAD_LETTER'
export type EventBusHealth = 'OK' | 'DEGRADED' | 'DOWN'
export type OverallHealth = 'HEALTHY' | 'DEGRADED' | 'CRITICAL'
export type EventType = 'INTENT' | 'CONTRACT' | 'EVIDENCE' | 'WEBHOOK' | 'NOTIFICATION'

export interface DeliveryGuarantee {
  overall_health: OverallHealth
  delivery_sla_percent: number
  delivered_count: number
  total_count: number
  sla_target: number // e.g., 99.5
  sla_met: boolean
}

export interface RetryDiscipline {
  events_retrying: number
  max_attempts_seen: number
  max_attempts_allowed: number
  avg_retry_delay_ms: number
}

export interface EventBusStatus {
  service: string
  display_name: string
  health: EventBusHealth
  last_delivery_ago_seconds: number
  events_in_flight: number
  error_rate_percent: number
}

export interface BacklogBreakdown {
  pending: number
  retrying: number
  delivered: number
  failed: number
  dead_letter: number
}

export interface AtRiskEvent {
  outbox_id: string
  event_type: EventType
  target_service: string
  attempts: number
  max_attempts: number
  created_at: string
  last_attempt_at: string
  next_retry_at?: string
  error_message?: string
  tenant_id: string
  tenant_name: string
  intent_id?: string
  envelope_id?: string
  worm_ref?: string
}

export interface AuditMetrics {
  delivery_rate_24h: number
  max_retry_attempts: number
  event_finality_percent: number
  max_age_hours: number
  oldest_pending_age_minutes: number
}

export interface OutboxHealthResponse {
  // Primary KPIs
  delivery_guarantee: DeliveryGuarantee
  retry_discipline: RetryDiscipline
  
  // Event Bus Status
  event_bus_status: EventBusStatus[]
  last_delivery_seconds_ago: number
  
  // Backlog
  backlog: BacklogBreakdown
  
  // At-Risk Events (actionable)
  at_risk_events: AtRiskEvent[]
  
  // Audit metrics (compliance)
  audit_metrics: AuditMetrics
  
  // Timestamp
  as_of: string
}
